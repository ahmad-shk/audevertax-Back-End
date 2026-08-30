import { userStore } from '../auth/auth.store.js';
import type { PublicUser } from '../auth/auth.types.js';

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await userStore.findById(id);
  if (!user) return null;

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
