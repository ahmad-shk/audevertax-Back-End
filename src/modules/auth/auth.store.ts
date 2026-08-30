import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../../core/json-store.js';
import { getPool } from '../../core/db.js';
import { env } from '../../config/env.js';
import type { Session, User } from './auth.types.js';

const users = new JsonStore<User>(path.resolve('data/users.json'));
const sessions = new JsonStore<Session>(path.resolve('data/sessions.json'));

// Use Postgres in production, JSON in development
const usePostgres = env.STORAGE_DRIVER === 'postgres' && env.DATABASE_URL;

function mapRowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    authProvider: row.auth_provider,
    googleSubject: row.google_subject,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function mapRowToSession(row: any): Session {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

export const userStore = {
  async findById(id: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows.length > 0 ? mapRowToUser(result.rows[0]) : null;
    }
    return users.findById(id);
  },

  async findByEmail(email: string) {
    const normalized = email.toLowerCase();
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalized]);
      return result.rows.length > 0 ? mapRowToUser(result.rows[0]) : null;
    }
    return (await users.all()).find((user) => user.email === normalized) ?? null;
  },

  async findByGoogleSubject(googleSubject: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('SELECT * FROM users WHERE google_subject = $1', [googleSubject]);
      return result.rows.length > 0 ? mapRowToUser(result.rows[0]) : null;
    }
    return (await users.all()).find((user) => user.googleSubject === googleSubject) ?? null;
  },

  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = randomUUID();
    const now = new Date().toISOString();

    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, auth_provider, google_subject, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          data.email.toLowerCase(),
          data.passwordHash,
          data.firstName,
          data.lastName,
          data.role,
          data.authProvider,
          data.googleSubject,
          now,
          now,
        ]
      );
      return mapRowToUser(result.rows[0]);
    }

    return users.insert({ id, createdAt: now, updatedAt: now, ...data });
  },

  async update(id: string, changes: Partial<User>) {
    if (usePostgres) {
      const pool = getPool();
      const now = new Date().toISOString();
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic UPDATE query
      if (changes.email) {
        fields.push(`email = $${paramCount++}`);
        values.push(changes.email.toLowerCase());
      }
      if (changes.passwordHash) {
        fields.push(`password_hash = $${paramCount++}`);
        values.push(changes.passwordHash);
      }
      if (changes.firstName) {
        fields.push(`first_name = $${paramCount++}`);
        values.push(changes.firstName);
      }
      if (changes.lastName) {
        fields.push(`last_name = $${paramCount++}`);
        values.push(changes.lastName);
      }
      if (changes.role) {
        fields.push(`role = $${paramCount++}`);
        values.push(changes.role);
      }

      if (fields.length === 0) return await this.findById(id);

      fields.push(`updated_at = $${paramCount++}`);
      values.push(now);
      values.push(id);

      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pool.query(query, values);

      return result.rows.length > 0 ? mapRowToUser(result.rows[0]) : null;
    }

    return users.update(id, { ...changes, updatedAt: new Date().toISOString() });
  },
};

export const sessionStore = {
  async create(userId: string, expiresAt: string) {
    const id = randomUUID();
    const now = new Date().toISOString();

    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, userId, expiresAt, now]
      );
      return mapRowToSession(result.rows[0]);
    }

    return sessions.insert({ id, userId, expiresAt, createdAt: now });
  },

  async findById(id: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
      return result.rows.length > 0 ? mapRowToSession(result.rows[0]) : null;
    }
    return sessions.findById(id);
  },

  async delete(id: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
      return result.rowCount ? result.rowCount > 0 : false;
    }
    return sessions.delete(id);
  },
};
