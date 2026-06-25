# BarberApp v3.0 — Security Validation (PR-005C)

## Overview

This document records the results of real backend security validation for PR-005C.
All tests use the **real Express app**, **real Prisma client**, and a **real PostgreSQL test database**.
Auth is mocked ONLY at the Clerk boundary (`x-test-user-id` header in test mode);
all business logic, database queries, and tenant checks run against real infrastructure.

## What Is Validated

### 1. Authentication & Authorization (9 tests)
- ✅ Unauthenticated requests rejected (401)
- ✅ OWNER cannot book appointments (only CLIENT can)
- ✅ BARBER cannot book appointments (only CLIENT can)
- ✅ CLIENT can book appointments (allowed role)
- ✅ CLIENT cannot use management endpoints (PUT status, PUT update)
- ✅ CLIENT cannot use status transition endpoint (403 route-level block)
- ✅ CLIENT can cancel their own appointments
- ✅ BARBER can transition status of their assigned appointments
- ✅ BARBER cannot transition another barber's appointments

### 2. Tenant Isolation (6 tests)
- ✅ `serviceId` from another barbershop rejected when booking
- ✅ `employeeId` from another barbershop rejected when booking
- ✅ CLIENT cannot read another client's appointment (404 - hides existence)
- ✅ OWNER cannot access another tenant barbershop's appointments
- ✅ BARBER from one shop cannot see appointments from another shop
- ✅ Listing appointments for owner only shows their shop's appointments

### 3. Booking Integrity (6 tests)
- ✅ Valid service+employee+barbershop combination succeeds
- ✅ Cross-tenant service+employee combination rejected
- ✅ Non-existent service returns 404
- ✅ Non-existent employee returns 404
- ✅ Non-existent barbershop rejected
- ✅ Created appointment preserves tenant integrity in DB (all IDs verified)

### 4. Double Booking Prevention (6 tests)
- ✅ Sequential double booking blocked (same employee, same time)
- ✅ Overlapping booking blocked (starts during existing appointment)
- ✅ Different employees at same time allowed (no conflict)
- ✅ Same employee at non-overlapping time allowed
- ✅ Reschedule to conflicting time blocked
- ⚠️ Prevention is at application service layer only (no DB exclusion constraint)

### 5. Status Transitions (9 tests)
- ✅ CLIENT can cancel PENDING appointment
- ✅ OWNER can confirm PENDING → CONFIRMED
- ✅ BARBER cannot confirm PENDING (only OWNER allowed)
- ✅ CLIENT cannot transition PENDING → CONFIRMED (403 route-level block)
- ✅ BARBER can transition CONFIRMED → IN_PROGRESS
- ✅ BARBER can transition IN_PROGRESS → COMPLETED
- ✅ Terminal COMPLETED state cannot be changed
- ✅ Terminal CANCELLED state cannot be revived
- ✅ Terminal NO_SHOW state cannot be revived
- ✅ Invalid status values rejected (400 validation)

**Total: 36 integration tests + 27 database tests + 3 unit tests = 66 passing**

## Enforcement Layers

### Code-Enforced Guarantees
These are enforced in the Express application layer:

| Guarantee | Layer | Location |
|-----------|-------|----------|
| Authentication required | Middleware | `src/middleware/auth.ts` |
| Role-based access (routes) | Middleware | `src/middleware/role.ts` |
| Role-based transitions | Service | `src/services/appointmentService.ts` |
| Tenant integrity (booking) | Service | `src/services/appointmentService.ts` |
| Tenant query isolation (OWNER) | Service | `src/services/appointmentService.ts` |
| Tenant query isolation (BARBER) | Service | `src/services/appointmentService.ts` |
| Tenant query isolation (CLIENT) | Service | `src/services/appointmentService.ts` |
| Double-booking detection | Service | `src/services/appointmentService.ts` |
| Status transition validation | Service | `src/services/appointmentService.ts` |
| Input validation | Middleware | `src/middleware/validate.ts` |
| Error response format | Middleware | `src/middleware/errorHandler.ts` |

### Database-Enforced Guarantees
These are enforced at the PostgreSQL level via Prisma schema constraints:

| Guarantee | Constraint | Location |
|-----------|------------|----------|
| Unique clerkUserId | `@unique` | `schema.prisma` User model |
| Unique email | `@unique` | `schema.prisma` User model |
| Unique employee per barbershop | `@@unique([barbershopId, userId])` | `schema.prisma` Employee model |
| Unique employee-service pair | `@@unique([employeeId, serviceId])` | `schema.prisma` EmployeeService model |
| Foreign key integrity (all relations) | Prisma relations | All models |
| Index for performance | `@@index` on FKs | All models |

### NOT Enforced at DB Level (Application-Only)
⚠️ These guarantees depend solely on application code:

| Guarantee | Risk | Mitigation |
|-----------|------|------------|
| Double-booking prevention | Race condition possible | Single Prisma query, but no DB exclusion constraint |
| Cross-tenant data access | Bypassed if service layer skipped | Every service function includes tenant check |
| Status transition rules | Bypassed if direct DB access used | Normal API access goes through service layer |

## How to Run Security Validation

```bash
# 1. Start test database
docker compose up -d postgres_test

# 2. Install dependencies (if needed)
cd apps/api && npm install

# 3. Apply migrations to test DB
export DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5433/barberapp_test"
npm run db:generate --workspace @barberapp/api
npm run db:migrate:test --workspace @barberapp/api

# 4. Run all tests
npm test

# 5. Run only security integration tests
npx vitest run tests/integration/security.test.ts

# 6. Run only DB model tests
npx vitest run tests/db/models.test.ts
```

## Test Infrastructure

- **Test database**: PostgreSQL on `localhost:5433`, database `barberapp_test`
- **Test runner**: Vitest 1.6 with `fileParallelism: false` (sequential file execution)
- **HTTP client**: Supertest against real Express app
- **Auth simulation**: `x-test-user-id` header with real Clerk user IDs stored in test DB
- **Data isolation**: Each test file cleans its own data (`beforeAll`/`afterAll`)
- **Fixtures**: Real users, barbershops, employees, services created in DB

## Remaining Risks / Deferred Work

1. **Concurrent double-booking race — RESOLVED**: DB-level exclusion constraint prevents concurrent double-booking race for same employee + active statuses (PENDING, CONFIRMED, IN_PROGRESS). Application-layer `hasTimeConflict()` check remains as defense-in-depth. See `apps/api/prisma/migrations/20260604_add_db_double_booking_constraint/migration.sql`.

2. **Rate limiting — RESOLVED**: In-memory rate limiting is implemented for `/api/v1/appointments` routes (window: 15 min, max: 100 requests). Uses `express-rate-limit` with MemoryStore — acceptable for single-instance MVP. Production horizontal scaling should use a shared store (Redis, etc.). See `apps/api/src/middleware/rateLimit.ts`.

3. **CORS**: Production now requires an explicit HTTP(S) allowlist in `ALLOWED_ORIGIN`. Non-production can reflect concrete request origins dynamically for credentialed local development, but never returns `*` with credentials.

4. **Clerk webhook — RESOLVED**: Webhook endpoint implemented at `POST /api/v1/webhooks/clerk` with Svix signature verification via `standardwebhooks`. Handles `user.created`, `user.updated`, `user.deleted` events. Role is now read from Clerk `public_metadata.role` (valid values: `OWNER`, `BARBER`, `CLIENT`). When metadata is absent or invalid, defaults to `CLIENT`. Webhook NEVER downgrades an existing `OWNER` or `BARBER` role via `user.updated` — privilege preservation is enforced by `resolveRole()` in `userSyncService.ts`. The DB `User.role` remains the runtime source of truth for auth middleware. `unsafe_metadata` is intentionally NOT trusted for role assignment. See `apps/api/src/services/userSyncService.ts`.

   **Remaining limitation**: OWNER/BARBER role bootstrap is done via Clerk Dashboard (`public_metadata: { role: "OWNER" }`). There is no internal backend endpoint for OWNER-managed employee creation or role assignment yet (deferred to future PR).

5. **EmployeeService validation at booking — RESOLVED**: `createAppointment()` now validates the selected employee is assigned to the selected service via the EmployeeService junction table (`@@unique([employeeId, serviceId])`). Returns 400 BadRequestError if not assigned. See `apps/api/src/services/appointmentService.ts:validateEmployeeOffersService()`.

6. **Business hours enforcement — RESOLVED**: `createAppointment()` and `updateAppointment()` now validate that appointment times fall within the barbershop's configured `WorkingHours`. Each barbershop configures its own schedule per day-of-week (Mon-Sun) with open/close times in "HH:mm" 24h format. Validation uses the barbershop's `timezone` field (default: `America/Argentina/Tucuman`) to convert UTC appointment timestamps to local day-of-week and time-of-day. Closed days (no `WorkingHours` row) reject bookings with a 400 error. Time boundary checks validate both start and end time against opening/closing. See `apps/api/src/lib/businessHours.ts` and `apps/api/prisma/migrations/20260605052616_add_working_hours/migration.sql`.

   **Remaining limitation**: If a barbershop has zero `WorkingHours` rows (no schedule configured at all), appointments are rejected for every day. Barbershop owners must configure their schedule to accept appointments. Timezone support relies on Node.js `Intl.DateTimeFormat` — no external tz library is used. Overnight appointments (crossing midnight in local time) are explicitly rejected. Employee-level schedule overrides (e.g., a specific barber working different hours) are deferred to a future PR.

7. **BARBER `listAppointments` — RESOLVED**: `listAppointments()` now fails closed (403 ForbiddenError) when called with `role=BARBER` and no `employeeId`. This prevents the broad data leak where an unfiltered query (`WHERE {}`) could return all appointments across all tenants. BARBER listing with a valid `employeeId` still works correctly — scoped to only that barber's appointments. The fix is defense-in-depth in the service layer, independent of middleware ordering. See `apps/api/src/services/appointmentService.ts:listAppointments()`.

   **Remaining limitation**: The HTTP route `GET /api/v1/appointments` does not set `employeeId` for BARBER users (no `requireBarbershopAccess` middleware on the listing route). BARBERs currently cannot list their appointments via HTTP — they must use `GET /api/v1/appointments/:id` for single-appointment access. A dedicated BARBER listing endpoint or middleware enhancement is deferred to a future PR.

   **Update**: BARBER scoped appointment listing — RESOLVED in PR-020. `GET /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments` provides a barbershop-scoped endpoint. BARBERs can list only their own appointments (employee.userId must match authenticated user). OWNERs can list appointments for any active employee in their barbershop. CLIENTs are blocked (403). The global `GET /api/v1/appointments` BARBER fail-closed behavior is preserved.

8. **OWNER-managed employee creation — RESOLVED**: `POST /api/v1/barbershops/:barbershopId/employees` allows an OWNER to add existing users as employees of their barbershop. Tenant isolation is enforced by `requireBarbershopAccess` (cross-tenant blocked with 403). Duplicate employee links return 409 Conflict via the `@@unique([barbershopId, userId])` constraint. The endpoint does NOT modify `User.role`, create Clerk users, or send invitations. See `apps/api/src/routes/barbershops.ts` and `apps/api/src/services/employeeService.ts`.

   **Remaining limitations**:
   - Target user must already exist in DB (synced via Clerk webhook). No auto-provisioning.
   - Role assignment is separate — use Clerk Dashboard `public_metadata.role` (PR-013).
   - Service assignment for employees — RESOLVED in PR-015. `POST /api/v1/barbershops/:barbershopId/employees/:employeeId/services` assigns a service; `DELETE .../services/:serviceId` unassigns. See `apps/api/src/routes/barbershops.ts` and `apps/api/src/services/employeeService.ts`.
   - Employee listing — RESOLVED in PR-016. `GET /api/v1/barbershops/:barbershopId/employees` returns all non-deleted employees for a barbershop (OWNER only). Response includes safe user fields only (id, email, name, role) — no clerkUserId or internal fields exposed. Assigned services listing remains deferred.
   - Employee deactivation — RESOLVED in PR-017. `DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId` soft-deletes an employee (isActive=false, deletedAt=now). Does not modify User, User.role, appointments, or EmployeeService links. Existing validations reject deactivated employees for booking (400) and service assignment (404).
    - Service management — RESOLVED in PR-022. Full CRUD for barbershop services: `POST /api/v1/barbershops/:barbershopId/services` (create), `GET .../services` (list active), `PATCH .../services/:serviceId` (update), `DELETE .../services/:serviceId` (soft-deactivate via isActive=false + deletedAt). Services are per-barbershop (tenant-scoped). Custom names allowed — no predefined enum. Deleted services are excluded from listings and new bookings but historical appointments are preserved. See `apps/api/src/services/serviceService.ts`.
    - Service records (walk-in log) — RESOLVED in PR-023. `POST /api/v1/barbershops/:barbershopId/service-records` creates completed service logs (walk-in support, no appointment required). BARBER can record only their own work. OWNER can record for any employee or list all records. GET endpoints support filtering by employee and date. Employee must be assigned to the service. Price is explicit per record (not auto-derived from service). See `apps/api/src/services/serviceRecordService.ts`.
   - Employee reactivation — RESOLVED in PR-018. `PATCH /api/v1/barbershops/:barbershopId/employees/:employeeId/reactivate` allows OWNER to reactivate a previously deactivated employee. Sets isActive=true, deletedAt=null. Does not modify User.role or EmployeeService links. Cross-tenant reactivation returns 404. Already-active employees return 409.
   - Employee service listing — RESOLVED in PR-019. `GET /api/v1/barbershops/:barbershopId/employees/:employeeId/services` allows OWNER to list services assigned to an active employee. Returns only active, non-deleted services. Deactivated/inactive employees return 404.
   - Working hours management — RESOLVED in PR-021. `GET /api/v1/barbershops/:barbershopId/working-hours` lists the current schedule. `PUT /api/v1/barbershops/:barbershopId/working-hours` replaces the weekly schedule. OWNER-only. Uses upsert per day on the `@@unique([barbershopId, dayOfWeek])` constraint — idempotent, no duplicate rows. Closed days set `isActive: false`. Time format: "HH:mm". Overnight hours rejected. See `apps/api/src/services/workingHoursService.ts`.
   - No invitation flow.

## PR-011 Verdict: ✅ PASS

All 96 tests pass (48 integration + 27 db models + 11 webhook + 5 double-booking + 2 rate limit + 3 unit).
Business hours enforcement is implemented and verified:
- Appointments inside business hours succeed
- Appointments before opening are rejected (400)
- Appointments ending after closing are rejected (400)
- Appointments on closed days are rejected (400)
- Update/reschedule into invalid hours is rejected (400)
- Tenant isolation for business hours is preserved (per-barbershop schedule)
- DB double-booking constraint remains intact

The business hours validation sits in the service layer alongside other booking integrity checks.
Per-barbershop configuration uses the `WorkingHours` model with day-of-week granularity.
Timezone conversion uses `Barbershop.timezone` via Node.js `Intl.DateTimeFormat`.

**PR-012 is safe to start.**

The remaining risks are documented above and do not block PR-012.
