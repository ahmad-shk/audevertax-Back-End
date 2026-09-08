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
