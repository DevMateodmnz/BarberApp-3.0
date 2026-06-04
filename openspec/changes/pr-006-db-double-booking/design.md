# Design: DB-Level Double-Booking Protection

## Technical Approach

Add a PostgreSQL GiST exclusion constraint as atomic double-booking enforcement. Keep `hasTimeConflict()` as defense-in-depth. Fix old migration (`tstzrange` → `tsrange`) for correctness on fresh DB resets. Map Prisma constraint violations to `ConflictError` for 409 instead of 500.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Constraint type | GiST exclusion (`EXCLUDE USING gist`) | Atomic, declarative, transactional. Beats `SELECT ... FOR UPDATE` (still TOCTOU at tx boundary) and semaphores (don't survive crashes). |
| Constraint guard | `DO $$ ... IF NOT EXISTS (pg_constraint) THEN ALTER TABLE ...` | Idempotent — safe when constraint already exists from manual DBA. Prisma can't detect partial migration states. |
| Old migration fix | `tstzrange` → `tsrange` (line 11) | Fresh DB reset drops `_prisma_migrations` → old migration IS re-executed. Fix prevents future breakage. |
| Error mapping layer | Service-level try/catch wrapping `create()` and `update()` | Scoped — only catches appointment-related violations. Global middleware would catch ALL exclusion violations indiscriminately. |
| `[)` explicit in SQL | Written in `tsrange(start_at, end_at, '[)')` | Documents intent. Default is `[)` but explicit bounds prevent reader confusion months later. |
| `tsrange` not `tstzrange` | Matching `TIMESTAMP(3)` columns | `schema.prisma:181-182`: `start_at` and `end_at` are `DateTime` → `TIMESTAMP(3)`, not `timestamptz`. Using `tstzrange` causes implicit casting bugs. |

## Error Mapping

```
PrismaClientKnownRequestError for no_double_booking exclusion violation
  (actual error code determined via test-first — do NOT assume P2009)
  → throw ConflictError('This time slot is already booked')
    → errorHandler.ts:13 (AppError) → 409 JSON
```

Both `createAppointment()` (line 192) and `updateAppointment()` (line 356) need `try/catch`. Non-matching errors re-throw unchanged — don't hide unrelated DB failures.

Import `Prisma` from `@prisma/client` (currently only `import type`, switch to value import for `instanceof` check).

## Migration Scenarios

| Scenario | Old migration (20260531) | New migration (20260604) |
|----------|--------------------------|--------------------------|
| Fresh DB (no `_prisma_migrations`) | Re-applied → `tstzrange` bug executes UNLESS fixed | Installs `btree_gist` (no-op), adds guarded constraint |
| Local/test DB (`applied_steps_count=0`) | Prisma skips | Adds constraint — guard prevents duplicate |
| Constraint already exists | Skipped | Guard detects → skips `ALTER TABLE` → succeeds |

## Component Interaction

```
HTTP POST /appointments
  → route handler (auth + role)
    → createAppointment()
        ├── tenant checks
        ├── calculate endAt
        ├── hasTimeConflict() ← app-layer, first defense
        └── prisma.appointment.create()
              ↓
  ┌──── PostgreSQL ────┐
  │ GiST exclusion     │ ← atomic: no overlap per employee, active statuses
  │ constraint fires   │
  └────────────────────┘
              ↓ (violation)
  PrismaClientKnownRequestError
    → ConflictError → 409
```

Race path: two concurrent requests both pass `hasTimeConflict()` → both call `create()` → PostgreSQL serializes → second INSERT hits exclusion constraint → 409.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/migrations/20260531_add_double_booking_constraint/migration.sql` | Modify L11 | `tstzrange` → `tsrange` |
| `prisma/migrations/20260604_add_db_double_booking_constraint/migration.sql` | Create | Guarded exclusion constraint (~20 lines) |
| `src/services/appointmentService.ts` | Modify L192, L356 | try/catch Prisma violations → `ConflictError` |
| `tests/db/double-booking.test.ts` | Create | 5 DB constraint tests (~85 lines) |
| `docs/SECURITY.md` | Modify L134-138 | Risk #1 → "Resolved" |
| `docs/SECURITY_MODEL.md` | Modify L285-304 | "Deferred" → "Implemented in PR-006" |

## Testing Strategy

| Layer | Tests | Approach |
|-------|-------|----------|
| DB constraint | 5: sequential overlap, concurrent race, back-to-back, terminal exempt, different employees | Direct `prisma.appointment.create()` via `tests/db/helpers.ts`; bypass service layer |
| Integration | 6 existing tests in `security.test.ts:618-775` | Must still pass |
| Error mapping | Prisma code discovery via test #1 | Write test first; failing error reveals actual code |

Follows `tests/db/models.test.ts` pattern: `beforeEach`/`afterEach` cleanup, `DATABASE_URL_TEST` on port 5433.

## Rollout

1. Fix old migration (source-only)
2. `prisma migrate dev` → applies new migration
3. `prisma migrate deploy` on test DB (port 5433)
4. Full test suite → existing + 5 new pass
5. `prisma migrate deploy` on production

**Rollback**: `ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_double_booking; DROP EXTENSION IF EXISTS btree_gist;` → revert to app-layer only.

## Open Questions

- [ ] Actual Prisma error code for exclusion constraint violations — determine during implementation via test #1
