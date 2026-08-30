import { randomUUID } from 'node:crypto';
import { applicationStore } from './application.store.js';
import type { Application, ApplicationStatus, CreateApplicationInput, UpdateApplicationInput } from './application.types.js';

const CUSTOMER_EDIT_LOCKED_STATUSES: ApplicationStatus[] = ['paid', 'processing', 'completed', 'cancelled'];

const ALLOWED_CUSTOMER_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['draft', 'in_review', 'ready_for_payment'],
  in_review: ['in_review', 'ready_for_payment'],
  ready_for_payment: ['ready_for_payment'],
  paid: [],
  processing: [],
  completed: [],
  cancelled: [],
};

export class ApplicationLifecycleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ApplicationLifecycleError';
  }
}

export async function listApplications(userId: string) {
  return applicationStore.listByUser(userId);
}

export async function getApplication(userId: string, id: string) {
  const application = await applicationStore.findById(id);
  if (!application || application.userId !== userId) return null;
  return application;
}

export async function createApplication(userId: string, input: CreateApplicationInput) {
  const now = new Date().toISOString();
  const application: Application = {
    id: randomUUID(),
    userId,
    serviceSlug: input.serviceSlug,
    packageSlug: input.packageSlug,
    formationState: input.formationState,
    currentStep: input.currentStep ?? 0,
    answers: input.answers ?? {},
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  return applicationStore.create(application);
}

export async function updateApplication(userId: string, id: string, input: UpdateApplicationInput) {
  const application = await getApplication(userId, id);
  if (!application) return null;

  if (CUSTOMER_EDIT_LOCKED_STATUSES.includes(application.status)) {
    throw new ApplicationLifecycleError('APPLICATION_LOCKED', 'This application is locked and cannot be edited.');
  }

  if (input.status !== undefined) {
    if (input.status === 'paid') {
      throw new ApplicationLifecycleError('INVALID_STATUS_TRANSITION', 'Applications can only become paid through the billing flow.');
    }

    const allowed = ALLOWED_CUSTOMER_TRANSITIONS[application.status];
    if (!allowed.includes(input.status)) {
      throw new ApplicationLifecycleError(
        'INVALID_STATUS_TRANSITION',
        `Cannot change application status from ${application.status} to ${input.status}.`,
      );
    }
  }

  return applicationStore.update(id, { ...input, updatedAt: new Date().toISOString() });
}

/** Billing-owned transition. Customer application updates cannot grant paid status. */
export async function markApplicationPaid(userId: string, id: string) {
  const application = await getApplication(userId, id);
  if (!application) return null;

  if (application.status === 'paid') {
    throw new ApplicationLifecycleError('ALREADY_PAID', 'This application has already been paid.');
  }

  if (application.status !== 'ready_for_payment') {
    throw new ApplicationLifecycleError(
      'INVALID_PAYMENT_STATE',
      `Application must be ready_for_payment before payment can be completed. Current status: ${application.status}.`,
    );
  }

  return applicationStore.update(id, { status: 'paid', updatedAt: new Date().toISOString() });
}

export async function deleteApplication(userId: string, id: string) {
  const application = await getApplication(userId, id);
  if (!application) return false;

  if (CUSTOMER_EDIT_LOCKED_STATUSES.includes(application.status)) {
    throw new ApplicationLifecycleError('APPLICATION_LOCKED', 'Paid or completed applications cannot be deleted.');
  }

  return applicationStore.remove(id);
}
