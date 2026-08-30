import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, getUserFromSession } from './auth.service.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies[SESSION_COOKIE];
  const user = sessionId ? await getUserFromSession(sessionId) : null;

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'You are not signed in.' },
    });
    return;
  }

  res.locals.user = user;
  next();
}
