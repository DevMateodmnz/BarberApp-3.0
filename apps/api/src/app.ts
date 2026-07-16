import express from 'express';
import cors from 'cors';
import type { ApiRuntimeConfig } from './config/runtime.js';
import { applyProxyConfig } from './config/proxy.js';
import { createCorsOptions, readApiRuntimeConfig } from './config/runtime.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import appointmentRoutes from './routes/appointments.js';
import barbershopRoutes from './routes/barbershops.js';
import meRoutes from './routes/me.js';
import onboardingRoutes from './routes/onboarding.js';
import paymentsRoutes from './routes/payments.js';
import { createPublicCatalogRouter } from './routes/publicCatalog.js';
import webhookRoutes from './routes/webhooks.js';

export function createApp(config: ApiRuntimeConfig): express.Express {
  const app = express();
  const appointmentRateLimit = createRateLimiter(config.rateLimit);

  applyProxyConfig(app, config.nodeEnv);

  app.use(cors(createCorsOptions(config.corsPolicy)));

  // Webhook route — MUST be before express.json() for raw body capture
  app.use(
    '/api/v1/webhooks',
    express.raw({ type: 'application/json' }),
    webhookRoutes
  );

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/v1/ping', (_req, res) => {
    res.json({ success: true, data: { message: 'pong' } });
  });

  app.use('/api/v1/public', createPublicCatalogRouter(config));
  app.use('/api/v1', paymentsRoutes);
  app.use('/api/v1/appointments', appointmentRateLimit, appointmentRoutes);
  app.use('/api/v1/barbershops', barbershopRoutes);
  app.use('/api/v1/me', meRoutes);
  app.use('/api/v1/onboarding', onboardingRoutes);
  app.use(errorHandler);

  return app;
}

export function createAppFromEnv(
  env: NodeJS.ProcessEnv = process.env
): express.Express {
  return createApp(readApiRuntimeConfig(env));
}
