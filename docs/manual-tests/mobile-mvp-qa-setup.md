# MVP Manual QA — Device Testing Setup

How to start the full BarberApp MVP stack on a development machine and connect a real Android phone or emulator for manual QA.

## Prerequisites

- [ ] **Node.js** >= 20, **npm** >= 10
- [ ] **Docker** (for PostgreSQL containers)
- [ ] **Clerk account** with a development application
- [ ] **Expo Go** installed on the test device (Android)
- [ ] **Git** — repo cloned at `BarberApp-3.0/`

---

## Quick Path

```bash
# 1. Start databases
docker compose up -d

# 2. Install deps (first time only)
npm install

# 3. Push schema to dev DB
npm run db:push --workspace @barberapp/api

# 4. Configure env vars — see sections below

# 5. Start API
npm run dev --workspace @barberapp/api

# 6. Start mobile
npm run dev --workspace @barberapp/mobile
```

---

## 1. Database Startup

```bash
docker compose up -d
```

This starts two PostgreSQL containers:

| Container | Port | Database | Purpose |
|-----------|------|----------|---------|
| `barberapp-3.0-postgres-1` | `5432` | `barberapp` | Development |
| `barberapp-3.0-postgres_test-1` | `5433` | `barberapp_test` | Tests (not needed for QA) |

Verify:

```bash
docker ps --filter "name=postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Push the Prisma schema:

```bash
npm run db:push --workspace @barberapp/api
```

If you need to reset everything:

```bash
docker compose down -v && docker compose up -d && npm run db:push --workspace @barberapp/api
```

---

## 2. API Environment

Copy and edit `apps/api/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/barberapp
CLERK_SECRET_KEY=sk_test_<your-real-clerk-secret-key>
CLERK_PUBLISHABLE_KEY=pk_test_<your-real-clerk-publishable-key>
NODE_ENV=development
PORT=3000
```

**Both Clerk keys are required**: The Clerk backend SDK uses `CLERK_PUBLISHABLE_KEY` for JWT verification and `CLERK_SECRET_KEY` for server-to-server operations. Go to Clerk Dashboard → API Keys to copy both.

Start the API:

```bash
npm run dev --workspace @barberapp/api
```

Verify:

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

---

## 3. Minimum Data for QA

The mobile app cannot create users or barbershops. You need to seed the database with:

- 1 OWNER user (linked to a real Clerk account)
- 1 BARBER user (linked to a real Clerk account)
- 1 barbershop owned by the OWNER

Everything else (services, employee records, assignments) can be created through the mobile app during QA.

### 3a. Create Clerk Test Accounts

In **Clerk Dashboard → Users → Add User**, create two test accounts:

| Account | Email | Role metadata |
|---------|-------|---------------|
| Owner | `owner@yourdomain.com` | `{ "role": "OWNER" }` |
| Barber | `barber@yourdomain.com` | `{ "role": "BARBER" }` |

After creating each user, copy their **Clerk User ID** (e.g. `user_<clerk-id>…`). You'll need these for the DB insert.

> **Alternative: Clerk Backend API** — If you have the secret key, you can create test users programmatically:
> ```bash
> curl -X POST https://api.clerk.com/v1/users \
>   -H "Authorization: Bearer $CLERK_SECRET_KEY" \
>   -H "Content-Type: application/json" \
>   -d '{"email_address":["owner@test.com"],"public_metadata":{"role":"OWNER"},"skip_password_checks":true,"skip_password_requirement":true}'
> ```
> Then set a password: `PATCH /v1/users/{id} -d '{"password":"...yourpassword..."}'`
>
> This avoids the Clerk Dashboard entirely and is useful for CI/automation.

> **Note about roles**: The mobile app uses Clerk's `publicMetadata.role` to determine user role. Set it in Clerk Dashboard → Users → click user → Metadata → Public.

### 3b. Insert DB Rows

The Clerk-to-DB sync normally happens via the webhook, but for local QA the webhook requires a public URL (e.g. ngrok). The quickest path is manual insert.

Open Prisma Studio:

```bash
npm run db:studio --workspace @barberapp/api
```

Then create these rows manually, or use the SQL below.

#### Quick SQL (connect with `psql` or Prisma Studio raw query)

```sql
-- Replace the IDs with your real Clerk user IDs!
-- Owner user (replace 'user_owner_clerk_id')
INSERT INTO "User" (id, "clerkUserId", email, name, role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'user_OWNER_CLERK_ID',
  'owner@yourdomain.com',
  'QA Owner',
  'OWNER',
  NOW(),
  NOW()
);

-- Barber user (replace 'user_barber_clerk_id')
INSERT INTO "User" (id, "clerkUserId", email, name, role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'user_BARBER_CLERK_ID',
  'barber@yourdomain.com',
  'QA Barber',
  'BARBER',
  NOW(),
  NOW()
);

-- Barbershop — use the Owner's DB user ID (UUID from the first insert)
INSERT INTO "Barbershop" (id, "ownerId", name, address, phone, timezone, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  '<OWNER_DB_UUID>',
  'QA Barbershop',
  'Av. Corrientes 1234, CABA',
  '+54 11 5555-0000',
  'America/Argentina/Buenos_Aires',
  true,
  NOW(),
  NOW()
);
```

> **Prisma Studio path**: Open `http://localhost:5555`, create a `User` row for each Clerk account, then a `Barbershop` row with `ownerId` set to the Owner's UUID.

### 3c. Verify Data

After inserts, verify the users exist:

```bash
curl http://localhost:3000/api/v1/me/context \
  -H "Authorization: Bearer <clerk-jwt>"
```

(You'll get a JWT from the mobile app after sign-in.)

---

## 4. Mobile Environment

Create `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-clerk-publishable-key>
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

**Clerk publishable key**: Clerk Dashboard → API Keys → copy the **Publishable Key** (starts with `pk_test_`).

The default `EXPO_PUBLIC_API_URL` works for Expo Go running on the same machine as the API. For a real device, change it — see below.

---

## 5. Device Connection

### Android Emulator

Change `.env.local`:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
```

`10.0.2.2` is the Android emulator's alias for the host machine's `localhost`.

Start the mobile app:

```bash
npm run dev --workspace @barberapp/mobile
```

Press `a` to open on the running emulator, or scan the QR code with the emulator's Expo Go.

### Physical Android Phone

Both your phone and computer must be on the **same Wi-Fi network**.

1. Find your computer's LAN IP:

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# or: hostname -I
```

2. Change `.env.local`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.XX:3000/api/v1
```

(Replace `192.168.1.XX` with your actual LAN IP.)

3. Start mobile:

```bash
npm run dev --workspace @barberapp/mobile
```

4. Scan the QR code with Expo Go on your phone.

> **Firewall note**: If the phone can't connect, check that port `3000` (API) and the Expo port (usually `8081`) are allowed through your firewall:
> ```bash
> sudo ufw allow 3000/tcp
> sudo ufw allow 8081/tcp
> ```

---

## 6. Startup Verification Checklist

Before starting QA, confirm:

- [ ] `docker compose up -d` — both PostgreSQL containers running
- [ ] `npm run dev --workspace @barberapp/api` — API responding at `/health`
- [ ] Clerk publishable key and secret key are real (not placeholder)
- [ ] Clerk test accounts created (OWNER + BARBER)
- [ ] `User` rows exist in DB with matching `clerkUserId` values
- [ ] `Barbershop` row exists with correct `ownerId`
- [ ] Mobile `.env.local` has correct `EXPO_PUBLIC_API_URL` for your device
- [ ] Mobile app starts in Expo Go without the "Missing Clerk Key" error
- [ ] Sign-in screen appears

---

## 7. Recommended QA Order

After setup is verified, run the QA checklists in this order:

| # | Document | What It Covers | Est. Time |
|---|----------|----------------|-----------|
| 1 | **[mobile-services-management.md](./mobile-services-management.md)** | Create/edit/deactivate services | 20 min |
| 2 | **[mobile-employee-onboarding.md](./mobile-employee-onboarding.md)** | Add employee by email, validation, error paths | 15 min |
| 3 | **[mobile-service-record-creation.md](./mobile-service-record-creation.md)** | Create records (OWNER + BARBER), price handling | 25 min |
| 4 | **[mobile-daily-operations-e2e.md](./mobile-daily-operations-e2e.md)** | Full E2E loop (128 steps, all 4 screens) | 45 min |

**Why this order**: Services must exist before employees can be assigned. Employees must be assigned before records can be created. The E2E doc ties everything together and should be run last.

Start with the **Services** checklist — as the OWNER, create `Classic Cut` ($50.00, 30min) and `Beard Trim` ($30.00, 20min). Then continue with **Employee Onboarding** to add the BARBER and assign services.

---

## 8. Known Limitations

- **No barbershop creation in mobile**: The barbershop must be inserted manually in the DB. There is no API endpoint or mobile screen for creating a barbershop.
- **No user creation in mobile**: Users must be created in Clerk Dashboard (or via Clerk Backend API). The mobile app has no sign-up flow that creates DB `User` rows — that requires the Clerk webhook or manual insert.
- **Webhook needs public URL**: The Clerk→DB user sync webhook requires Clerk to reach your API. For local dev, use ngrok or insert users manually.
- **`CLERK_PUBLISHABLE_KEY` required in API .env**: The Clerk backend SDK needs BOTH the secret key and the publishable key. Without `CLERK_PUBLISHABLE_KEY`, protected endpoints return HTTP 500 "Publishable key is missing."
- **`tsx` does not auto-load `.env`**: The API dev script uses `tsx watch --env-file=.env` to load environment variables. This was added in PR-072A commit `2e3e232`.
- **Clerk test mode**: Clerk's test mode allows any email/password without real email verification. Use this for QA accounts.
- **Existing seed is test-only**: `npm run db:seed --workspace @barberapp/api` creates users with fake Clerk IDs (`owner_clerk_123`). Do not use this for real-device QA — those IDs won't match any real Clerk account.
- **No component/E2E tests**: All mobile QA is manual. There are no automated component or end-to-end tests.
- **CLIENT role untested**: The current MVP checklist has minimal CLIENT coverage (steps 125-128 of the E2E doc). A CLIENT test account is optional.

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Missing Clerk Key" on mobile | `.env.local` doesn't exist or has wrong key | Create it with real publishable key |
| "Publishable key is missing" (HTTP 500) | `CLERK_PUBLISHABLE_KEY` not set in API `.env` | Add both `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to `apps/api/.env` |
| "User not found in database" after sign-in | No `User` row with matching `clerkUserId` | Insert row manually (section 3b) |
| Mobile can't reach API | Wrong `EXPO_PUBLIC_API_URL` for device | Emulator → `10.0.2.2`, phone → LAN IP |
| API won't start | Docker not running, or DB not pushed | `docker compose up -d && npm run db:push` |
| "Employee added" but no services visible | Services not yet created, or not assigned | Create services first, then assign |
| Expo Go can't load app | Phone not on same Wi-Fi as dev machine | Connect to same network, check firewall |
| `prisma db push` fails | DB container not running | `docker compose up -d` and wait for healthy |
| Clerk password rejected (pwned) | Password found in breach database | Use a stronger, unique password |

---

## Next Step

After confirming all startup checks pass → open **[mobile-services-management.md](./mobile-services-management.md)** and begin QA.
