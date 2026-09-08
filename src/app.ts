import express from 'express';
import cors from 'cors';
import * as helmetModule from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { applicationRoutes } from './modules/applications/application.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const helmet = (helmetModule as unknown as { default: (options?: Record<string, unknown>) => ReturnType<typeof express.json> }).default;

export const app = express();

app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet());

const allowedOrigins = [
  'https://talha-website-26u2.vercel.app',
  'https://talha-website-mu.vercel.app',
  'https://audvertax-front-end.vercel.app',
  env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        // Return EXACT origin string (Boolean true pass karne se credentials fail hote hain)
        callback(null, origin);
      } else {
        // Dynamic origins handling
        callback(null, origin);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  })
);

app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'Foremint API', status: 'running' } });
});

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok', storage: 'file' } });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/applications', applicationRoutes);
app.use('/api/v1/billing', billingRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use(errorHandler);