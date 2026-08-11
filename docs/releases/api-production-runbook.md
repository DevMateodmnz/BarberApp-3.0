# API Production Release Runbook

Release BarberApp only from a clean, reviewed commit. The current repository-controlled candidate is `mvp-1.2.0`; the existing `mvp-1.1.1` tag is historical and immutable.

## Production environment contract

### Core required (API and workers)

| Variable | Secret | Purpose |
|---|---:|---|
| `NODE_ENV=production` | no | Enables production validation and proxy policy. |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `CLERK_SECRET_KEY` | yes | Staff authentication and invitation backend. |
| `CLERK_WEBHOOK_SECRET` | yes | Clerk webhook signature verification. |

### Core optional

| Variable | Purpose |
|---|---|
| `PORT` | API listen port; hosting platforms normally inject it. |
| `CLERK_INVITATION_REDIRECT_URL` | Optional Clerk invitation landing URL. |
| `CORS_ALLOWED_ORIGINS` | Exact comma-separated browser origins only when direct browser-to-API traffic exists. |
| `RATE_LIMIT_ENABLED` | Boolean rate-limit override. |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | Positive integer rate-limit overrides. |

### Notification worker required for `mvp-1.2.0`

| Variable | Required | Purpose |
|---|---:|---|
| `SMTP_HOST` | yes | SMTP server. |
| `SMTP_PORT` | no | Defaults to `1025`; set the production provider port. |
| `SMTP_SECURE` | no | Strict `true`/`false`; defaults false. |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | provider-dependent | SMTP authentication. |
| `SMTP_FROM_EMAIL` | yes | Sender address. |
| `SMTP_FROM_NAME` | no | Sender display name. |
| `PUBLIC_WEB_BASE_URL` | operationally required | HTTPS public-web origin used for cancellation links. |
| `NOTIFICATION_WORKER_BATCH_SIZE` | no | Defaults to `10`. |
| `NOTIFICATION_WORKER_POLL_INTERVAL_MS` | no | Defaults to `30000`. |
| `NOTIFICATION_STALE_LOCK_MS` | no | Defaults to `600000`. |

### Payments

`PAYMENTS_ENABLED` defaults to `false`. The initial `mvp-1.2.0` deployment must set it explicitly to `false` for audit clarity. Disabled mode does not require payment secrets, never turns tenant deposit policies into a payment requirement, and payment workers exit without work.

Only a separately approved activation may set `PAYMENTS_ENABLED=true`. Startup then requires all of:

- `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` (exactly 32 decoded bytes)
- `PUBLIC_WEB_BASE_URL`
- `PAYMENT_WEBHOOK_PUBLIC_URL`
- `MERCADO_PAGO_CLIENT_ID`
- `MERCADO_PAGO_CLIENT_SECRET`
- `MERCADO_PAGO_REDIRECT_URI`
- `MERCADO_PAGO_WEBHOOK_SECRET`

The optional provider overrides actually consumed by code are `MERCADO_PAGO_API_BASE_URL`, `MERCADO_PAGO_AUTHORIZATION_BASE_URL`, and `MERCADO_PAGO_OAUTH_SCOPE`. Payment worker polling overrides are `PAYMENT_WEBHOOK_WORKER_POLL_INTERVAL_MS` and `PAYMENT_EXPIRE_HOLDS_POLL_INTERVAL_MS`.

## Install, build, and migrate

From the repository root:

```bash
npm ci
npm run db:generate --workspace @barberapp/api
npm run typecheck --workspace @barberapp/api
npm run build --workspace @barberapp/api
```

Before a production migration:

1. verify the target database identity and backup/recovery posture;
2. review and execute each relevant migration `preflight.sql` as a **read-only** check;
3. stop if a preflight reports unsafe or unexpected rows;
4. apply committed migrations only with:

```bash
npm run db:migrate:deploy --workspace @barberapp/api
```

Never use `prisma db push`, `prisma migrate reset`, seeds, `qa:bootstrap`, or test fixtures in production. Never rewrite already-applied migration SQL. Application rollback does not roll back schema; use a reviewed forward fix or the verified restore plan.

## Built process commands

```bash
# API web service
node apps/api/dist/index.js

# Required notification worker (exactly one replica for the initial release)
node apps/api/dist/scripts/notificationWorker.js

# Optional only after PAYMENTS_ENABLED=true approval
node apps/api/dist/scripts/paymentWebhookWorker.js
node apps/api/dist/scripts/paymentExpirationWorker.js
```

The notification outbox uses transactional claims and stale-lock recovery. Start one worker replica for the initial deployment to avoid unnecessary duplicate consumers. Payment workers safely exit when payments are disabled.

## Verification

```bash
curl -fsS https://<api-domain>/health
curl -fsS https://<api-domain>/api/v1/ping
```

Also verify a real Clerk-authenticated read/write flow, Clerk webhook delivery, notification delivery from the worker, database persistence, exact CORS behavior where configured, and the public-web BFF against the final API URL. `/health` is process liveness, not dependency readiness.

## Rollback basics

- Stop or roll back application traffic independently from PostgreSQL.
- Preserve pre-migration backups until acceptance.
- Do not run destructive Prisma commands during incident response.
- Unpublish a pilot slug before deleting or rewriting customer data.
- Keep `PAYMENTS_ENABLED=false`; payment activation has its own provider/OAuth/webhook reconciliation gate.
