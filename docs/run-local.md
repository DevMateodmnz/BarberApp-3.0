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
