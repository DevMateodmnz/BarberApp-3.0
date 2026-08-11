# Railway `mvp-1.2.0` Deployment Runbook

This runbook describes external setup; it does not provision or deploy anything. Configure Railway from the repository root (`/`) because builds need the npm workspaces, lockfile, and shared TypeScript config.

## Target services

| Service | Release requirement | Replicas | Start command |
|---|---|---:|---|
| PostgreSQL | required | provider-managed | Railway PostgreSQL |
| API web | required | deployment choice | `node apps/api/dist/index.js` |
| Notification worker | required | **1 initially** | `node apps/api/dist/scripts/notificationWorker.js` |
| Payment webhook worker | not deployed while payments are off | 0 | `node apps/api/dist/scripts/paymentWebhookWorker.js` |
| Payment expiration worker | not deployed while payments are off | 0 | `node apps/api/dist/scripts/paymentExpirationWorker.js` |

Railway service topology is configured in its dashboard/project model; one root `railway.json` cannot declare every independent service. Do not invent multiple unsupported process entries in that file.

## Shared build settings

Use repository root `/`, Railpack, and:

```bash
npm ci
npm run db:generate --workspace @barberapp/api && npm run build --workspace @barberapp/api
```

The compiled worker entrypoints are emitted under `apps/api/dist/scripts/` by the same API build.

## API service

The checked-in `railway.json` is the API service contract:

- build: `npm run db:generate --workspace @barberapp/api && npm run build --workspace @barberapp/api`
- pre-deploy: `npm run db:migrate:deploy --workspace @barberapp/api`
- start: `node apps/api/dist/index.js`
- health check: `/health`
- `SIGTERM` reaches Node directly

Before pre-deploy, an operator must review and run the relevant migration `preflight.sql` files read-only against the confirmed target and confirm a backup/restore path. Production prohibits `db push`, reset, seed, and QA fixtures.

## Notification worker service

Create a second Railway application service from the same repository and release commit:

- root directory: `/`
- build command: same as API
- pre-deploy command: **none** (the API release owns the single migration step)
- start command: `node apps/api/dist/scripts/notificationWorker.js`
- replicas: `1` for the initial release
- health check: none; monitor process/restarts and notification delivery metrics/logs
- restart policy: on failure with bounded retries

Give it the same `NODE_ENV`, `DATABASE_URL`, and core secrets plus the SMTP/notification variables in `apps/api/.env.production.example`. The worker requires `SMTP_HOST` and `SMTP_FROM_EMAIL`; configure provider authentication as needed. Set `PUBLIC_WEB_BASE_URL` so notification emails contain the correct cancellation link.

The database claim/lock implementation protects against duplicate sends, but a single initial replica avoids needless contention. Scale only after reviewing throughput and lease behavior.

## Payments remain off

Set `PAYMENTS_ENABLED=false` on the API and worker environments for the initial `mvp-1.2.0` deployment. Payment credentials and payment worker services are not required. If either payment worker binary is accidentally started, it logs that payments are disabled and exits successfully without provider activity.

Payment activation is a later release gate requiring complete secrets, production OAuth/callback registration, signed webhook proof, authoritative reconciliation proof, and both payment workers.

## Environment ownership

- API: core variables, `PAYMENTS_ENABLED=false`, optional CORS/rate limits.
- Notification worker: core database/runtime variables, SMTP variables, notification tuning, `PUBLIC_WEB_BASE_URL`, and `PAYMENTS_ENABLED=false`.
- Railway injects API `PORT`; do not hardcode it.
- Use a Railway reference variable for PostgreSQL `DATABASE_URL`.
- Keep all live credentials outside Git.

See [`api-production-runbook.md`](./api-production-runbook.md) for the complete variable classification.

## External sequence

1. Publish/review the `release/mvp-1.2.0` commit and obtain deployment approval.
2. Provision Railway PostgreSQL and configure backups/PITR.
3. Configure the API and notification worker services from the same immutable release.
4. Review/run applicable `preflight.sql` checks read-only.
5. Let the API pre-deploy run `prisma migrate deploy` exactly once.
6. Start API, then the notification worker.
7. Verify `/health`, `/api/v1/ping`, authenticated DB flows, Clerk webhook delivery, and an actual notification delivery.
8. Deploy/configure public web and verify the full public-booking flow.
9. Perform signed Android production QA only after a canonical application identity and signing setup exist.

## Rollback and monitoring

Monitor CPU, memory, restarts, PostgreSQL growth, failed notification attempts, application logs, and billing limits. Roll back application services independently; migrations need a forward fix or verified restore. Disable public traffic/unpublish the pilot slug if data integrity is uncertain.
