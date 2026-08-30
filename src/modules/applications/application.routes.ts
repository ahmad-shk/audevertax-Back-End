import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createApplicationController,
  deleteApplicationController,
  getApplicationController,
  listApplicationsController,
  updateApplicationController,
} from './application.controller.js';

export const applicationRoutes = Router();

applicationRoutes.use(requireAuth);
applicationRoutes.get('/', listApplicationsController);
applicationRoutes.post('/', createApplicationController);
applicationRoutes.get('/:id', getApplicationController);
applicationRoutes.patch('/:id', updateApplicationController);
applicationRoutes.delete('/:id', deleteApplicationController);
