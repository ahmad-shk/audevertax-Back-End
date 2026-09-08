import express, { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createApplicationController,
  deleteApplicationController,
  getApplicationController,
  listApplicationsController,
  updateApplicationController,
} from './application.controller.js';
import { getApplicationDocumentController, uploadApplicationDocumentController } from './document.controller.js';

export const applicationRoutes = Router();

applicationRoutes.use(requireAuth);
applicationRoutes.get('/', listApplicationsController);
applicationRoutes.post('/', createApplicationController);
applicationRoutes.get('/:id', getApplicationController);
applicationRoutes.patch('/:id', updateApplicationController);
applicationRoutes.get('/:id/documents/:documentId', getApplicationDocumentController);
applicationRoutes.post(
  '/:id/documents',
  express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }),
  uploadApplicationDocumentController,
);
applicationRoutes.delete('/:id', deleteApplicationController);
