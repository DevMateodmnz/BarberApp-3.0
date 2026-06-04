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
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/barberapp_test"
npx prisma generate
npx prisma db push

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

2. **Rate limiting**: Not yet implemented in routes. The SECURITY_MODEL.md documents the pattern but it's not active.

3. **CORS**: Configured with `*` wildcard for development. Must restrict to mobile app origin in production.

4. **Clerk webhook**: Not implemented yet. Webhook validation (svix-signature) is deferred to Phase 3 API Foundation.

5. **EmployeeService validation at booking**: The service layer validates employee and service belong to the barbershop, but does NOT check that the employee is assigned to perform the specific service (EmployeeService junction). This should be added.

6. **Business hours enforcement**: Not implemented. Appointments can be booked at any time.

7. **BARBER `listAppointments`**: Currently returns all appointments for the barber's employee ID. It doesn't filter by barbershop scope when called without an employee context.

## PR-005C Verdict: ✅ PASS

All 36 security integration tests pass against real infrastructure.
The backend security guarantees for authentication, authorization, tenant isolation,
booking integrity, double-booking prevention, and status transitions are verified.

**PR-006 is safe to start.**

The remaining risks are documented above and do not block PR-006.
