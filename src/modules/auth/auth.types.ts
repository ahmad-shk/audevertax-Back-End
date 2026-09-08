export type UserRole = 'customer' | 'admin' | 'staff';

export type AuthProvider = 'password' | 'google';

export type User = {
  id: string;
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  authProvider: AuthProvider;
  googleSubject: string | null;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiresAt: string | null;
  passwordResetToken: string | null;
  passwordResetExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type PublicUser = Omit<User, 'passwordHash' | 'emailVerificationToken' | 'emailVerificationExpiresAt' | 'passwordResetToken' | 'passwordResetExpiresAt'>;
