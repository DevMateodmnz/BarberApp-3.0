# API Production Release Runbook

Release the BarberApp API only from a clean, validated commit.

For the current MVP deployment target, see the Railway-specific runbook: [`docs/releases/railway-mvp-deployment.md`](./railway-mvp-deployment.md).

## Preconditions

- Working tree is clean.
- The target commit already passed API validation (`typecheck`, `lint`, tests).
- A production database backup or provider snapshot is available before migration.
- Production environment values are prepared outside the repository.
- Local QA bootstrap is **not** part of production startup.

## Required Production Environment

| Variable | Required | Secret | Notes |
|----------|----------|--------|-------|
| `NODE_ENV` | yes | no | Must be `production`. |
| `DATABASE_URL` | yes | yes | Production PostgreSQL connection string. |
| `CLERK_SECRET_KEY` | yes | yes | Backend Clerk secret for authenticated API requests. |
| `CLERK_WEBHOOK_SECRET` | yes | yes | Required for Clerk webhook signature verification. |
| `ALLOWED_ORIGIN` | yes | no | Explicit credentialed browser allowlist. Comma-separate only when multiple origins are intentional. |
| `PORT` | no | no | Defaults to `3000` if unset. |
| `RATE_LIMIT_ENABLED` | no | no | Optional override; defaults to enabled outside test. |
| `RATE_LIMIT_WINDOW_MS` | no | no | Optional positive integer override. |
| `RATE_LIMIT_MAX` | no | no | Optional positive integer override. |

Examples:

```env
NODE_ENV=production
DATABASE_URL=postgresql://db_user:db_password@db-host:5432/barberapp
CLERK_SECRET_KEY=sk_live_replace_me
CLERK_WEBHOOK_SECRET=whsec_replace_me
ALLOWED_ORIGIN=https://app.example.com
# ALLOWED_ORIGIN=https://app.example.com,https://admin.example.com
PORT=3000
```

Production startup fails before listening when `ALLOWED_ORIGIN` is missing, empty, wildcard-based, malformed, non-HTTP(S), or incompatible with credentialed CORS.

## Install, Generate, Build

Run from the repository root:

```bash
npm ci
npm run db:generate --workspace @barberapp/api
npm run typecheck --workspace @barberapp/api
npm run build --workspace @barberapp/api
```

`prisma generate` is explicit here so the runtime client matches the deployed schema.

## Database Migration Order

Apply database migrations **before** starting the new API process:

```bash
npm run db:migrate:deploy --workspace @barberapp/api
```

Production rules:

- Use `prisma migrate deploy`.
- Do **not** use `prisma db push`.
- Do **not** run demo seed data.
- Do **not** run `qa:bootstrap` or any local QA-only scripts.

If `prisma migrate deploy` fails:

1. Stop the rollout.
2. Keep the currently running application version in place if it is still healthy.
3. Investigate the failed migration and either:
   - apply a forward fix, or
   - restore the database from the pre-release backup/snapshot if recovery is required.

There is no repository-provided automatic schema rollback.

## API Startup

Start the built API:

```bash
npm run start --workspace @barberapp/api
```

Expected behavior:

- The API refuses to start if required production configuration is invalid.
- No listening log is emitted before configuration validation succeeds.
- Credentialed CORS uses the exact allowed origin, never `*`.
- Requests without an `Origin` header remain usable for health checks, probes, and server-to-server calls.

Reverse-proxy trust is **not** enabled by default in the current codebase; configure it explicitly only if your deployment topology requires it.

For Railway specifically, the deployment path in this repository now trusts exactly one proxy hop in production and uses a direct `node apps/api/dist/index.js` start command so `SIGTERM` reaches the API process.

## Verification Checklist

Basic smoke:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/v1/ping
```

CORS allowlist verification:

```bash
curl -i \
  -X OPTIONS \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: GET' \
  http://127.0.0.1:3000/api/v1/ping
```

Rejected-origin verification:

```bash
curl -i \
  -H 'Origin: https://evil.example.com' \
  http://127.0.0.1:3000/health
```

Release checklist items:

- `/health` returns 200.
- `/api/v1/ping` returns 200.
- `/health` is process liveness only; perform a real authenticated smoke test for readiness.
- Database connectivity is confirmed through a real authenticated API flow after startup.
- A Clerk-authenticated smoke test succeeds with a real production user/session.
- Allowed-origin preflight returns the exact configured origin.
- Rejected origins do not receive permissive CORS headers.

## Rollback / Incident Basics

- Rolling back application code does **not** automatically roll back database schema.
- Preserve the pre-release database backup until the deployment is accepted.
- Do not run destructive Prisma commands during incident response.
- Prefer a forward migration/fix when possible; otherwise restore from backup/snapshot according to the incident plan.
