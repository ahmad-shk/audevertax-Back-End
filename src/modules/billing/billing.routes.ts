import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { createOrderController, getBillingController, payController } from './billing.controller.js';

export const billingRoutes = Router();

billingRoutes.use(requireAuth);
billingRoutes.get('/:applicationId', getBillingController);
billingRoutes.post('/:applicationId/order', createOrderController);
billingRoutes.post('/:applicationId/payment', payController);
