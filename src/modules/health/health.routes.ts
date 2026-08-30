import { Router } from 'express';
import { env } from '../../config/env.js';

export const healthRoutes = Router();

healthRoutes.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      storage: env.STORAGE_DRIVER,
    },
  });
});
