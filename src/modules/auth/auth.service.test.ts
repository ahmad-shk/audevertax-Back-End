import test from 'node:test';
import assert from 'node:assert/strict';
import { register, login, forgotPassword, resetPassword } from './auth.service.js';
import { requireAuth } from './auth.middleware.js';

test('register creates a pending user until email is verified', async () => {
  const email = `pending.user.${Date.now()}@example.com`;
  const result = await register({
    email,
    password: 'StrongPass123',
    firstName: 'Pending',
    lastName: 'User',
  });

  assert.equal(result.user.emailVerified, false);
  assert.equal(result.verificationRequired, true);
  assert.equal('sessionId' in result, false);
});

test('register allows re-signup when a previous user is still unverified', async () => {
  const email = `retry.user.${Date.now()}@example.com`;

  const first = await register({
    email,
    password: 'StrongPass123',
    firstName: 'Retry',
    lastName: 'User',
  });

  const second = await register({
    email,
    password: 'AnotherPass456',
    firstName: 'Retry',
    lastName: 'User2',
  });

  assert.equal(first.user.emailVerified, false);
  assert.equal(second.user.emailVerified, false);
  assert.equal(second.verificationRequired, true);
  assert.notEqual(first.verificationToken, second.verificationToken);
  assert.equal(first.user.id, second.user.id);
});

test('login creates a 15 minute session token', async () => {
  const email = `session.user.${Date.now()}@example.com`;
  await register({
    email,
    password: 'StrongPass123',
    firstName: 'Session',
    lastName: 'User',
  });

  const verifiedUser = await import('./auth.service.js').then((mod) => mod.verifyEmail);
  const verificationToken = await import('./auth.store.js').then((mod) => mod.userStore.findByEmail(email)).then((user) => user?.emailVerificationToken);
  if (!verificationToken) throw new Error('No verification token generated');
  await verifiedUser(verificationToken);

  const session = await login({ email, password: 'StrongPass123' });

  const expiresAtMs = new Date(session.expiresAt).getTime();
  const nowMs = Date.now();
  const delta = expiresAtMs - nowMs;

  assert.ok(delta > 14 * 60 * 1000, 'session should last at least 14 minutes');
  assert.ok(delta <= 15 * 60 * 1000 + 1000, 'session should not exceed 15 minutes');
  assert.equal(typeof session.token, 'string');
  assert.equal(session.token, session.sessionId);
});

test('requireAuth accepts bearer tokens in addition to cookies', async () => {
  const email = `bearer.user.${Date.now()}@example.com`;
  await register({
    email,
    password: 'StrongPass123',
    firstName: 'Bearer',
    lastName: 'User',
  });

  const verifyEmail = await import('./auth.service.js').then((mod) => mod.verifyEmail);
  const verificationToken = await import('./auth.store.js').then((mod) => mod.userStore.findByEmail(email)).then((user) => user?.emailVerificationToken);
  if (!verificationToken) throw new Error('No verification token generated');
  await verifyEmail(verificationToken);

  const session = await login({ email, password: 'StrongPass123' });

  let nextCalled = false;
  const req: any = {
    cookies: {},
    headers: { authorization: `Bearer ${session.sessionId}` },
  };
  const res: any = {
    locals: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.locals.user.email, email);
});

test('forgot password creates a reset token and resetPassword changes the password', async () => {
  const email = `reset.user.${Date.now()}@example.com`;
  await register({
    email,
    password: 'StrongPass123',
    firstName: 'Reset',
    lastName: 'User',
  });

  const verifyEmail = await import('./auth.service.js').then((mod) => mod.verifyEmail);
  const verificationToken = await import('./auth.store.js').then((mod) => mod.userStore.findByEmail(email)).then((user) => user?.emailVerificationToken);
  if (!verificationToken) throw new Error('No verification token generated');
  await verifyEmail(verificationToken);

  const requested = await forgotPassword(email);
  assert.equal(requested.resetRequired, true);
  assert.equal(typeof requested.resetToken, 'string');

  const updated = await resetPassword(requested.resetToken, 'NewStrongPass456');
  assert.equal(updated.reset, true);

  const session = await login({ email, password: 'NewStrongPass456' });
  assert.equal(typeof session.token, 'string');
});
