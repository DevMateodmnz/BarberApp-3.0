# Public Booking Pilot Release Runbook

Use this runbook to prepare and verify the first controlled public-booking pilot. It does **not** claim a public launch; it describes how to release the pilot safely.

## Required infrastructure

- PostgreSQL for the shared application database.
- Express API from `apps/api`.
- Next.js public web from `apps/public-web`.
- Clerk configured for **staff authentication only** (`CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`).
- Public web domain that serves `/barberias/:slug`.
- API base URL reachable by the public web BFF through `PUBLIC_WEB_API_URL`.

Architecture reminder:

- Anonymous customers use the **Next.js public web**.
- The browser talks to the **Next.js BFF**.
- The BFF talks server-to-server to the **Express API**.
- Native Expo mobile talks directly to the API and does **not** need browser CORS.

## Required environment variables

### API (`apps/api`)

| Variable | Required | Notes |
|---|---:|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `NODE_ENV` | yes | `production` for deployed API |
| `PORT` | no | Defaults to `3000` |
| `CLERK_SECRET_KEY` | yes | Staff auth backend secret |
| `CLERK_WEBHOOK_SECRET` | yes | Clerk webhook signing secret |
| `CORS_ALLOWED_ORIGINS` | no | Set only for real direct browser-to-API consumers |
| `RATE_LIMIT_ENABLED` | no | Optional override |
| `RATE_LIMIT_WINDOW_MS` | no | Optional override |
| `RATE_LIMIT_MAX` | no | Optional override |

### Public web (`apps/public-web`)

| Variable | Required | Notes |
|---|---:|---|
| `PUBLIC_WEB_API_URL` | yes | Absolute Express API base URL ending in `/api/v1` |
| `PORT` | no | `next start --port 3001` in local/probe workflows |

### Actual commands

```bash
# API
npm run build --workspace @barberapp/api
npm run start --workspace @barberapp/api

# Public web
npm run build --workspace @barberapp/public-web
npm run start --workspace @barberapp/public-web
```

## Database migration order

1. Backup the production database.
2. Run API Prisma generation if your deploy flow needs it:

   ```bash
   npm run db:generate --workspace @barberapp/api
   ```

3. Apply migrations **before** starting the new API:

   ```bash
   npm run db:migrate:deploy --workspace @barberapp/api
   ```

4. Start the updated API.
5. Start or deploy the updated public web.

Do **not** use `prisma db push`, `qa:bootstrap`, or E2E fixture commands in production.

## Pilot shop provisioning

### Production-safe operational commands

#### 1. Assign or remove the public slug

```bash
npm run public-slug --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --slug "Barbería Central" \
  --dry-run
```

```bash
npm run public-slug --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --unpublish \
  --dry-run
```

Remove `--dry-run` only after reviewing the printed target.

#### 2. Create staff services through the authenticated OWNER API

```bash
curl -X POST "$API_BASE_URL/barbershops/<barbershop-id>/services" \
  -H "Authorization: Bearer <owner-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Corte clásico",
    "durationMinutes": 30,
    "price": 3200,
    "currency": "ARS",
    "description": "Servicio piloto"
  }'
```

#### 3. Add the barber as an employee

```bash
curl -X POST "$API_BASE_URL/barbershops/<barbershop-id>/employees" \
  -H "Authorization: Bearer <owner-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<existing-user-id>"
  }'
```

#### 4. Assign the service to the employee

```bash
curl -X POST "$API_BASE_URL/barbershops/<barbershop-id>/employees/<employee-id>/services" \
  -H "Authorization: Bearer <owner-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "<service-id>"
  }'
```

#### 5. Configure weekly hours

```bash
curl -X PUT "$API_BASE_URL/barbershops/<barbershop-id>/working-hours" \
  -H "Authorization: Bearer <owner-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "hours": [
      { "dayOfWeek": 1, "isActive": true, "openTime": "09:00", "closeTime": "19:00" },
      { "dayOfWeek": 2, "isActive": true, "openTime": "09:00", "closeTime": "19:00" },
      { "dayOfWeek": 3, "isActive": true, "openTime": "09:00", "closeTime": "19:00" },
      { "dayOfWeek": 4, "isActive": true, "openTime": "09:00", "closeTime": "19:00" },
      { "dayOfWeek": 5, "isActive": true, "openTime": "09:00", "closeTime": "19:00" },
      { "dayOfWeek": 6, "isActive": true, "openTime": "09:00", "closeTime": "14:00" },
      { "dayOfWeek": 0, "isActive": false }
    ]
  }'
```

#### 6. Configure date-specific schedule exceptions

```bash
npm run schedule-exception --workspace @barberapp/api -- \
  --barbershop-id <barbershop-id> \
  --local-date 2026-07-20 \
  --interval 09:00-12:00 \
  --interval 15:00-18:00 \
  --dry-run
```

### Unsupported manual database operations

- Direct `UPDATE` / `INSERT` statements against public booking tables are **unsupported** for pilot operations.
- Do not hand-edit `Barbershop.publicSlug`, idempotency rows, public references, consent fields, or schedule-exception tables in production.

### QA fixture commands — never use in production

```bash
npm run fixture:public-booking:e2e --workspace @barberapp/api -- setup <fixture-key>
npm run fixture:public-booking:e2e --workspace @barberapp/api -- cleanup <fixture-key>
npm run fixture:public-booking:e2e --workspace @barberapp/api -- cleanup-all
```

These commands are for isolated E2E automation only.

## Release order

1. Backup PostgreSQL.
2. Deploy API migration.
3. Deploy API.
4. Verify `/health` and `/api/v1/ping`.
5. Provision or verify the pilot shop data.
6. Deploy the public web.
7. Run a public smoke booking.
8. Verify the appointment is visible to staff through existing staff surfaces.
9. Share the public link.
10. Monitor errors, booking conflicts, and abuse/rate-limit pressure.

## Rollback

- Disable or remove the public link first.
- Stop or roll back the **public web** independently if needed.
- Keep the existing staff API/mobile application operational.
- Do **not** delete appointments already created by the pilot.
- Roll back application versions carefully; database schema rollback is not automatic.
- Preserve public references and consent records for already-created appointments.

## Known pilot limitations

- No customer accounts.
- No self-service cancellation or rescheduling.
- No notifications.
- No payments.
- No “any barber” selection.
- No multi-location support.
- API rate-limit storage is in-memory only.
- Confirmation cannot be recovered through public lookup by reference.
- Owner/shop provisioning remains controlled and manual.
