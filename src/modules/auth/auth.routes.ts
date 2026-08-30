import { Router } from 'express';
import { currentUser, googleLoginUser, loginUser, logoutUser, registerUser } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', registerUser);
authRouter.post('/login', loginUser);
authRouter.post('/google', googleLoginUser);
authRouter.post('/logout', logoutUser);
authRouter.get('/me', currentUser);
