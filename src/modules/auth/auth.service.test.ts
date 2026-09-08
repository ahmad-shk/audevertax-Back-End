import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from './auth.service.js';

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
