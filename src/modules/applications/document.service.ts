import { randomUUID } from 'node:crypto';
import type { ApplicationDocumentReference } from './application.types.js';
import { applicationStore } from './application.store.js';
import { deleteDocument, readDocument, writeDocument } from './document.storage.js';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set([
  'member-identity',
  'member-address-proof',
  'applicant-identity',
  'articles-of-organization',
  'operating-agreement',
  'ein-form',
  'ein-confirmation',
  'ss4',
]);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export class ApplicationDocumentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ApplicationDocumentError';
  }
}

function sanitizeFileName(fileName: string) {
  const baseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
  return baseName || 'document';
}

function inferMimeType(fileName: string) {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function matchesFileSignature(mimeType: string, data: Buffer) {
  if (mimeType === 'application/pdf') return data.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export async function uploadApplicationDocument(
  userId: string,
  applicationId: string,
  input: {
    documentType: string;
    ownerType: 'application' | 'member';
    ownerId?: string;
    fileName: string;
    mimeType: string;
    data: Buffer;
  },
) {
  const application = await applicationStore.findById(applicationId);
  if (!application || application.userId !== userId) return null;

  if (['paid', 'processing', 'completed', 'cancelled'].includes(application.status)) {
    throw new ApplicationDocumentError('APPLICATION_LOCKED', 'This application is locked and cannot receive documents.');
  }

  if (!ALLOWED_DOCUMENT_TYPES.has(input.documentType)) {
    throw new ApplicationDocumentError('INVALID_DOCUMENT_TYPE', 'This document type is not supported.');
  }

  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new ApplicationDocumentError('INVALID_FILE_TYPE', 'Only PDF, JPEG, PNG, and WebP files are supported.');
  }

  if (!input.data.length) {
    throw new ApplicationDocumentError('EMPTY_FILE', 'The uploaded file is empty.');
  }

  if (input.data.length > MAX_DOCUMENT_BYTES) {
    throw new ApplicationDocumentError('FILE_TOO_LARGE', 'Documents must be 10 MB or smaller.');
  }

  if (!matchesFileSignature(input.mimeType, input.data)) {
    throw new ApplicationDocumentError('INVALID_FILE_CONTENT', 'The uploaded file does not match its declared file type.');
  }

  if (input.ownerType === 'member') {
    if (!input.ownerId || !application.members.some((member) => member.id === input.ownerId)) {
      throw new ApplicationDocumentError('INVALID_MEMBER', 'The document owner is not a member of this application.');
    }
  } else if (input.ownerId) {
    throw new ApplicationDocumentError('INVALID_OWNER', 'Application documents cannot specify a member ownerId.');
  }

  const id = randomUUID();
  const fileName = sanitizeFileName(input.fileName);
  const storageKey = `${applicationId}/${id}-${fileName}`;

  try {
    await writeDocument(storageKey, input.data);
  } catch (error) {
    throw new ApplicationDocumentError(
      'DOCUMENT_STORAGE_FAILED',
      error instanceof Error ? `The document could not be saved: ${error.message}` : 'The document could not be saved.',
    );
  }

  const now = new Date().toISOString();
  const document: ApplicationDocumentReference = {
    id,
    documentType: input.documentType,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    fileName,
    storageKey,
    status: 'uploaded',
    createdAt: now,
    updatedAt: now,
  };

  const existingDocuments = application.documents ?? [];
  const replacedDocuments = existingDocuments.filter(
    (existing) => !(existing.documentType === input.documentType && existing.ownerType === input.ownerType && existing.ownerId === input.ownerId),
  );
  const replaced = existingDocuments.filter(
    (existing) => existing.documentType === input.documentType && existing.ownerType === input.ownerType && existing.ownerId === input.ownerId,
  );
  let updatedApplication;
  try {
    updatedApplication = await applicationStore.update(applicationId, {
      documents: [...replacedDocuments, document],
      updatedAt: now,
    });
  } catch (error) {
    await deleteDocument(storageKey);
    throw new ApplicationDocumentError(
      'DOCUMENT_PERSISTENCE_FAILED',
      error instanceof Error ? `The document was saved but could not be attached to the application: ${error.message}` : 'The document was saved but could not be attached to the application.',
    );
  }

  if (!updatedApplication) {
    await deleteDocument(storageKey);
    return null;
  }

  await Promise.all(replaced.map((oldDocument) => deleteDocument(oldDocument.storageKey)));
  return updatedApplication;
}

export async function getApplicationDocument(userId: string, applicationId: string, documentId: string) {
  const application = await applicationStore.findById(applicationId);
  if (!application || application.userId !== userId) return null;

  const document = (application.documents ?? []).find((item) => item.id === documentId);
  if (!document || document.status === 'rejected') return null;

  let data: Buffer;
  try {
    data = await readDocument(document.storageKey);
  } catch {
    throw new ApplicationDocumentError('DOCUMENT_UNAVAILABLE', 'The document is currently unavailable.');
  }

  return { document, data, mimeType: inferMimeType(document.fileName) };
}
