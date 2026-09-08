import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applicationStore } from './application.store.js';
import { createApplication, getApplication, listApplications, updateApplication, deleteApplication } from './application.service.js';

describe('application service', () => {
  const userA = randomUUID();
  const userB = randomUUID();

  beforeEach(async () => {
    const existingA = await applicationStore.listByUser(userA);
    const existingB = await applicationStore.listByUser(userB);
    for (const application of [...existingA, ...existingB]) {
      await applicationStore.remove(application.id);
    }
  });

  const usaSelection = { serviceSlug: 'usa-llc', packageSlug: 'basic', formationState: 'wyoming' } as const;

  it('creates an application for the authenticated user', async () => {
    const application = await createApplication(userA, usaSelection);
    expect(application.userId).toBe(userA);
    expect(application.serviceSlug).toBe('usa-llc');
    expect(application.status).toBe('draft');
  });

  it('lists only the authenticated user applications', async () => {
    const own = await createApplication(userA, usaSelection);
    await createApplication(userB, { serviceSlug: 'uk-ltd', packageSlug: 'standard' });

    const applications = await listApplications(userA);
    expect(applications).toHaveLength(1);
    expect(applications[0].id).toBe(own.id);
  });

  it('prevents one user from accessing another user application', async () => {
    const application = await createApplication(userA, usaSelection);
    expect(await getApplication(userB, application.id)).toBeNull();
  });

  it('updates an application owned by the authenticated user', async () => {
    const application = await createApplication(userA, usaSelection);
    const updated = await updateApplication(userA, application.id, {
      currentStep: 3,
      answers: { company_name: 'Example LLC' },
    });

    expect(updated?.currentStep).toBe(3);
    expect(updated?.status).toBe('draft');
    expect(updated?.answers.company_name).toBe('Example LLC');
  });

  it('does not update another user application', async () => {
    const application = await createApplication(userA, usaSelection);
    expect(await updateApplication(userB, application.id, { currentStep: 9 })).toBeNull();
  });

  it('removes documents belonging to members removed from a USA LLC application', async () => {
    const ownerId = randomUUID();
    const removedId = randomUUID();
    const retainedId = randomUUID();
    const application = await createApplication(userA, usaSelection);
    await updateApplication(userA, application.id, {
      members: [
        { id: ownerId, fullName: 'Owner One', country: 'Pakistan', dateOfBirth: '1990-01-01', ownershipPercentage: 40, address: 'Address One' },
        { id: removedId, fullName: 'Owner Two', country: 'Pakistan', dateOfBirth: '1991-01-01', ownershipPercentage: 30, address: 'Address Two' },
        { id: retainedId, fullName: 'Owner Three', country: 'Pakistan', dateOfBirth: '1992-01-01', ownershipPercentage: 30, address: 'Address Three' },
      ],
      documents: [
        { id: randomUUID(), documentType: 'member-identity', ownerType: 'member', ownerId: ownerId, fileName: 'owner-one.pdf', storageKey: 'one', status: 'uploaded', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: randomUUID(), documentType: 'member-identity', ownerType: 'member', ownerId: removedId, fileName: 'owner-two.pdf', storageKey: 'two', status: 'uploaded', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: randomUUID(), documentType: 'member-identity', ownerType: 'member', ownerId: retainedId, fileName: 'owner-three.pdf', storageKey: 'three', status: 'uploaded', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ],
    });

    const updated = await updateApplication(userA, application.id, {
      members: [
        { id: ownerId, fullName: 'Owner One', country: 'Pakistan', dateOfBirth: '1990-01-01', ownershipPercentage: 50, address: 'Address One' },
        { id: retainedId, fullName: 'Owner Three', country: 'Pakistan', dateOfBirth: '1992-01-01', ownershipPercentage: 50, address: 'Address Three' },
      ],
    });

    expect(updated?.members.map((member) => member.id)).toEqual([ownerId, retainedId]);
    expect(updated?.documents.map((document) => document.ownerId)).toEqual([ownerId, retainedId]);
  });

  it('invalidates a member identity and its documents when the member identity changes', async () => {
    const memberId = randomUUID();
    const application = await createApplication(userA, usaSelection);
    await updateApplication(userA, application.id, {
      members: [{ id: memberId, fullName: 'Original Name', country: 'Pakistan', dateOfBirth: '1990-01-01', ownershipPercentage: 100, address: 'Address' }],
      documents: [{ id: randomUUID(), documentType: 'member-identity', ownerType: 'member', ownerId: memberId, fileName: 'identity.pdf', storageKey: 'identity', status: 'uploaded', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    });

    const updated = await updateApplication(userA, application.id, {
      members: [{ id: memberId, fullName: 'Changed Name', country: 'Pakistan', dateOfBirth: '1990-01-01', ownershipPercentage: 100, address: 'Address' }],
    });

    expect(updated?.members[0].id).not.toBe(memberId);
    expect(updated?.documents).toHaveLength(0);
  });

  it('deletes only an application owned by the authenticated user', async () => {
    const application = await createApplication(userA, usaSelection);
    expect(await deleteApplication(userB, application.id)).toBe(false);
    expect(await getApplication(userA, application.id)).not.toBeNull();
    expect(await deleteApplication(userA, application.id)).toBe(true);
    expect(await getApplication(userA, application.id)).toBeNull();
  });
});
