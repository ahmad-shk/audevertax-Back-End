export const APPLICATION_STATUSES = [
  'draft',
  'in_review',
  'ready_for_payment',
  'paid',
  'processing',
  'completed',
  'cancelled',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  userId: string;
  serviceSlug: string;
  packageSlug?: string;
  formationState?: string;
  currentStep: number;
  answers: Record<string, unknown>;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationInput {
  serviceSlug: string;
  packageSlug?: string;
  formationState?: string;
  currentStep?: number;
  answers?: Record<string, unknown>;
}

export interface UpdateApplicationInput {
  packageSlug?: string;
  formationState?: string;
  currentStep?: number;
  answers?: Record<string, unknown>;
  status?: ApplicationStatus;
}
