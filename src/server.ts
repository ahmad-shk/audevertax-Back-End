import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

// Vercel par process.env.VERCEL '1' hota hai
if (process.env.VERCEL !== '1') {
  const HOST = '0.0.0.0';
  const PORT = Number(env.PORT) || 5001;

  const server = app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT, url: `http://localhost:${PORT}` }, 'Foremint API running');
  });

  server.on('error', (error) => {
    logger.error({ err: error }, 'Foremint API failed to start');
    process.exitCode = 1;
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down Foremint API');
    server.close(() => process.exit(0)); 
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

export default app;