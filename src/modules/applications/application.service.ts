import { randomUUID } from 'node:crypto';
import { applicationStore } from './application.store.js';
import { calculateBillingPricing } from '../billing/billing.pricing.js';
import { findOrder } from '../billing/billing.store.js';
import { getCommercialService } from '../commercial/commercial.catalog.js';
import { deleteDocument } from './document.storage.js';
import type { Application, ApplicationMember, ApplicationStatus, CreateApplicationInput, UpdateApplicationInput } from './application.types.js';

const CUSTOMER_EDIT_LOCKED_STATUSES: ApplicationStatus[] = ['paid', 'processing', 'completed', 'cancelled'];
const ALLOWED_CUSTOMER_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = { draft: ['draft', 'in_review', 'ready_for_payment'], in_review: ['in_review', 'ready_for_payment'], ready_for_payment: ['ready_for_payment'], paid: [], processing: [], completed: [], cancelled: [] };
const USA_BUSINESS_ACTIVITIES = new Set(['ecommerce', 'saas', 'agency', 'consulting', 'trading', 'other']);
const USA_COMPANY_TYPES = new Set(['single_member_llc', 'multi_member_llc']);

export class ApplicationLifecycleError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'ApplicationLifecycleError'; } }
export async function listApplications(userId: string) { return applicationStore.listByUser(userId); }
export async function getApplication(userId: string, id: string) { const application = await applicationStore.findById(id); if (!application || application.userId !== userId) return null; return application; }

function validateCommercialSelection(input: Pick<CreateApplicationInput, 'serviceSlug' | 'packageSlug' | 'formationState' | 'variantSlug' | 'addOnSlugs'>) {
  const service = getCommercialService(input.serviceSlug);
  if (!service) throw new ApplicationLifecycleError('INVALID_SERVICE', `Unknown service: ${input.serviceSlug}.`);
  if (service.variants?.length) {
    const selectedVariant = input.variantSlug ? service.variants.find((item) => item.variantSlug === input.variantSlug) : undefined;
    if (!selectedVariant) throw new ApplicationLifecycleError('INVALID_VARIANT', `A valid ${service.name} variant is required.`);
    if (input.packageSlug || input.formationState || input.addOnSlugs?.length) throw new ApplicationLifecycleError('INVALID_COMMERCIAL_SELECTION', 'This service does not accept packages, jurisdictions, or add-ons.');
    if (!calculateBillingPricing(input.serviceSlug, undefined, undefined, [], selectedVariant.variantSlug)) throw new ApplicationLifecycleError('INVALID_COMMERCIAL_SELECTION', 'The selected service variant is not available.');
    return;
  }
  if (input.variantSlug) throw new ApplicationLifecycleError('INVALID_VARIANT', `Service ${input.serviceSlug} does not support variants.`);
  if (service.packages?.length && !input.packageSlug) throw new ApplicationLifecycleError('INVALID_PACKAGE', 'A service package is required.');
  if (input.packageSlug && !service.packages!.some((item) => item.slug === input.packageSlug)) throw new ApplicationLifecycleError('INVALID_PACKAGE', 'The selected package is not available.');
  if (service.slug === 'usa-llc' && !input.formationState) throw new ApplicationLifecycleError('INVALID_JURISDICTION', 'A USA LLC formation state is required.');
  if (input.formationState && !service.jurisdictions?.some((item) => item.slug === input.formationState)) throw new ApplicationLifecycleError('INVALID_JURISDICTION', 'The selected jurisdiction is not available.');
  for (const slug of new Set(input.addOnSlugs ?? [])) if (!service.addOns?.some((item) => item.slug === slug)) throw new ApplicationLifecycleError('INVALID_ADD_ON', 'The selected add-on is not available.');
  if (!calculateBillingPricing(input.serviceSlug, input.packageSlug, input.formationState, input.addOnSlugs ?? [])) throw new ApplicationLifecycleError('INVALID_COMMERCIAL_SELECTION', 'The selected commercial options are not available.');
}

function hasAnswer(application: Application, key: string) { const value = application.answers[key]; return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0); }

function validateUsaMembers(application: Application, companyType: string) {
  const members = application.members ?? [];
  if (!members.length) throw new ApplicationLifecycleError('MISSING_MEMBER', 'At least one company member is required before submitting a USA LLC application.');
  if (companyType === 'single_member_llc' && members.length !== 1) throw new ApplicationLifecycleError('INVALID_MEMBER_STRUCTURE', 'A single-member LLC must contain exactly one company member.');
  if (companyType === 'multi_member_llc' && members.length < 2) throw new ApplicationLifecycleError('INVALID_MEMBER_STRUCTURE', 'A multi-member LLC must contain at least two company members.');

  let ownershipTotal = 0;
  for (const [index, member] of members.entries()) {
    const prefix = `Member ${index + 1}`;
    if (!member.id || typeof member.id !== 'string') throw new ApplicationLifecycleError('INVALID_MEMBER_DATA', `${prefix} is missing a valid member ID.`);
    if (!member.fullName?.trim()) throw new ApplicationLifecycleError('INVALID_MEMBER_DATA', `${prefix} must have a full legal name.`);
    if (!member.country?.trim()) throw new ApplicationLifecycleError('INVALID_MEMBER_DATA', `${prefix} must have a country of residence.`);
    if (!member.dateOfBirth?.trim()) throw new ApplicationLifecycleError('INVALID_MEMBER_DATA', `${prefix} must have a date of birth.`);
    if (!member.address?.trim()) throw new ApplicationLifecycleError('INVALID_MEMBER_DATA', `${prefix} must have a residential address.`);
    if (typeof member.ownershipPercentage !== 'number' || !Number.isFinite(member.ownershipPercentage) || member.ownershipPercentage < 1 || member.ownershipPercentage > 100) throw new ApplicationLifecycleError('INVALID_MEMBER_DATA', `${prefix} must have an ownership percentage between 1 and 100.`);
    ownershipTotal += member.ownershipPercentage;
  }

  if (Math.abs(ownershipTotal - 100) > 0.01) throw new ApplicationLifecycleError('INVALID_OWNERSHIP', 'Company member ownership percentages must total 100%.');
}

function normalizeUsaMemberLifecycle(application: Application, incomingMembers: ApplicationMember[]) {
  const existingById = new Map((application.members ?? []).map((member) => [member.id, member]));
  const seenIds = new Set<string>();
  const invalidatedMemberIds = new Set<string>();
  const members = incomingMembers.map((member) => {
    let id = typeof member.id === 'string' && member.id ? member.id : randomUUID();
    const existing = existingById.get(id);
    const duplicateId = seenIds.has(id);
    const identityChanged = Boolean(existing && (
      existing.fullName.trim() !== member.fullName.trim() ||
      (existing.country ?? '') !== (member.country ?? '') ||
      (existing.dateOfBirth ?? '') !== (member.dateOfBirth ?? '')
    ));
    if (duplicateId || identityChanged) {
      if (existing) invalidatedMemberIds.add(existing.id);
      id = randomUUID();
    }
    seenIds.add(id);
    return { ...member, id };
  });

  for (const existing of application.members ?? []) if (!seenIds.has(existing.id)) invalidatedMemberIds.add(existing.id);

  const staleDocuments = (application.documents ?? []).filter((document) => document.ownerType === 'member' && document.ownerId && invalidatedMemberIds.has(document.ownerId));
  const documents = (application.documents ?? []).filter((document) => !staleDocuments.some((stale) => stale.id === document.id));
  return { members, documents, staleDocuments };
}

function validateRequiredApplicationData(application: Application) {
  const requiredByService: Record<string, string[]> = {
    'usa-llc': ['business_name', 'business_activity', 'business_description', 'email', 'phone', 'whatsapp', 'owner_full_name', 'owner_country', 'owner_date_of_birth', 'owner_ownership_percentage', 'residential_address', 'residential_city', 'residential_state', 'residential_postal_code', 'residential_country', 'company_type'],
    'uk-ltd': ['business_activity', 'business_description', 'director_full_name', 'director_country', 'director_date_of_birth', 'preferred_company_name', 'share_structure'],
    'itin-processing': ['legal_full_name', 'email', 'phone', 'whatsapp', 'articles_available', 'ein_form_available'],
    'ein-without-ssn': ['legal_full_name', 'email', 'phone', 'whatsapp', 'formation_document_type'],
  };
  for (const key of requiredByService[application.serviceSlug] ?? []) if (!hasAnswer(application, key)) throw new ApplicationLifecycleError('MISSING_APPLICATION_DATA', `Required application information is missing: ${key}.`);
  if (application.serviceSlug === 'usa-llc') {
    const companyType = application.answers.company_type;
    if (typeof application.answers.business_activity !== 'string' || !USA_BUSINESS_ACTIVITIES.has(application.answers.business_activity)) throw new ApplicationLifecycleError('INVALID_APPLICATION_DATA', 'A valid USA business activity is required.');
    if (typeof companyType !== 'string' || !USA_COMPANY_TYPES.has(companyType)) throw new ApplicationLifecycleError('INVALID_APPLICATION_DATA', 'A valid USA company type is required.');
    validateUsaMembers(application, companyType);
    if (application.formationState !== application.answers.formation_state && application.answers.formation_state !== undefined) throw new ApplicationLifecycleError('INVALID_JURISDICTION', 'The formation state must match the selected commercial jurisdiction.');
  }
}

function validateRequiredDocuments(application: Application) {
  const uploaded = (documentType: string, ownerId?: string) => application.documents.some((document) => document.documentType === documentType && document.status !== 'rejected' && (ownerId ? document.ownerType === 'member' && document.ownerId === ownerId : document.ownerType === 'application'));
  if (application.serviceSlug === 'usa-llc') {
    if (!application.members.length) throw new ApplicationLifecycleError('MISSING_MEMBER', 'At least one company member is required before submitting a USA LLC application.');
    for (const member of application.members) if (!uploaded('member-identity', member.id) || !uploaded('member-address-proof', member.id)) throw new ApplicationLifecycleError('MISSING_DOCUMENT', 'Identity and address documents are required for every company member before submitting.');
  }
  if (application.serviceSlug === 'itin-processing' && !uploaded('applicant-identity')) throw new ApplicationLifecycleError('MISSING_DOCUMENT', 'A scanned passport is required before submitting an ITIN application.');
  if (application.serviceSlug === 'ein-without-ssn') { const selectedType = application.answers.formation_document_type; const requiredType = selectedType === 'ss4' ? 'ss4' : selectedType === 'articles' ? 'articles-of-organization' : undefined; if (!requiredType) throw new ApplicationLifecycleError('MISSING_DOCUMENT', 'Select whether you will provide Articles of Organization or SS-4 before submitting.'); if (!uploaded(requiredType)) throw new ApplicationLifecycleError('MISSING_DOCUMENT', `The selected ${selectedType === 'ss4' ? 'SS-4' : 'Articles of Organization'} document is required before submitting.`); }
}

export async function createApplication(userId: string, input: CreateApplicationInput) { validateCommercialSelection(input); const now = new Date().toISOString(); const application: Application = { id: randomUUID(), userId, serviceSlug: input.serviceSlug, packageSlug: input.packageSlug, formationState: input.formationState, variantSlug: input.variantSlug, addOnSlugs: input.addOnSlugs ?? [], members: input.members ?? [], documents: input.documents ?? [], currentStep: input.currentStep ?? 0, answers: input.answers ?? {}, status: 'draft', createdAt: now, updatedAt: now }; return applicationStore.create(application); }
export async function updateApplication(userId: string, id: string, input: UpdateApplicationInput) { const application = await getApplication(userId, id); if (!application) return null; if (CUSTOMER_EDIT_LOCKED_STATUSES.includes(application.status)) throw new ApplicationLifecycleError('APPLICATION_LOCKED', 'This application is locked and cannot be edited.'); if (input.status !== undefined) { if (input.status === 'paid') throw new ApplicationLifecycleError('INVALID_STATUS_TRANSITION', 'Applications can only become paid through the billing flow.'); const allowed = ALLOWED_CUSTOMER_TRANSITIONS[application.status]; if (!allowed.includes(input.status)) throw new ApplicationLifecycleError('INVALID_STATUS_TRANSITION', `Cannot change application status from ${application.status} to ${input.status}.`); }
  const existingOrder = await findOrder(id, userId);
  if (existingOrder?.status === 'pending') {
    const commercialChanged = (input.packageSlug !== undefined && input.packageSlug !== application.packageSlug) ||
      (input.formationState !== undefined && input.formationState !== application.formationState) ||
      (input.variantSlug !== undefined && input.variantSlug !== application.variantSlug) ||
      (input.addOnSlugs !== undefined && JSON.stringify(input.addOnSlugs) !== JSON.stringify(application.addOnSlugs ?? []));
    if (commercialChanged) throw new ApplicationLifecycleError('BILLING_ORDER_LOCKED', 'The commercial selection cannot be changed while a pending billing order exists. Cancel or recreate the order before changing package, jurisdiction, variant, or add-ons.');
  }
  const mergedSelection = { serviceSlug: application.serviceSlug, packageSlug: input.packageSlug ?? application.packageSlug, formationState: input.formationState ?? application.formationState, variantSlug: input.variantSlug ?? application.variantSlug, addOnSlugs: input.addOnSlugs ?? application.addOnSlugs }; validateCommercialSelection(mergedSelection); let normalizedMembers = input.members; let normalizedDocuments = input.documents; let staleDocuments: Application['documents'] = []; if (application.serviceSlug === 'usa-llc' && input.members !== undefined) { const normalized = normalizeUsaMemberLifecycle(application, input.members); normalizedMembers = normalized.members; staleDocuments = normalized.staleDocuments; if (input.documents === undefined) normalizedDocuments = normalized.documents; else normalizedDocuments = input.documents.filter((document) => document.ownerType !== 'member' || !document.ownerId || normalized.members.some((member) => member.id === document.ownerId)); } const mergedApplication = { ...application, ...input, ...(normalizedMembers !== undefined ? { members: normalizedMembers } : {}), ...(normalizedDocuments !== undefined ? { documents: normalizedDocuments } : {}) } as Application; if (input.status === 'ready_for_payment') { validateRequiredApplicationData(mergedApplication); validateRequiredDocuments(mergedApplication); } const updated = await applicationStore.update(id, { ...input, ...(normalizedMembers !== undefined ? { members: normalizedMembers } : {}), ...(normalizedDocuments !== undefined ? { documents: normalizedDocuments } : {}), updatedAt: new Date().toISOString() }); if (updated && staleDocuments.length) await Promise.all(staleDocuments.map((document) => deleteDocument(document.storageKey).catch(() => undefined))); return updated; }
export async function markApplicationPaid(userId: string, id: string) { const application = await getApplication(userId, id); if (!application) return null; if (application.status === 'paid') throw new ApplicationLifecycleError('ALREADY_PAID', 'This application has already been paid.'); if (application.status !== 'ready_for_payment') throw new ApplicationLifecycleError('INVALID_PAYMENT_STATE', `Application must be ready_for_payment before payment can be completed. Current status: ${application.status}.`); return applicationStore.update(id, { status: 'paid', updatedAt: new Date().toISOString() }); }
export async function deleteApplication(userId: string, id: string) { const application = await getApplication(userId, id); if (!application) return false; if (CUSTOMER_EDIT_LOCKED_STATUSES.includes(application.status)) throw new ApplicationLifecycleError('APPLICATION_LOCKED', 'Paid or completed applications cannot be deleted.'); return applicationStore.remove(id); }
