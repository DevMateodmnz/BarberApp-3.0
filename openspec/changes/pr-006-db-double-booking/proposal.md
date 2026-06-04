# Proposal: DB-Level Double-Booking Protection

## Intent

Close the concurrent double-booking race condition. The current `hasTimeConflict()` (`appointmentService.ts:139`) performs a `findFirst` → `create` sequence — a classic TOCTOU window where two concurrent requests both pass the read check and insert overlapping appointments. Add a PostgreSQL GiST exclusion constraint to make overlap detection atomic at the DB level, eliminating the race.

**Evidence**: `hasTimeConflict()` at `appointmentService.ts:139-157` uses `prisma.appointment.findFirst()` to check conflicts, then `createAppointment()` at `appointmentService.ts:167-212` calls `prisma.appointment.create()` at line 192. Between these two operations lies the race window. The existing buggy migration (`20260531_add_double_booking_constraint/migration.sql`) is registered in `_prisma_migrations` with `applied_steps_count=0` (confirmed via direct DB query) — it was NEVER executed, so Prisma skips it on `migrate dev`.

## Scope

### In Scope
- **Fix old migration** (`20260531_add_double_booking_constraint/migration.sql:11`): `tstzrange` → `tsrange` — columns are `TIMESTAMP(3)` (`init/migration.sql:84-85`), not `timestamptz`. Fix for correctness/documentation even though Prisma won't re-execute it.
- **New migration** (`20260604_add_db_double_booking_constraint/migration.sql`): CREATE `btree_gist` extension + ADD CONSTRAINT `no_double_booking` with guard (`IF NOT EXISTS` against `pg_constraint`). Uses `tsrange(start_at, end_at) WITH &&` on `employee_id WITH =`, WHERE `status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')`.
- **Error mapping**: Catch Prisma exclusion constraint violations in `createAppointment()` and `updateAppointment()` → re-throw as `ConflictError` (class at `errors.ts:37-42`) so the error handler (`errorHandler.ts:7-41`) returns 409 instead of 500.
- **DB-level tests** in new file `tests/db/double-booking.test.ts`: 5 tests exercising the constraint directly via `prisma.appointment.create()`.
- **Docs**: Update `docs/SECURITY.md:134-138` (risk #1 → resolved) and `docs/SECURITY_MODEL.md:285-304` ("Deferred" → "Implemented").

### Out of Scope
- Mobile runtime, Clerk webhook, rate limiting, business hours enforcement
- Removing `hasTimeConflict()` — it stays as defense-in-depth (app-layer catches 99.9% of conflicts before hitting DB)
- Any other appointment features

## Capabilities

### New Capabilities
- `db-double-booking-constraint`: PostgreSQL GiST exclusion constraint that atomically prevents overlapping active appointments per employee

### Modified Capabilities
None — existing appointment creation behavior is preserved. The DB constraint enforces the same rules already present at the application layer (`hasTimeConflict()` status filter at `appointmentService.ts:149`). Error responses remain 409 CONFLICT.

## Approach

1. **Fix old migration** (`20260531_add_double_booking_constraint/migration.sql:11`): `tstzrange` → `tsrange`. One-line correctness fix.
2. **Create new migration** `20260604_add_db_double_booking_constraint/migration.sql` with guarded constraint creation (avoids failure if constraint already exists from manual DDL).
3. **Add error mapping** in `appointmentService.ts`: wrap `prisma.appointment.create()` (line 192) and `prisma.appointment.update()` (line 356) in try/catch that converts Prisma exclusion constraint violations (code `P2009` or similar) to `ConflictError`. The engram error handler (`errorHandler.ts:27-41`) currently sends unknown errors as 500 — this prevents that for race-condition losers.
4. **Add DB-level tests** in `tests/db/double-booking.test.ts` (see Test Design below).
5. **Apply migration**: `prisma migrate dev` on dev DB; `DATABASE_URL=... prisma migrate deploy` on test DB (`localhost:5433/barberapp_test` per `tests/setup.ts:7`).
6. **Update docs**.

## Affected Areas

| Area | Impact | Evidence |
|------|--------|----------|
| `prisma/migrations/20260531_add_double_booking_constraint/migration.sql` | Modified | Line 11: `tstzrange` → `tsrange` |
| `prisma/migrations/20260604_add_db_double_booking_constraint/migration.sql` | New | Guarded constraint creation (~20 lines) |
| `apps/api/src/services/appointmentService.ts` | Modified | Lines 192, 356: catch Prisma exclusion error → ConflictError |
| `apps/api/tests/db/double-booking.test.ts` | New | 5 DB-level tests (~85 lines) |
| `docs/SECURITY.md` | Modified | Lines 134-138: risk #1 → "Resolved by DB constraint" |
| `docs/SECURITY_MODEL.md` | Modified | Lines 285-304: "Deferred" → "Implemented in PR-006" |

## Migration Strategy

**Why a new migration**: The old migration `20260531_add_double_booking_constraint` has `applied_steps_count=0` in `_prisma_migrations` (confirmed via `SELECT`). Prisma considers it applied and will NEVER re-execute it, even after fixing the SQL. A new migration with a fresh timestamp is required.

**New migration SQL** (`20260604_add_db_double_booking_constraint/migration.sql`):

```sql
-- Enable btree_gist for GiST index on text/equality columns
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping active appointments per employee
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_double_booking' AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments"
    ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (
      employee_id WITH =,
      tsrange(start_at, end_at) WITH &&
    ) WHERE (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
  END IF;
END $$;
```

**Constraint correctness** (verified via direct DB queries on test DB):
- `employee_id WITH =` — per-employee scoping ✅
- `tsrange(start_at, end_at)` — correct for `TIMESTAMP(3)` columns (`schema.prisma:181-182`, `init/migration.sql:84-85`) ✅
- Default bounds `[)` — back-to-back (10:30 A → 10:30 B) = no overlap ✅; partial overlap detected ✅
- WHERE clause — matches `hasTimeConflict()` status filter at `appointmentService.ts:149` and `STATUS_TRANSITIONS` terminal states at `appointmentService.ts:42-44` ✅
- `btree_gist` v1.7 available but not installed (confirmed via `pg_extension` + `pg_available_extensions`) ✅

## Error Handling

**Problem**: `errorHandler.ts:13-25` catches `AppError` instances only. Prisma exclusion constraint violations throw `PrismaClientKnownRequestError` — NOT an `AppError`. Currently falls through to generic 500 handler at `errorHandler.ts:27-41`.

**Fix**: In `appointmentService.ts`, wrap the `prisma.appointment.create()` call (line 192) and `prisma.appointment.update()` call (line 356) in try/catch. Check `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2009'` (or whatever code Prisma uses for exclusion violations — verify during implementation). Re-throw as `ConflictError('This time slot is already booked')`.

Under normal flow the app-layer `hasTimeConflict()` check fires first, so this catch path is only hit during race conditions. Exactly the right behavior.

## Test Design

New file: `apps/api/tests/db/double-booking.test.ts`

All tests use direct `prisma.appointment.create()` — bypassing the service layer entirely to test the DB constraint in isolation. Uses the existing DB test setup (`tests/db/helpers.ts:8` for separate PrismaClient, `tests/setup.ts:7` for test DB URL).

| # | Test | Setup | Assertion |
|---|------|-------|-----------|
| 1 | **Sequential overlap rejected** | Create A (employee E1, 10:00-10:30, PENDING). Attempt create B (E1, 10:15-10:45, PENDING). | B throws Prisma constraint violation |
| 2 | **Concurrent race** | `Promise.allSettled([create(A), create(B)])` where A,B: same E1, overlapping times. | Exactly 1 fulfilled, 1 rejected |
| 3 | **Back-to-back allowed** | Create A (E1, 10:00-10:30). Create B (E1, 10:30-11:00). | Both succeed |
| 4 | **Terminal status exempt** | Create A (E1, 10:00-10:30, COMPLETED). Create B (E1, 10:00-10:30, PENDING). | Both succeed |
| 5 | **Different employees allowed** | Create A (E1, 10:00-10:30). Create B (E2, 10:00-10:30). | Both succeed |

Cleanup via existing `cleanupTestData()` at `tests/db/helpers.ts:163-171`.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `btree_gist` unavailable on hosted PG | Low | Extension standard in PG 13+; CI runs PG 16 via Docker `postgres:16-alpine` |
| Constraint fails on existing overlapping data in dev DB | Low | Run `prisma migrate dev` and check exit code; existing app-layer check prevents overlaps in normal usage |
| Prisma exclusion violation code differs from expected | Medium | Verify during implementation via test #1; adapt catch condition to actual code |
| Migration ordering conflict with future migrations | Low | Fresh timestamp (`20260604`) after all existing migrations |
| Existing 6 HTTP tests (`security.test.ts:618-775`) fail after migration | Low | HTTP tests exercise app-layer, not DB; constraint is transparent to app flow except race losers (which tests don't simulate) |

## Rollback Plan

```sql
-- Rollback migration SQL
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS no_double_booking;
DROP EXTENSION IF EXISTS btree_gist;  -- only if no other table uses it
```

To revert: create a new migration with the above, deploy, re-run full test suite to confirm app-level `hasTimeConflict()` still works. The app-layer check at `appointmentService.ts:139-157` is unchanged and handles all non-race-condition cases.

## Dependencies

- PostgreSQL 16 with `btree_gist` v1.7 extension (Docker `postgres:16-alpine`; extension confirmed available via `pg_available_extensions`)
- Docker compose services (`postgres` + `postgres_test`) must be running
- Test DB accessible at `localhost:5433/barberapp_test` (`tests/setup.ts:7`, `NODE_ENV=test` at line 10)

## Success Criteria

- [ ] `btree_gist` extension installed in dev + test DBs
- [ ] `no_double_booking` constraint exists on `appointments` table (verified via `pg_constraint`)
- [ ] Old migration file fixed: `tstzrange` → `tsrange` at line 11
- [ ] DB test #1: sequential overlapping insert → rejected with Prisma constraint error
- [ ] DB test #2: concurrent parallel inserts → exactly one succeeds, one fails
- [ ] DB test #3: back-to-back non-overlapping → both succeed
- [ ] DB test #4: terminal status (COMPLETED) exempt from constraint
- [ ] DB test #5: different employees, same time → both succeed
- [ ] Existing 6 HTTP-level double-booking tests (`security.test.ts:618-775`) still pass
- [ ] Full test suite passes (`npm test`)
- [ ] `docs/SECURITY.md:134-138` updated: risk #1 marked resolved
- [ ] `docs/SECURITY_MODEL.md:285-304` updated: "Deferred" → "Implemented in PR-006"
- [ ] Total changed lines < 200 (single PR, well under 400-line budget)
