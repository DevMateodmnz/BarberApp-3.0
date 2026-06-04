# db-double-booking-constraint Specification

## Purpose

Database-level exclusion constraint that atomically prevents overlapping active appointments for the same employee, closing the TOCTOU race condition in the application-layer `hasTimeConflict()` check at `appointmentService.ts:139-157`.

## Status Semantics

| Status | Blocks overlaps? | Classification |
|--------|------------------|----------------|
| PENDING | Yes | Active — appointment is booked |
| CONFIRMED | Yes | Active — confirmed by owner |
| IN_PROGRESS | Yes | Active — currently being served |
| CANCELLED | No | Terminal — no transitions allowed |
| COMPLETED | No | Terminal — no transitions allowed |
| NO_SHOW | No | Terminal — no transitions allowed |

Source: `AppointmentStatus` enum (`schema.prisma:23-30`), `STATUS_TRANSITIONS` (`appointmentService.ts:26-45`), `hasTimeConflict()` status filter (`appointmentService.ts:149`).

## Requirements

### Requirement 1: Exclusion Constraint Enforcement

The database MUST prevent two appointments for the same employee from overlapping in time when both have an active status (PENDING, CONFIRMED, or IN_PROGRESS). The constraint MUST use `tsrange(start_at, end_at)` with `&&` operator, scoped by `employee_id WITH =`, filtered by `WHERE status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')`.

#### Scenario: Sequential overlapping insert blocked

- GIVEN an active appointment (employee E1, 10:00–10:30, PENDING)
- WHEN inserting a second appointment (E1, 10:15–10:45, PENDING)
- THEN the insert MUST fail with a Prisma exclusion constraint violation

#### Scenario: Back-to-back appointments allowed

- GIVEN an active appointment (E1, 10:00–10:30, PENDING)
- WHEN inserting a second appointment (E1, 10:30–11:00, PENDING)
- THEN both inserts MUST succeed — `end_at == start_at` produces non-overlapping `[)` ranges

#### Scenario: Different employees, same time slot

- GIVEN an active appointment (E1, 10:00–10:30, PENDING)
- WHEN inserting a second appointment (E2, 10:00–10:30, PENDING)
- THEN both inserts MUST succeed — constraint is scoped per `employee_id`

#### Scenario: Terminal status exempt from blocking

- GIVEN an appointment (E1, 10:00–10:30, COMPLETED)
- WHEN inserting a second appointment (E1, 10:00–10:30, PENDING)
- THEN the insert MUST succeed — COMPLETED excluded by constraint WHERE clause

### Requirement 2: Concurrent Insert Race Protection

The database MUST atomically reject overlapping concurrent inserts for the same employee, guaranteeing that at most one insert succeeds and no overlapping appointments are persisted.

#### Scenario: Concurrent race — exactly one succeeds

- GIVEN no existing appointments for employee E1
- WHEN two overlapping appointments (E1, 10:00–10:30) are inserted concurrently via `Promise.allSettled`
- THEN exactly one insert MUST succeed and exactly one MUST fail with a constraint violation

### Requirement 3: Error Mapping to 409 Conflict

The application MUST catch the specific Prisma/PostgreSQL exclusion constraint violation for `no_double_booking` in `createAppointment()` and `updateAppointment()` and re-throw it as `ConflictError`, ensuring the API responds with HTTP 409 instead of 500. The actual Prisma error code and/or PostgreSQL SQLSTATE MUST be determined via a failing DB-level test first — do NOT hardcode a guessed code before verification.

#### Scenario: Constraint violation returns 409

- GIVEN an active appointment (E1, 10:00–10:30, PENDING)
- WHEN the API creates a conflicting appointment via `createAppointment()` (E1, 10:15–10:45)
- THEN the response MUST be HTTP 409, body `{ success: false, error: { code: "CONFLICT", message: "This time slot is already booked" } }`

#### Scenario: Non-constraint Prisma errors pass through

- GIVEN a Prisma error that is NOT an exclusion constraint violation (e.g., foreign key violation)
- WHEN the service catches it in the try/catch block
- THEN the error MUST be re-thrown as-is — it MUST NOT be mapped to `ConflictError`

#### Scenario: Unknown errors remain 500

- GIVEN an unexpected error (not `AppError` and not Prisma constraint violation)
- WHEN the error reaches `errorHandler.ts`
- THEN the response MUST be HTTP 500 with `INTERNAL_SERVER_ERROR` (unchanged behavior)

### Requirement 4: Application-Layer Defense-in-Depth

The existing `hasTimeConflict()` function MUST remain unchanged and MUST execute before every Prisma create/update call. The DB constraint serves as the final atomic safeguard for concurrent races.

#### Scenario: App-layer check fires before DB insert

- GIVEN a non-overlapping appointment request (E1, 11:00–11:30)
- WHEN `createAppointment()` processes the request
- THEN `hasTimeConflict()` MUST execute first; only on passing does the Prisma create call proceed

## Non-Functional Requirements

| ID | Requirement |
|----|------------|
| NF1 | Migration MUST be safe for fresh DB, existing dev DB, and test DB (`localhost:5433/barberapp_test`) |
| NF2 | Migration MUST be idempotent — `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) THEN ... END IF $$` guards against duplicate constraint errors |
| NF3 | All existing 66 tests MUST continue to pass after migration |
| NF4 | Total changed lines MUST be under 200 |
| NF5 | `btree_gist` extension v1.7 MUST be available (standard in PostgreSQL 13+; CI runs `postgres:16-alpine`) |
| NF6 | Old migration `20260531_add_double_booking_constraint/migration.sql:11` MUST fix `tstzrange` → `tsrange` |

## Acceptance Criteria

1. [ ] `btree_gist` extension installed in dev + test DBs
2. [ ] `no_double_booking` constraint exists on `appointments` table (verified via `pg_constraint`)
3. [ ] Old migration fixed: `tstzrange` → `tsrange` at line 11
4. [ ] Sequential overlapping insert → rejected with Prisma constraint violation
5. [ ] Concurrent parallel inserts → exactly one succeeds, one fails
6. [ ] Back-to-back non-overlapping → both succeed
7. [ ] Terminal status (COMPLETED) exempt from constraint
8. [ ] Different employees, same time → both succeed
9. [ ] Existing 6 HTTP-level double-booking tests (`security.test.ts:618-775`) still pass
10. [ ] Full test suite passes (`npm test`)
11. [ ] `docs/SECURITY.md:134-138` updated: risk #1 marked resolved
12. [ ] `docs/SECURITY_MODEL.md:285-304` updated: "Deferred" → "Implemented in PR-006"

## Out of Scope

- Business hours enforcement, rate limiting, mobile UI changes
- Clerk webhook handlers, employee-service validation
- Removing `hasTimeConflict()` (stays as defense-in-depth)
- Any other appointment features or status transitions
