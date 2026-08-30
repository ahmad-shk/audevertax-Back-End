import type { Request, Response } from 'express';
import { getUserById } from './user.service.js';

export async function currentUser(req: Request, res: Response) {
  const user = await getUserById(res.locals.user.id);

  if (!user) {
    res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User account was not found.' },
    });
    return;
  }

  res.json({ success: true, data: { user } });
}
