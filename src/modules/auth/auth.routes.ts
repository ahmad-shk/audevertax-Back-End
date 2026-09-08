import { Router } from 'express';
import { currentUser, googleLoginUser, loginUser, logoutUser, registerUser, resendVerificationEmailUser, verifyEmailUser } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', registerUser);
authRouter.post('/verify-email', verifyEmailUser);
authRouter.post('/resend-verification', resendVerificationEmailUser);
authRouter.post('/login', loginUser);
authRouter.post('/google', googleLoginUser);
authRouter.post('/logout', logoutUser);
authRouter.get('/me', currentUser);
