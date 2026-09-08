import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../../core/json-store.js';
import type { Session, User } from './auth.types.js';

const users = new JsonStore<User>(path.resolve('data/users.json'));
const sessions = new JsonStore<Session>(path.resolve('data/sessions.json'));

export const userStore = {
  async findById(id: string) {
    return users.findById(id);
  },

  async findByEmail(email: string) {
    const normalized = email.toLowerCase();
    return (await users.all()).find((user) => user.email === normalized) ?? null;
  },

  async findByGoogleSubject(googleSubject: string) {
    return (await users.all()).find((user) => user.googleSubject === googleSubject) ?? null;
  },

  async findByVerificationToken(token: string) {
    return (await users.all()).find((user) => user.emailVerificationToken === token) ?? null;
  },

  async all() {
    return users.all();
  },

  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString();
    return users.insert({ id: randomUUID(), createdAt: now, updatedAt: now, ...data });
  },

  async update(id: string, changes: Partial<User>) {
    return users.update(id, { ...changes, updatedAt: new Date().toISOString() });
  },

  async delete(id: string) {
    return users.delete(id);
  },
};

export const sessionStore = {
  async create(userId: string, expiresAt: string) {
    return sessions.insert({ id: randomUUID(), userId, expiresAt, createdAt: new Date().toISOString() });
  },
  async findById(id: string) { return sessions.findById(id); },
  async delete(id: string) { return sessions.delete(id); },
};
