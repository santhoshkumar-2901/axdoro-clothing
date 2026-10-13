import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`[AXDORO Backend] Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[AXDORO Backend] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[AXDORO Backend] Process terminated.');
  });
});
