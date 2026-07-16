import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { readPaymentRuntimeConfig } from '../lib/payments/runtime.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function parseAbsoluteUrl(value: string | undefined, name: string): { url: URL | null; error: string | null } {
  if (!value) {
    return { url: null, error: `${name} is missing` };
  }

  try {
    return { url: new URL(value), error: null };
  } catch {
    return { url: null, error: `${name} is not a valid absolute URL` };
  }
}

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (;;) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'apps'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

async function main() {
  const env = process.env;
  const checks: CheckResult[] = [];
  const nodeEnv = (env.NODE_ENV?.trim() || 'development') as 'development' | 'test' | 'production';
  const strictHttps = nodeEnv === 'production';
  const externalCallOccurred = false;
  const repoRoot = findRepoRoot(process.cwd());

  const redirectUri = parseAbsoluteUrl(env.MERCADO_PAGO_REDIRECT_URI, 'MERCADO_PAGO_REDIRECT_URI');
  const webhookUrl = parseAbsoluteUrl(
    env.PAYMENT_WEBHOOK_PUBLIC_URL ?? (strictHttps ? undefined : 'http://localhost:3000/api/v1/webhooks/mercado-pago'),
    'PAYMENT_WEBHOOK_PUBLIC_URL',
  );
  const publicWebBaseUrl = parseAbsoluteUrl(env.PUBLIC_WEB_BASE_URL, 'PUBLIC_WEB_BASE_URL');

  checks.push({ name: 'mercado-pago-client-id', ok: Boolean(env.MERCADO_PAGO_CLIENT_ID?.trim()), detail: env.MERCADO_PAGO_CLIENT_ID ? 'configured' : 'missing' });
  checks.push({ name: 'mercado-pago-client-secret', ok: Boolean(env.MERCADO_PAGO_CLIENT_SECRET?.trim()), detail: env.MERCADO_PAGO_CLIENT_SECRET ? 'configured' : 'missing' });
  checks.push({ name: 'oauth-redirect-uri', ok: redirectUri.url?.pathname === '/api/v1/payments/mercado-pago/oauth/callback', detail: redirectUri.error ?? redirectUri.url?.toString() ?? 'missing' });
  checks.push({ name: 'webhook-public-url', ok: webhookUrl.url?.pathname === '/api/v1/webhooks/mercado-pago', detail: webhookUrl.error ?? webhookUrl.url?.toString() ?? 'missing' });
  checks.push({ name: 'public-web-base-url', ok: Boolean(publicWebBaseUrl.url?.origin), detail: publicWebBaseUrl.error ?? publicWebBaseUrl.url?.toString() ?? 'missing' });

  try {
    const runtime = readPaymentRuntimeConfig(env);
    checks.push({ name: 'encryption-key', ok: runtime.encryptionKey.length === 32, detail: 'valid AES-256-GCM key length' });
  } catch (error) {
    checks.push({ name: 'encryption-key', ok: false, detail: error instanceof Error ? error.message : 'invalid PAYMENT_CREDENTIAL_ENCRYPTION_KEY' });
  }

  checks.push({
    name: 'https-policy',
    ok: !strictHttps || [redirectUri.url, webhookUrl.url, publicWebBaseUrl.url].every((url) => url?.protocol === 'https:'),
    detail: strictHttps ? 'production requires https URLs' : 'local/test http allowed',
  });

  checks.push({
    name: 'localhost-policy',
    ok: nodeEnv !== 'production' || ![redirectUri.url, webhookUrl.url, publicWebBaseUrl.url].some((url) => url && isLocalHost(url.hostname)),
    detail: nodeEnv === 'production' ? 'production forbids localhost payment URLs' : 'local/test localhost allowed',
  });

  const proxyRoutePath = path.join(repoRoot, 'apps/public-web/app/api/payment-webhooks/mercado-pago/route.ts');
  checks.push({ name: 'public-webhook-proxy-removed', ok: !fs.existsSync(proxyRoutePath), detail: proxyRoutePath });

  const prisma = new PrismaClient();
  try {
    try {
      const appliedRows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM _prisma_migrations
        ORDER BY finished_at NULLS LAST, migration_name ASC
      `;
      const applied = new Set(appliedRows.map((row) => row.migration_name));
      const requiredMigrations = [
        '20260716010000_add_mercado_pago_deposit_payments',
        '20260716013000_fix_appointment_payment_hold_check',
        '20260716033000_add_payment_review_operations',
      ];
      checks.push({
        name: 'required-migrations-applied',
        ok: requiredMigrations.every((migration) => applied.has(migration)),
        detail: requiredMigrations.join(', '),
      });
    } catch (error) {
      checks.push({
        name: 'required-migrations-applied',
        ok: false,
        detail: error instanceof Error ? error.message : 'Unable to inspect _prisma_migrations',
      });
    }

    try {
      await prisma.$queryRaw`SELECT 1 FROM booking_payments LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM booking_payment_reviews LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM booking_payment_review_actions LIMIT 1`;
      await prisma.$queryRaw`SELECT 1 FROM payment_webhook_events LIMIT 1`;
      checks.push({
        name: 'payment-tables-available',
        ok: true,
        detail: 'booking_payments, booking_payment_reviews, booking_payment_review_actions, payment_webhook_events',
      });
    } catch (error) {
      checks.push({
        name: 'payment-tables-available',
        ok: false,
        detail: error instanceof Error ? error.message : 'Unable to inspect payment tables',
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, externalCallOccurred, checks }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, externalCallOccurred: false, error: error instanceof Error ? error.message : 'Unknown error' }, null, 2));
  process.exit(1);
});
