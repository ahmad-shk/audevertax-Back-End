import bcrypt from 'bcryptjs';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { AppError } from '../../core/errors.js';
import { env } from '../../config/env.js';
import { sendVerificationEmail } from '../../utils/mailer.js';
import { userStore, sessionStore } from './auth.store.js';
import type { GoogleInput, LoginInput, RegisterInput } from './auth.schemas.js';
import type { PublicUser, User } from './auth.types.js';

export const SESSION_COOKIE = 'foremint_session';
const SESSION_MINUTES = 15;
const SESSION_TTL_MS = SESSION_MINUTES * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
type GoogleJwk = { kid: string; kty: string; alg: string; n: string; e: string };
type GooglePayload = { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string; exp?: number; iat?: number };
type GoogleKeySet = { keys: GoogleJwk[] };
let googleKeys: GoogleKeySet | null = null;
let googleKeysExpiresAt = 0;

let accountCreationQueue: Promise<void> = Promise.resolve();
async function withAccountCreationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = accountCreationQueue;
  let release!: () => void;
  accountCreationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await operation(); } finally { release(); }
}

function publicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, emailVerificationToken: _emailVerificationToken, emailVerificationExpiresAt: _emailVerificationExpiresAt, ...safeUser } = user;
  return safeUser;
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }

async function dispatchVerificationEmail(email: string, token: string) {
  const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
  const verificationUrl = `${baseUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  return sendVerificationEmail(email, verificationUrl);
}

export async function register(input: RegisterInput) {
  return withAccountCreationLock(async () => {
    const email = normalizeEmail(input.email);
    const existingUser = await userStore.findByEmail(email);

    if (existingUser && existingUser.emailVerified) {
      throw new AppError('An account with this email already exists.', 409, 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const verificationToken = randomUUID();
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

    let user: User;
    if (existingUser && !existingUser.emailVerified) {
      const updatedUser = await userStore.update(existingUser.id, {
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: 'customer',
        authProvider: 'password',
        googleSubject: null,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
      });

      if (!updatedUser) {
        throw new AppError('Unable to update the previous unverified account.', 500, 'EMAIL_REGISTRATION_FAILED');
      }

      user = updatedUser;
    } else {
      user = await userStore.create({
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: 'customer',
        authProvider: 'password',
        googleSubject: null,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
      });
    }

    await dispatchVerificationEmail(email, verificationToken);
    return {
      user: publicUser(user),
      verificationRequired: true,
      verificationToken,
      expiresAt: user.emailVerificationExpiresAt,
    };
  });
}

export async function verifyEmail(token: string) {
  const user = await userStore.findByVerificationToken(token);
  if (!user) {
    throw new AppError('This verification link is invalid or expired.', 400, 'INVALID_VERIFICATION_TOKEN');
  }

  const expiresAt = user.emailVerificationExpiresAt ? new Date(user.emailVerificationExpiresAt).getTime() : 0;
  if (expiresAt <= Date.now()) {
    throw new AppError('This verification link has expired. Please request a new one.', 400, 'VERIFICATION_TOKEN_EXPIRED');
  }

  const updatedUser = await userStore.update(user.id, {
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
  });

  if (!updatedUser) {
    throw new AppError('Unable to verify this account.', 500, 'EMAIL_VERIFICATION_FAILED');
  }

  return { user: publicUser(updatedUser), verified: true };
}

export async function resendVerificationEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userStore.findByEmail(normalizedEmail);
  if (!user) {
    throw new AppError('No account found for this email.', 404, 'USER_NOT_FOUND');
  }

  if (user.emailVerified) {
    return { user: publicUser(user), alreadyVerified: true };
  }

  const verificationToken = randomUUID();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  await userStore.update(user.id, {
    emailVerificationToken: verificationToken,
    emailVerificationExpiresAt: expiresAt,
  });

  await dispatchVerificationEmail(user.email, verificationToken);
  return { user: publicUser(user), verificationRequired: true, verificationToken, expiresAt };
}

export async function forgotPassword(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userStore.findByEmail(normalizedEmail);

  if (!user) {
    return {
      resetRequired: false,
      message: 'If an account exists for this email, a reset link has been sent.',
    };
  }

  const resetToken = randomUUID();
  const resetExpiresAt = new Date(Date.now() + RESET_PASSWORD_TTL_MS).toISOString();

  await userStore.update(user.id, {
    emailVerificationToken: resetToken,
    emailVerificationExpiresAt: resetExpiresAt,
  });

  const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
  await sendVerificationEmail(user.email, resetUrl);

  return {
    resetRequired: true,
    resetToken,
    expiresAt: resetExpiresAt,
    message: 'If an account exists for this email, a reset link has been sent.',
  };
}

export async function resetPassword(token: string, password: string) {
  const user = await userStore.findByVerificationToken(token);
  if (!user) {
    throw new AppError('This reset link is invalid or expired.', 400, 'INVALID_RESET_TOKEN');
  }

  const expiresAt = user.emailVerificationExpiresAt ? new Date(user.emailVerificationExpiresAt).getTime() : 0;
  if (expiresAt <= Date.now()) {
    throw new AppError('This reset link has expired. Please request a new one.', 400, 'RESET_TOKEN_EXPIRED');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const updatedUser = await userStore.update(user.id, {
    passwordHash,
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
  });

  if (!updatedUser) {
    throw new AppError('Unable to reset the password.', 500, 'PASSWORD_RESET_FAILED');
  }

  return { reset: true, user: publicUser(updatedUser) };
}

export async function login(input: LoginInput) {
  const user = await userStore.findByEmail(normalizeEmail(input.email));
  const isPasswordValid = user && user.passwordHash ? await bcrypt.compare(input.password, user.passwordHash) : false;

  if (!user || !user.passwordHash || !isPasswordValid) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.emailVerified) {
    throw new AppError('Please verify your email before signing in.', 403, 'EMAIL_NOT_VERIFIED');
  }

  const session = await createSession(user.id);
  return {
    user: publicUser(user),
    sessionId: session.id,
    token: session.id,
    expiresAt: session.expiresAt,
    expiresInMs: SESSION_TTL_MS,
  };
}

export async function loginWithGoogle(input: GoogleInput) {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError('Google sign-in is not configured on the server.', 503, 'GOOGLE_NOT_CONFIGURED');
  const googleUser = await verifyGoogleCredential(input.credential);
  const email = normalizeEmail(googleUser.email!);

  return withAccountCreationLock(async () => {
    let user = await userStore.findByGoogleSubject(googleUser.sub!);
    if (!user) {
      const existingByEmail = await userStore.findByEmail(email);
      if (existingByEmail) throw new AppError('An account with this email already exists. Sign in with your email and password first.', 409, 'EMAIL_ALREADY_EXISTS');
      user = await userStore.create({
        email,
        passwordHash: null,
        firstName: googleUser.given_name?.trim() || 'Google',
        lastName: googleUser.family_name?.trim() || 'User',
        role: 'customer',
        authProvider: 'google',
        googleSubject: googleUser.sub!,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      });
    }
    const session = await createSession(user.id);
    return {
      user: publicUser(user),
      sessionId: session.id,
      token: session.id,
      expiresAt: session.expiresAt,
      expiresInMs: SESSION_TTL_MS,
    };
  });
}

async function verifyGoogleCredential(credential: string): Promise<GooglePayload> {
  const parts = credential.split('.');
  if (parts.length !== 3) throw new AppError('Invalid Google credential.', 401, 'INVALID_GOOGLE_CREDENTIAL');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: { alg?: string; kid?: string }; let payload: GooglePayload;
  try { header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')); payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')); } catch { throw new AppError('Invalid Google credential.', 401, 'INVALID_GOOGLE_CREDENTIAL'); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid || !payload.sub || !payload.email || !payload.iss || !payload.aud || !GOOGLE_ISSUERS.has(payload.iss) || payload.aud !== env.GOOGLE_CLIENT_ID || payload.email_verified !== true || !payload.exp || payload.exp <= now || (payload.iat !== undefined && payload.iat > now + 60)) throw new AppError('Google credential verification failed.', 401, 'INVALID_GOOGLE_CREDENTIAL');

  const keys = await getGoogleKeys();
  const jwk = keys.keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256');
  if (!jwk) throw new AppError('Google credential verification failed.', 401, 'INVALID_GOOGLE_CREDENTIAL');
  const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  const valid = verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), key, Buffer.from(encodedSignature, 'base64url'));
  if (!valid) throw new AppError('Google credential verification failed.', 401, 'INVALID_GOOGLE_CREDENTIAL');
  return payload;
}

async function getGoogleKeys(): Promise<GoogleKeySet> {
  if (googleKeys && googleKeysExpiresAt > Date.now()) return googleKeys;
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) throw new AppError('Google credential verification is temporarily unavailable.', 503, 'GOOGLE_VERIFICATION_UNAVAILABLE');
  const keys = await response.json() as GoogleKeySet;
  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 300);
  googleKeys = keys;
  googleKeysExpiresAt = Date.now() + Math.min(Math.max(maxAge, 60), 24 * 60 * 60) * 1000;
  return keys;
}

export async function getUserFromSession(sessionId: string) {
  const session = await sessionStore.findById(sessionId);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) { await sessionStore.delete(session.id); return null; }
  const user = await userStore.findById(session.userId);
  return user ? publicUser(user) : null;
}

export async function logout(sessionId: string) { await sessionStore.delete(sessionId); }
async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  return sessionStore.create(userId, expiresAt);
}