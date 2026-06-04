# Tasks: DB-Level Double-Booking Protection

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~130 (1 migration fix + 20 SQL + 85 tests + 15 service + 10 docs) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR — all 5 work units fit comfortably under 400 lines |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fix old migration tsrange type | PR-006 | Source-only fix; 1 line |
| 2 | New guarded exclusion constraint | PR-006 | ~20 lines SQL |
| 3 | 5 DB constraint tests | PR-006 | ~85 lines; test-first via TDD |
| 4 | Map violation to ConflictError | PR-006 | ~15 lines service + import fix |
| 5 | Mark risk #1 resolved in docs | PR-006 | ~10 lines across 2 files |

## Phase 1: Migration Safety (Foundation)

- [ ] 1.1 Fix `apps/api/prisma/migrations/20260531_add_double_booking_constraint/migration.sql:11`: `tstzrange` → `tsrange` (columns are `TIMESTAMP(3)`, not `timestamptz`)
- [ ] 1.2 Create `apps/api/prisma/migrations/20260604_add_db_double_booking_constraint/migration.sql` with guarded exclusion constraint (`DO $$ ... IF NOT EXISTS (pg_constraint) THEN ALTER TABLE ... EXCLUDE USING gist (...)`) — idempotent, safe for fresh DB resets
- [ ] 1.3 Verify migration on test DB: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/barberapp_test npx prisma migrate deploy` from `apps/api`

## Phase 2: DB Constraint Tests (Test-First, RED)

- [ ] 2.1 Create `apps/api/tests/db/double-booking.test.ts` using `helpers.ts` utilities (`createTestBarbershop`, `createTestEmployee`, `createTestUser`, `cleanupTestData`)
- [ ] 2.2 Test 1 (sequential overlap): insert A (E1, 10:00–10:30, PENDING) → attempt insert B (E1, 10:15–10:45, PENDING) → expect Prisma rejection
- [ ] 2.3 Test 2 (concurrent race): `Promise.allSettled([create(A), create(B)])` same E1, overlapping → exactly 1 fulfilled, 1 rejected
- [ ] 2.4 Test 3 (back-to-back): insert A (E1, 10:00–10:30) + B (E1, 10:30–11:00) → both succeed (default `[)` bounds)
- [ ] 2.5 Test 4 (terminal exempt): insert A (E1, 10:00–10:30, COMPLETED) + B (E1, 10:00–10:30, PENDING) → both succeed
- [ ] 2.6 Test 5 (different employees): insert A (E1, 10:00–10:30) + B (E2, 10:00–10:30) → both succeed
- [ ] 2.7 All tests use direct `prisma.appointment.create()` — bypass service layer; `beforeEach`/`afterEach` cleanup via `cleanupTestData()`

## Phase 3: Error Discovery (CRITICAL — Run Test First)

- [ ] 3.1 Run `npm test -- tests/db/double-booking.test.ts` from `apps/api` — Test 1 MUST fail (error mapping not yet in place) → capture ACTUAL Prisma error shape
- [ ] 3.2 Document discovered error details: class name, `.code`, `.meta` fields, any SQLSTATE — do NOT assume `P2009`
- [ ] 3.3 In test file, narrow catch to the specific `no_double_booking` constraint violation using discovered error signature (NOT broad `PrismaClientKnownRequestError` catch-all)

## Phase 4: Service Error Mapping (GREEN)

- [ ] 4.1 In `apps/api/src/services/appointmentService.ts`: change `import type { Prisma }` → `import { Prisma }` at value level for `instanceof` check
- [ ] 4.2 Wrap `prisma.appointment.create()` (line 192) in try/catch: catch specific `no_double_booking` violation → `throw new ConflictError('This time slot is already booked')`; re-throw all other errors unchanged
- [ ] 4.3 Wrap `prisma.appointment.update()` (line 356) in try/catch with same pattern
- [ ] 4.4 Re-run `npm test -- tests/db/double-booking.test.ts` — all 5 tests should now pass (GREEN)

## Phase 5: API/Service Validation

- [ ] 5.1 Run `npm test` from `apps/api` — verify all 66 existing tests + 5 new = 71 pass; specifically confirm 6 HTTP double-booking tests still pass
- [ ] 5.2 Verify `createAppointment()` returns 409 JSON on conflict without raw DB internals leaked
- [ ] 5.3 Document limitation: concurrent race path is hard to trigger via HTTP tests (app-layer `hasTimeConflict` catches most cases); DB-level tests at Phase 2 cover the race scenario

## Phase 6: Documentation

- [ ] 6.1 `docs/SECURITY.md:134-138`: replace "Remaining Risk #1" with "Resolved: DB-level exclusion constraint prevents concurrent double-booking race for same employee + active statuses. Application-layer check remains as defense-in-depth."
- [ ] 6.2 `docs/SECURITY_MODEL.md:285-304`: replace "Deferred to Phase 3" section with "Implemented in PR-006. See `apps/api/prisma/migrations/20260604_add_db_double_booking_constraint/migration.sql`."
- [ ] 6.3 Do NOT claim business hours, employee assignment, rate limiting, or all scheduling risks are solved

## Phase 7: Final Validation

- [ ] 7.1 `npm run build` from `apps/api`
- [ ] 7.2 `npm test` from `apps/api` — all tests pass
- [ ] 7.3 `git diff --check` — no whitespace errors
- [ ] 7.4 `git status --short` — only intended files changed

## Risk Gate

Stop and mark BLOCKED if:
- Old migration + new guarded migration conflict on fresh DB
- Prisma migration state is inconsistent
- Actual DB error shape cannot be narrowed safely to `no_double_booking`
- Tests require broad rewrite beyond the 5 planned
- Total changed lines forecast exceeds ~400
- Any unrelated appointment architecture changes become necessary
