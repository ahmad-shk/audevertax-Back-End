import type { Request, Response } from 'express';
import { ApplicationLifecycleError } from '../applications/application.service.js';
import { createBillingOrder, getBilling, markPaymentPaid } from './billing.service.js';

function userId(res: Response) {
  return res.locals.user?.id as string | undefined;
}

export async function getBillingController(req: Request, res: Response) {
  const id = userId(res);
  if (!id) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });

  const applicationId = req.params.applicationId;
  if (!applicationId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_APPLICATION_ID', message: 'Application ID is required.' } });
  }

  const billing = await getBilling(id, String(applicationId));
  if (!billing) {
    return res.status(404).json({ success: false, error: { code: 'BILLING_NOT_FOUND', message: 'Billing information is not available for this application.' } });
  }

  return res.json({ success: true, data: billing });
}

export async function createOrderController(req: Request, res: Response) {
  const id = userId(res);
  if (!id) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });

  const applicationId = req.params.applicationId;
  if (!applicationId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_APPLICATION_ID', message: 'Application ID is required.' } });
  }

  const order = await createBillingOrder(id, String(applicationId));
  if (!order) return res.status(409).json({ success: false, error: { code: 'ORDER_UNAVAILABLE', message: 'This application is not ready for payment.' } });
  return res.status(201).json({ success: true, data: order });
}

export async function payController(req: Request, res: Response) {
  const id = userId(res);
  if (!id) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });

  const applicationId = req.params.applicationId;
  if (!applicationId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_APPLICATION_ID', message: 'Application ID is required.' } });
  }

  const existing = await getBilling(id,  String(applicationId));
  if (existing?.status === 'paid') {
    return res.status(409).json({ success: false, error: { code: 'ALREADY_PAID', message: 'This application has already been paid.' } });
  }

  try {
    const order = await markPaymentPaid(id, String(applicationId));
    if (!order) return res.status(409).json({ success: false, error: { code: 'PAYMENT_UNAVAILABLE', message: 'This application is not ready for payment or no pending billing order exists.' } });
    return res.json({ success: true, data: order });
  } catch (error) {
    if (error instanceof ApplicationLifecycleError) {
      const status = error.code === 'ALREADY_PAID' ? 409 : 409;
      return res.status(status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    throw error;
  }
}
