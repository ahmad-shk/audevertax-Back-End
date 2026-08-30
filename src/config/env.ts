import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  STORAGE_DRIVER: z.enum(['file', 'postgres']).default('file'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().url().optional(),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
