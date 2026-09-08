import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, getUserFromSession } from './auth.service.js';

function getSessionIdFromRequest(req: Request) {
  const cookieSessionId = req.cookies?.[SESSION_COOKIE];
  if (cookieSessionId) return cookieSessionId;

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = getSessionIdFromRequest(req);
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
