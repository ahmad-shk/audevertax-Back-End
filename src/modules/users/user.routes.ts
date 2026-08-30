import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { currentUser } from './user.controller.js';

export const userRouter = Router();

userRouter.get('/me', requireAuth, currentUser);
