import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initializeDatabase, closePool } from './core/db.js';

const HOST = '0.0.0.0';
const PORT = env.PORT;

async function start() {
  try {
    // Initialize database if using Postgres
    if (env.STORAGE_DRIVER === 'postgres' && env.DATABASE_URL) {
      logger.info('Initializing Postgres database...');
      await initializeDatabase();
      logger.info('Database initialized successfully');
    }

    const server = app.listen(PORT, HOST, () => {
      logger.info({ host: HOST, port: PORT, url: `http://localhost:${PORT}` }, 'Audevertax API running');
    });

    server.on('error', (error) => {
      logger.error({ err: error }, 'Audevertax API failed to start');
      process.exitCode = 1;
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down Audevertax API');
      server.close(async () => {
        await closePool();
        process.exit(0);
      });
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

start(); 
