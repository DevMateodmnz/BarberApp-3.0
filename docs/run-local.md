# Run BarberApp locally

## Physical-device QA (recommended)

Use the repository harness instead of starting three development terminals by
hand. The harness is the authoritative source for whether a physical-QA runtime
is current.

### One-time local configuration

The API imports payment routes during startup. Those routes import payment
services whose module-level runtime config requires an AES-256-GCM credential
encryption key even when the QA flow does not exercise payments. Production
must always provide its own managed key; local development uses a separate,
ignored key:

```bash
npm run qa:physical:configure
```

This creates `apps/api/.env.physical-qa.local` with mode `0600`, generates 32
random bytes, and does not print the key. Re-running the command validates the
existing file and never rotates it. Keep the file while local encrypted payment
credentials exist; deleting or replacing it can make those credentials
unreadable.

The other required values remain in their existing ignored files:

- `apps/api/.env`: local `DATABASE_URL` and Clerk backend key
- `apps/mobile/.env.local`: Clerk publishable key
- `apps/api/.env.qa.local`: deterministic OWNER/BARBER QA mappings

No real key, token, personal credential, or machine IP belongs in Git.

### Start, prove, inspect, and stop

```bash
npm run qa:physical:start
npm run qa:physical:status
npm run qa:physical:snapshot -- loyalty --barbershop qa-barbershop
tail -f .qa-runtime/logs/*.log
npm run qa:physical:stop
```

`qa:physical:start`:

1. proves the repository, branch, HEAD, Node/npm, Docker, and Git drift;
2. validates required environment values by shape without printing them;
3. requires the shared target `localhost:5432/barberapp` and refuses `5433`;
4. checks Prisma migration status and performs a read-only comparison between
   the shared schema and the committed migration chain (it starts `5433` only
   as an isolated temporary shadow database and stops it before app startup);
5. refuses unrelated listeners on API `3000`, public web `3001`, or Metro
   `8081`;
6. discovers the active LAN IPv4 address rather than hardcoding one;
7. starts the API, public web, and Expo/Metro with one consistent LAN API URL;
8. waits for API health and ping, the QA public page, Metro, and their LAN
   equivalents;
9. cleans up the partial process groups if any startup boundary fails; and
10. prints exact local/LAN URLs and inspection commands.

Runtime artifacts are ignored under `.qa-runtime/`:

- `runtime.json`: non-secret branch, HEAD, start/readiness times, LAN IP,
  sanitized database target, URLs, PIDs, process groups, start identities, and
  log paths
- `logs/api.log`, `logs/publicWeb.log`, `logs/metro.log`: timestamped persistent
  output
- `snapshots/*.json`: timestamped, bounded, read-only QA evidence

`qa:physical:status` exits nonzero unless every recorded process still has the
same start identity and working directory, owns its expected listener, passes
readiness, uses the recorded API URL, and belongs to the current repository
HEAD. Old metadata alone never proves readiness. If a terminal, machine, or
process died between sessions, run `status` first and then `start`; never infer
that services survived from yesterday's notes.

`qa:physical:stop` verifies PID start time, command marker, and working
directory before signaling a recorded process group. It never kills an
unrelated port occupant and never stops shared PostgreSQL `5432`. It reports
any unexpected listener left on `3000`, `3001`, or `8081`.

### Physical phone and Expo Go

Keep the phone and development machine on the same LAN. The harness passes the
printed `http://<LAN-IP>:3000/api/v1` target directly to Expo, overriding any
stale machine-specific value for that process. Open Expo Go with the printed
`exp://<LAN-IP>:8081` URL (or scan the QR shown by Expo when available).

The public booking page is printed in both forms:

- local: `http://127.0.0.1:3001/barberias/qa-barbershop`
- LAN: `http://<LAN-IP>:3001/barberias/qa-barbershop`

### Evidence-preserving loyalty snapshots

Capture one snapshot before and one after a manual checkpoint:

```bash
npm run qa:physical:snapshot -- loyalty \
  --barbershop qa-barbershop \
  --phone-suffix 9021 \
  --phone-suffix 9022 \
  --limit 25
```

Phone suffix filters are optional and not hardcoded. The snapshot fails unless
the runtime is currently ready and its database target matches the validated
environment. It reads only and records:

- loyalty configuration and reward-template semantics (never its code);
- fixture counts;
- masked customer identifiers and phones;
- appointment, reward, ledger-event, and redemption status counts; and
- bounded recent timestamps and state.

IDs, public references, and phones are masked; customer names and reward codes
are omitted; records are capped at 100; and the database URL contains no
credentials. Visual UI success is provisional until request/runtime logs and
the authoritative post-action snapshot agree.

### What survives another session

Logs, snapshots, ignored local environment files, and runtime metadata survive
terminal scrollback. Processes do not necessarily survive logout, reboot,
sleep, crashes, or an explicit stop. Always use `qa:physical:status` on a new
day; a successful result includes the current readiness timestamp.

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
# For the physical-QA harness, generate this in the ignored local override with:
# npm run qa:physical:configure
PAYMENT_CREDENTIAL_ENCRYPTION_KEY=base64-encoded-32-byte-key
MERCADO_PAGO_CLIENT_ID=your-sandbox-client-id
MERCADO_PAGO_CLIENT_SECRET=your-sandbox-client-secret
MERCADO_PAGO_REDIRECT_URI=http://localhost:3000/api/v1/payments/mercado-pago/oauth/callback
MERCADO_PAGO_WEBHOOK_SECRET=your-sandbox-webhook-secret
PUBLIC_WEB_BASE_URL=http://localhost:3001
PAYMENT_WEBHOOK_PUBLIC_URL=http://localhost:3000/api/v1/webhooks/mercado-pago
```

Notes:

- use sandbox/test Mercado Pago credentials only
- the encryption key must decode to exactly 32 bytes
- never silently rotate a local key that has encrypted payment credentials
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

## Promotions migration checks

Shared local BarberApp database:

```bash
cd apps/api
npx prisma migrate status
psql postgresql://postgres:postgres@localhost:5432/barberapp -f prisma/migrations/20260716043000_add_promotions_and_coupon_redemptions/preflight.sql
```

Clean-room proof on isolated `5433` service should use a disposable empty database plus:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/<disposable_db> \
  npx prisma migrate deploy
psql postgresql://postgres:postgres@localhost:5433/<disposable_db> \
  -f prisma/migrations/20260716043000_add_promotions_and_coupon_redemptions/preflight.sql
```

Do not run promotions validation against `kamikaze_db`.
