import type { Request, Response } from 'express';
import { ApplicationDocumentError, getApplicationDocument, uploadApplicationDocument } from './document.service.js';

function getUserId(res: Response) {
  return res.locals.user?.id as string;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function uploadApplicationDocumentController(req: Request, res: Response) {
  const documentType = req.header('x-document-type');
  const ownerType = req.header('x-document-owner-type') ?? 'application';
  const ownerId = req.header('x-document-owner-id') ?? undefined;
  const fileName = req.header('x-file-name');
  const mimeType = req.header('content-type');
  const applicationId = getParam(req.params.id);

  if (!documentType || !fileName || !mimeType || !applicationId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_DOCUMENT_REQUEST', message: 'Document type, file name, content type, and application ID are required.' } });
    return;
  }

  if (ownerType !== 'application' && ownerType !== 'member') {
    res.status(400).json({ success: false, error: { code: 'INVALID_OWNER_TYPE', message: 'owner type must be application or member.' } });
    return;
  }

  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

  try {
    const application = await uploadApplicationDocument(getUserId(res), applicationId, {
      documentType,
      ownerType,
      ownerId,
      fileName,
      mimeType,
      data,
    });

    if (!application) {
      res.status(404).json({ success: false, error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' } });
      return;
    }

    const document = application.documents[application.documents.length - 1];
    res.status(201).json({ success: true, data: { document } });
  } catch (error) {
    if (error instanceof ApplicationDocumentError) {
      res.status(400).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

export async function getApplicationDocumentController(req: Request, res: Response) {
  const applicationId = getParam(req.params.id);
  const documentId = getParam(req.params.documentId);
  if (!applicationId || !documentId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_DOCUMENT_ID', message: 'Application ID and document ID are required.' } });
    return;
  }

  try {
    const result = await getApplicationDocument(getUserId(res), applicationId, documentId);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' } });
      return;
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename=\"${result.document.fileName.replace(/\"/g, '')}\"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(result.data);
  } catch (error) {
    if (error instanceof ApplicationDocumentError) {
      res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}
