import type { Request, Response } from 'express';
import { googleSchema, loginSchema, registerSchema, verifyEmailSchema } from './auth.schemas.js';
import { getUserFromSession, login, loginWithGoogle, logout, register, resendVerificationEmail, SESSION_COOKIE, verifyEmail } from './auth.service.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function registerUser(req: Request, res: Response) {
  const result = await register(registerSchema.parse(req.body));
  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      verificationRequired: result.verificationRequired,
      message: 'Account created. Please verify your email to continue.',
    },
  });
}

export async function verifyEmailUser(req: Request, res: Response) {
  const result = await verifyEmail(verifyEmailSchema.parse(req.body).token);
  res.json({
    success: true,
    data: {
      user: result.user,
      message: 'Email verified successfully. You can now sign in.',
    },
  });
}

export async function resendVerificationEmailUser(req: Request, res: Response) {
  const { email } = req.body ?? {};
  const result = await resendVerificationEmail(String(email ?? ''));
  res.json({
    success: true,
    data: {
      ...result,
      message: result.alreadyVerified ? 'Your email is already verified.' : 'Verification email sent successfully.',
    },
  });
}

export async function loginUser(req: Request, res: Response) {
  const result = await login(loginSchema.parse(req.body));
  setSessionCookie(res, result.sessionId, result.expiresAt);
  res.json({ success: true, data: { user: result.user } });
}
export async function googleLoginUser(req: Request, res: Response) {
  const result = await loginWithGoogle(googleSchema.parse(req.body));
  setSessionCookie(res, result.sessionId, result.expiresAt);
  res.json({ success: true, data: { user: result.user } });
}
export async function currentUser(req: Request, res: Response) {
  const sessionId = req.cookies[SESSION_COOKIE];
  const user = sessionId ? await getUserFromSession(sessionId) : null;
  if (!user) { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'You are not signed in.' } }); return; }
  res.json({ success: true, data: { user } });
}
export async function logoutUser(req: Request, res: Response) {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (sessionId) await logout(sessionId);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ success: true, data: { message: 'Signed out successfully.' } });
}
function setSessionCookie(res: Response, sessionId: string, expiresAt: string) { res.cookie(SESSION_COOKIE, sessionId, { ...cookieOptions, expires: new Date(expiresAt) }); }
