# MVP Manual QA — Device Testing Setup

How to start the BarberApp MVP stack locally, bootstrap deterministic OWNER/BARBER QA identities, and connect a real Android phone or emulator for manual QA.

## Prerequisites

- [ ] **Node.js** >= 20, **npm** >= 10
- [ ] **Docker** (for PostgreSQL containers)
- [ ] **Clerk development app** with two QA users already created
- [ ] **Expo Go** installed on the test device (Android)
- [ ] **Git** — repo cloned at `BarberApp-3.0/`

---

## Quick Path

```bash
# First-time identity setup only:
cp apps/api/.env.qa.local.example apps/api/.env.qa.local
# Fill the two real Clerk user IDs, then:
npm run qa:bootstrap --workspace @barberapp/api
npm run qa:verify --workspace @barberapp/api

# First-time physical-QA payment-key setup only:
npm run qa:physical:configure

# Every QA session:
npm run qa:physical:start
npm run qa:physical:status
```

The physical-QA harness starts API, public web, and Expo/Metro together, keeps
their API target consistent, persists logs and PIDs, and proves live readiness.
Do not replace these commands with old terminal notes. See `docs/run-local.md`
for architecture, evidence snapshots, and safe cleanup.

---

## 1. Database Startup

Physical QA uses the existing shared local PostgreSQL service on:

- host: `localhost`
- port: `5432`
- database: `barberapp`

The harness never starts, stops, resets, seeds, or migrates shared PostgreSQL
automatically. If another shared container already owns `5432` (for example
`kamikaze-postgres`), do not run `docker compose up postgres` on top of it.

The separate repository test PostgreSQL container uses port `5433`. The harness
uses it briefly as an isolated schema-comparison shadow and stops it before the
physical-QA app services start.

Verify:

```bash
docker ps --filter "name=postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

For intentional database maintenance outside the harness, apply the committed
migration chain explicitly:

```bash
npm run db:migrate:deploy --workspace @barberapp/api
npm run db:generate --workspace @barberapp/api
```

If you intentionally want a fresh local demo baseline, run the demo seed again:

```bash
npm run db:seed --workspace @barberapp/api
```

> The demo seed uses fake/demo Clerk IDs on purpose. After any reseed, run the QA bootstrap again so the real local OWNER/BARBER Clerk mappings are restored deterministically.

### Migration-first safety note

- For normal local release QA, prefer the committed migration chain (`prisma migrate deploy`) over `db:push`.
- `db:push` is useful for rapid schema prototyping, but it is **not** the normal release-QA path because it can make the schema look correct while leaving Prisma migration history unapplied.
- If your local database already matches the current schema but `_prisma_migrations` is missing, first verify schema parity carefully. Only then consider `prisma migrate resolve --applied ...` to rebuild migration history without changing real data.
- If you are not sure whether the schema and migration history match, stop and inspect the database before doing anything destructive.

---

## 2. API Environment

Copy and edit `apps/api/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/barberapp
CLERK_SECRET_KEY=sk_test_<your-real-clerk-secret-key>
CLERK_WEBHOOK_SECRET=whsec_<real-or-placeholder-webhook-secret>
NODE_ENV=development
PORT=3000
# Optional explicit browser allowlist for local web-based callers:
# CORS_ALLOWED_ORIGINS=http://localhost:8081,http://192.168.x.x:8081
```

`CLERK_SECRET_KEY` is required for authenticated backend requests. `CLERK_WEBHOOK_SECRET` is required when you want local Clerk webhook verification to succeed. The mobile publishable key belongs in `apps/mobile/.env.local`, not the API `.env`.

The API also requires a valid 32-byte payment credential encryption key because
payment services are initialized when the API route graph is imported. Create
the ignored local override without displaying the key:

```bash
npm run qa:physical:configure
```

Start and verify the complete runtime:

```bash
npm run qa:physical:start
npm run qa:physical:status
```

---

## 3. Deterministic Local QA Identity Bootstrap

### 3a. Prepare the ignored local QA config

Use the tracked placeholder file as the template:

```bash
cp apps/api/.env.qa.local.example apps/api/.env.qa.local
```

Then edit `apps/api/.env.qa.local` and provide only the minimum real local identity mapping values:

```env
QA_OWNER_CLERK_USER_ID=user_<real-owner-id>
QA_BARBER_CLERK_USER_ID=user_<real-barber-id>
```

Optional values are available if your local Clerk sync needs to store a specific email, display name, or QA barbershop name. Leave them unset unless you intentionally need them.

Important:

- `apps/api/.env.qa.local` is local-only and ignored by Git.
- Never commit real Clerk IDs, personal emails, Clerk secrets, or tokens.
- Do **not** edit source code just to change QA mappings.

### 3b. Bootstrap the local QA rows

Run:

```bash
npm run qa:bootstrap --workspace @barberapp/api
```

The bootstrap is designed to:

- refuse production or remote databases unless explicitly overridden
- reject placeholder or invalid Clerk IDs
- reuse and reconcile the intended local QA users instead of creating duplicates
- preserve the QA barbershop, OWNER role, BARBER role, and active BARBER employee row
- fail loudly if the expected local QA entities are ambiguous or unsafe to reassign
- print only masked identity output

### 3c. Verify the local QA rows

Run:

```bash
npm run qa:verify --workspace @barberapp/api
```

This confirms the local prerequisites for `/me/context` are structurally correct:

- exactly one intended OWNER Clerk mapping
- exactly one intended BARBER Clerk mapping
- OWNER role and barbershop ownership are correct
- BARBER role and active employee association are correct
- no duplicate active employee/user mapping was created for the QA flow

---

## 4. Mobile Environment

Create `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-clerk-publishable-key>
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

For a real phone, the harness discovers the active LAN address and overrides
`EXPO_PUBLIC_API_URL` for the Metro process. Do not commit or repeatedly edit a
machine-specific IP.

---

## 5. Device Connection

### Android Emulator

Change `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
```

`10.0.2.2` is the Android emulator alias for the host machine.

### Physical Android Phone

1. Make sure the phone and development machine are on the same Wi-Fi network.
2. Run `npm run qa:physical:start`.
3. Confirm `npm run qa:physical:status` reports `READY`.
4. Open the printed `exp://<LAN-IP>:8081` URL in Expo Go, or scan Expo's QR
   code.

To resume on another day, always run `npm run qa:physical:status`. If it is not
ready, run `npm run qa:physical:start`; the harness removes only stale,
identity-verified BarberApp process groups and refuses unrelated listeners.

When finished:

```bash
npm run qa:physical:stop
```

This leaves shared PostgreSQL `5432` running and reports any unexpected app
listener.

---

## 6. Manual OWNER/BARBER Context Check

After API and Expo are running:

1. Sign in with the real OWNER QA account.
2. Confirm the OWNER lands in the intended QA barbershop context.
3. Sign out.
4. Sign in with the real BARBER QA account.
5. Confirm the BARBER lands in the same QA barbershop with barber-only visibility.

If a reseed/reset was performed immediately before QA, rerun both commands first:

```bash
npm run qa:bootstrap --workspace @barberapp/api
npm run qa:verify --workspace @barberapp/api
```
