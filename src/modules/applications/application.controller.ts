import type { Request, Response } from 'express';
import { ApplicationLifecycleError, createApplication, deleteApplication, getApplication, listApplications, updateApplication } from './application.service.js';
import { APPLICATION_STATUSES, type CreateApplicationInput, type UpdateApplicationInput } from './application.types.js';

function getUserId(res: Response) {
  return res.locals.user?.id as string;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function listApplicationsController(_req: Request, res: Response) {
  const applications = await listApplications(getUserId(res));
  res.json({ success: true, data: { applications } });
}

export async function getApplicationController(req: Request, res: Response) {
  const applicationId = getParam(req.params.id);
  if (!applicationId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_APPLICATION_ID', message: 'Application ID is required.' } });
    return;
  }

  const application = await getApplication(getUserId(res), applicationId);

  if (!application) {
    res.status(404).json({ success: false, error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' } });
    return;
  }

  res.json({ success: true, data: { application } });
}

export async function createApplicationController(req: Request, res: Response) {
  const body = req.body as Partial<CreateApplicationInput>;

  if (!body.serviceSlug || typeof body.serviceSlug !== 'string') {
    res.status(400).json({ success: false, error: { code: 'INVALID_SERVICE', message: 'serviceSlug is required.' } });
    return;
  }

  try {
    const application = await createApplication(getUserId(res), body as CreateApplicationInput);
    res.status(201).json({ success: true, data: { application } });
  } catch (error) {
    if (error instanceof ApplicationLifecycleError) {
      res.status(400).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

export async function updateApplicationController(req: Request, res: Response) {
  const body = req.body as UpdateApplicationInput;
  const applicationId = getParam(req.params.id);

  if (!applicationId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_APPLICATION_ID', message: 'Application ID is required.' } });
    return;
  }

  if (body.status !== undefined && !APPLICATION_STATUSES.includes(body.status)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Invalid application status.' } });
    return;
  }

  try {
    const application = await updateApplication(getUserId(res), applicationId, body);

    if (!application) {
      res.status(404).json({ success: false, error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' } });
      return;
    }

    res.json({ success: true, data: { application } });
  } catch (error) {
    if (error instanceof ApplicationLifecycleError) {
      res.status(409).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

export async function deleteApplicationController(req: Request, res: Response) {
  const applicationId = getParam(req.params.id);
  if (!applicationId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_APPLICATION_ID', message: 'Application ID is required.' } });
    return;
  }

  try {
    const deleted = await deleteApplication(getUserId(res), applicationId);

    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' } });
      return;
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ApplicationLifecycleError) {
      res.status(409).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}
