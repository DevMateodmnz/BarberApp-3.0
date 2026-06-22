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
# 1. Start only the development database

docker compose up -d postgres

# 2. Install deps (first time only)
npm install

# 3. Reset or sync the local dev schema as needed
npm run db:push --workspace @barberapp/api

# 4. Seed demo data
npm run db:seed --workspace @barberapp/api

# 5. Create ignored local QA config from the tracked template
cp apps/api/.env.qa.local.example apps/api/.env.qa.local

# 6. Fill the two real Clerk user IDs in apps/api/.env.qa.local

# 7. Reconcile deterministic local QA mappings
npm run qa:bootstrap --workspace @barberapp/api
npm run qa:verify --workspace @barberapp/api

# 8. Start API and mobile
npm run dev --workspace @barberapp/api
npm run dev --workspace @barberapp/mobile
```

---

## 1. Database Startup

Start only the development PostgreSQL container for local QA:

```bash
docker compose up -d postgres
```

This exposes the development database at:

- host: `localhost`
- port: `5432`
- database: `barberapp`

The separate test PostgreSQL container uses port `5433` and is **not** required for normal device QA.

Verify:

```bash
docker ps --filter "name=postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Apply the current schema:

```bash
npm run db:push --workspace @barberapp/api
```

If you intentionally want a fresh local demo baseline, run the demo seed again:

```bash
npm run db:seed --workspace @barberapp/api
```

> The demo seed uses fake/demo Clerk IDs on purpose. After any reseed, run the QA bootstrap again so the real local OWNER/BARBER Clerk mappings are restored deterministically.

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
# ALLOWED_ORIGIN=http://localhost:8081,http://192.168.x.x:8081
```

`CLERK_SECRET_KEY` is required for authenticated backend requests. `CLERK_WEBHOOK_SECRET` is required when you want local Clerk webhook verification to succeed. The mobile publishable key belongs in `apps/mobile/.env.local`, not the API `.env`.

Start the API:

```bash
npm run dev --workspace @barberapp/api
```

Verify:

```bash
curl http://localhost:3000/health
# -> {"status":"ok","timestamp":"..."}
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

For a real phone on the same LAN, replace `localhost` with the development machine's LAN IP before starting Expo.

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
2. Set `EXPO_PUBLIC_API_URL` to the development machine's LAN IP, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api/v1
```

3. Start Expo:

```bash
npm run dev --workspace @barberapp/mobile
```

4. Scan the QR code with Expo Go.

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
