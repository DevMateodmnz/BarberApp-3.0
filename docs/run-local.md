# Run BarberApp locally

## Databases

Shared local Postgres:

- `5432` → shared `kamikaze-postgres`
- BarberApp database: `barberapp`
- Do not modify `kamikaze_db`

Isolated test Postgres:

- `5433` → `postgres_test`
- Start only when needed:

```bash
docker compose up -d postgres_test
DATABASE_URL_TEST='postgresql://postgres:postgres@localhost:5433/barberapp_test' \
  npm run db:migrate:test --workspace @barberapp/api
```

Stop it after the test batch:

```bash
docker compose stop postgres_test
```

## Mailpit for local email

Start Mailpit:

```bash
docker compose up -d mailpit
```

Ports:

- SMTP: `1025`
- Web UI: `8025`

Suggested `apps/api/.env` values:

```env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM_EMAIL=turnos@example.invalid
SMTP_FROM_NAME=BarberApp
PUBLIC_WEB_BASE_URL=http://localhost:3001
```

Stop Mailpit when done:

```bash
docker compose stop mailpit
```

## Notification worker

Run one batch:

```bash
npm run notifications:worker --workspace @barberapp/api -- --once
```

Run continuously:

```bash
npm run notifications:worker --workspace @barberapp/api
```

## Mercado Pago local payment setup

Suggested `apps/api/.env` values for local development:

```env
PAYMENT_CREDENTIAL_ENCRYPTION_KEY=base64-32-byte-key
MERCADO_PAGO_CLIENT_ID=your-sandbox-client-id
MERCADO_PAGO_CLIENT_SECRET=your-sandbox-client-secret
MERCADO_PAGO_REDIRECT_URI=http://localhost:3000/api/v1/payments/mercado-pago/oauth/callback
MERCADO_PAGO_WEBHOOK_SECRET=your-sandbox-webhook-secret
PUBLIC_WEB_BASE_URL=http://localhost:3001
PAYMENT_WEBHOOK_PUBLIC_URL=http://localhost:3000/api/v1/webhooks/mercado-pago
```

Notes:

- use sandbox/test Mercado Pago credentials only
- do not log tokens or authorization codes
- production credential activation is out of scope for this milestone

## Payment workers

Webhook reconciliation worker:

```bash
npm run payments:webhooks --workspace @barberapp/api -- --once
```

Hold expiration worker:

```bash
npm run payments:expire-holds --workspace @barberapp/api -- --once
```

Run continuously during local development only when needed:

```bash
npm run payments:webhooks --workspace @barberapp/api
npm run payments:expire-holds --workspace @barberapp/api
```

Stop both workers before finishing the batch.


## Payment sandbox readiness

Validate local payment configuration without printing secrets or calling Mercado Pago by default:

```bash
npm run payments:sandbox-readiness --workspace @barberapp/api
```

Checks include:

- OAuth redirect URI shape
- direct webhook public URL shape
- public-web base URL shape
- encryption key shape
- required payment/review migrations applied
- payment tables present
- public-web webhook proxy removed
