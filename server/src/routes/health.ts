import { Router, Request, Response } from 'express';
import { checkDbHealth } from '../config/db.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const dbHealth = await checkDbHealth();

  const isHealthy = dbHealth.ok;
  const status = isHealthy ? 'ok' : 'degraded';

  const body = {
    status,
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    database: {
      connected: dbHealth.ok,
      latencyMs: dbHealth.latencyMs,
      // Never expose full connection string or internal DB host
      ...(dbHealth.error && { error: 'Database query failed' }),
    },
  };

  res.status(isHealthy ? 200 : 503).json(body);
});
