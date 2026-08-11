# MVP 1.2.0 — Local Release Candidate Contract

**Status:** repository preparation for independent release verification
**Predecessor:** immutable `mvp-1.1.1` at the older `origin/main`-era commit
**Candidate branch:** `release/mvp-1.2.0`

## Version decision

`mvp-1.1.1` must not be moved or reused. Local `main` began this batch at `ba44c13085265f3792ad7ab56856ab20bd6d1d0b`, 29 commits ahead of `origin/main`, and contains the successor feature set: notification operations, schedule availability, Mercado Pago foundations, promotions, loyalty, public cancellation, and physical-QA runtime hardening. That set requires the new version `mvp-1.2.0`.

## Initial production capability choices

- Public booking, promotions, loyalty, cancellation, and notification delivery are in release scope.
- The notification worker is required in production.
- `PAYMENTS_ENABLED=false` is the initial production posture. Mercado Pago code remains present, but no payment credentials or payment workers are required and tenant deposit policies cannot force provider use.
- Payment activation is a separate post-release gate with real OAuth, webhook signature/delivery, authoritative reconciliation, worker, and operational review evidence.
- The public web sends `Referrer-Policy: no-referrer`, baseline hardening headers, and redacts bearer booking references from upstream error paths.

## Database truth

Committed migration history is canonical. A disposable PostgreSQL database built from all 26 migrations was compared to `apps/api/prisma/schema.prisma`. The Prisma schema was corrected to describe the already-migrated database (two composite unique indexes, nullable promotion usage limit without a DB default, and explicit deployed identifier mappings). No historical migration was edited and no new production migration was needed.

Before a real production migration, review and execute applicable migration `preflight.sql` files read-only against the confirmed target, verify a backup/restore path, then use only:

```bash
npm run db:migrate:deploy --workspace @barberapp/api
```

Production prohibits `db push`, reset, seed, and QA fixture commands.

## Production processes

```bash
node apps/api/dist/index.js
node apps/api/dist/scripts/notificationWorker.js
```

Optional only after payments are explicitly activated:

```bash
node apps/api/dist/scripts/paymentWebhookWorker.js
node apps/api/dist/scripts/paymentExpirationWorker.js
```

See [`railway-mvp-deployment.md`](./railway-mvp-deployment.md) and [`api-production-runbook.md`](./api-production-runbook.md).

## External gates remaining after repository verification

- independent review/CI of the candidate commit and later immutable tag creation;
- Railway PostgreSQL/API/notification-worker provisioning, variables, backups, migration preflights, deployment, health, and notification proof;
- production Clerk secrets, webhook registration, and staff-auth proof;
- SMTP provider credentials/domain delivery proof;
- public-web hosting/domain/TLS and full production public-booking smoke;
- permanent Android application ID/EAS project/store ownership/assets/signing choice, followed by focused signed Android production QA.

Historical Expo Go and public-browser physical QA remain useful functional evidence; do not repeat the entire old matrix. They do not replace the focused deployed/signed artifact checks above.
