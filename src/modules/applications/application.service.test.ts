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

  it('creates an application for the authenticated user', async () => {
    const application = await createApplication(userA, { serviceSlug: 'usa-llc' });
    expect(application.userId).toBe(userA);
    expect(application.serviceSlug).toBe('usa-llc');
    expect(application.status).toBe('draft');
  });

  it('lists only the authenticated user applications', async () => {
    const own = await createApplication(userA, { serviceSlug: 'usa-llc' });
    await createApplication(userB, { serviceSlug: 'uk-ltd' });

    const applications = await listApplications(userA);
    expect(applications).toHaveLength(1);
    expect(applications[0].id).toBe(own.id);
  });

  it('prevents one user from accessing another user application', async () => {
    const application = await createApplication(userA, { serviceSlug: 'usa-llc' });
    expect(await getApplication(userB, application.id)).toBeNull();
  });

  it('updates an application owned by the authenticated user', async () => {
    const application = await createApplication(userA, { serviceSlug: 'usa-llc' });
    const updated = await updateApplication(userA, application.id, {
      currentStep: 3,
      status: 'in_review',
      answers: { company_name: 'Example LLC' },
    });

    expect(updated?.currentStep).toBe(3);
    expect(updated?.status).toBe('in_review');
    expect(updated?.answers.company_name).toBe('Example LLC');
  });

  it('does not update another user application', async () => {
    const application = await createApplication(userA, { serviceSlug: 'usa-llc' });
    expect(await updateApplication(userB, application.id, { currentStep: 9 })).toBeNull();
  });

  it('deletes only an application owned by the authenticated user', async () => {
    const application = await createApplication(userA, { serviceSlug: 'usa-llc' });
    expect(await deleteApplication(userB, application.id)).toBe(false);
    expect(await getApplication(userA, application.id)).not.toBeNull();
    expect(await deleteApplication(userA, application.id)).toBe(true);
    expect(await getApplication(userA, application.id)).toBeNull();
  });
});
