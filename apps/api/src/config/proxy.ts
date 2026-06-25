import express from 'express';
import type { NodeEnv } from './runtime.js';

/**
 * Railway runs the application behind a single edge proxy that forwards
 * client identity through X-Forwarded-* headers. Trust exactly one proxy hop
 * in production so req.ip / req.protocol are derived correctly for rate
 * limiting and request metadata, while keeping local development untrusted.
 */
export function applyProxyConfig(
  app: express.Express,
  nodeEnv: NodeEnv
): void {
  app.set('trust proxy', nodeEnv === 'production' ? 1 : false);
}
