# Exploration: Next PR Candidate Analysis

**Date**: 2026-06-04
**Purpose**: Evaluate two PR candidates to decide which to implement next.

---

## Candidate A: Business Hours Enforcement

### Current State

There is **zero** business hours enforcement in the system. Appointments can be booked at any date/time (including 3am on Sundays). The codebase has no schedule/availability models, no time validation beyond ISO 8601 format checks, and no working hours configuration.

**Evidence of the gap:**

| Evidence | Location |
|----------|----------|
| Explicitly documented as not implemented | `docs/SECURITY.md:146-147` — *"Business hours enforcement: Not implemented. Appointments can be booked at any time."* |
| Listed as Phase 4 deliverable, unchecked | `docs/ROADMAP.md:171` — *"Business hours enforcement"* |
| No working hours fields in actual schema | `apps/api/prisma/schema.prisma` — Barbershop has `timezone` but no `openingHours`/`closingHours` fields |
| Spec mentioned `openingHours: JSON` but never built | `docs/PRODUCT_SPEC.md:113` — aspirational, not implemented |
| No business-hours validation function | `apps/api/src/services/appointmentService.ts` — only `hasTimeConflict()` for double-booking |
| `startAt` validated only as ISO 8601 string | `apps/api/src/schemas/appointment.ts:11` — `z.string().datetime()` |
| No test for business hours | All 66 tests (security, double-booking, models) — none test time-of-day or day-of-week restrictions |

**Schema reality**: The `Barbershop` model (schema.prisma:64-86) has `timezone` (line 70) but no schedule-related fields. No `WorkingHours`, `Schedule`, `Availability`, or `TimeSlot` model exists anywhere. The `Employee` model (lines 94-117) has no availability or shift fields.

### Affected Areas

- **`apps/api/prisma/schema.prisma`** — Must add `WorkingHours` table and/or schedule structure. Barbershop needs schedule config. May need `EmployeeSchedule` for per-barber overrides.
- **`apps/api/src/services/appointmentService.ts`** — `createAppointment()` (line 189), `updateAppointment()` (line 337) — must validate `startAt` against barbershop business hours + employee schedule.
- **`apps/api/src/schemas/appointment.ts`** — No schema changes needed; validation is in service layer.
- **`apps/api/src/routes/appointments.ts`** — No route changes needed; business-hours validation is transparent.
- **`apps/api/src/index.ts`** — No changes needed.
- **`apps/api/tests/integration/security.test.ts`** — Must add tests for business-hours rejection.
- **`apps/api/tests/db/models.test.ts`** — Must add WorkingHours model tests.

### Approaches

**Approach 1: Barbershop-level `WorkingHours` table (per-barbershop, per day-of-week)**

- New table: `WorkingHours { barbershopId, dayOfWeek (enum 0-6), openTime, closeTime, isActive }`
- Per-barber overrides: `EmployeeSchedule { employeeId, dayOfWeek, openTime, closeTime, isActive }` (optional v2)
- Validation: on `createAppointment`, load barbershop's working hours for the day of `startAt`, check if `startAt` and `endAt` fall within open hours. Use barbershop.timezone for day-of-week calculation.
- Pros: Clean, minimal DB changes, per-day configuration
- Cons: No timezone handling complexity beyond what's tested, no special dates/holidays
- Effort: Medium

**Approach 2: JSON field on Barbershop (simpler, less flexible)**

- Add `openingHours Json` field to Barbershop (matches PRODUCT_SPEC.md aspiration).
- Store as `{ "monday": { "open": "09:00", "close": "18:00" }, ... }`
- No new tables, no migration for relations.
- Pros: Minimal schema change (single column), no new table
- Cons: Not queryable via SQL, harder to extend (employee overrides, holidays), violates relational design
- Effort: Low

**Approach 3: Full scheduling system with employee shifts + special dates**

- WorkingHours table (Approach 1) + EmployeeSchedule table + SpecialDates/Holidays table
- Most complete but over-engineered for MVP.
- Effort: High

### Recommendation

**Approach 1** — `WorkingHours` table per barbershop per day-of-week. This is the sweet spot: proper relational design, queryable, extensible later (employee overrides, holidays), and not over-engineered.

### Key Implementation Decisions

1. **Timezone**: `Barbershop.timezone` (e.g., `America/Argentina/Tucuman`) must be used to determine which "day of week" to check. A UTC date must be converted to barbershop local time.
2. **Per-barber overrides**: Defer to v2. All barbers inherit barbershop hours.
3. **Error response**: `400 BadRequestError('Appointment is outside business hours')` or `409 ConflictError` — recommend 400 since it's a validation issue.
4. **Default configuration**: Seed working hours for existing barbershops (e.g., Mon-Fri 9:00-18:00, Sat 9:00-13:00).

### Risks

- Timezone bugs (DST transitions, edge cases with timezone-aware date math) — moderate risk, mitigated by using `Intl.DateTimeFormat` or `luxon` for reliable local-time extraction.
- Breaking existing seed data / tests that use arbitrary times — all test fixtures must be adjusted to use times within configured business hours.
- Complexity creep: tempting to add employee schedules at same time — resist, do in separate PR.

### Ready for Proposal

**Yes** — scope is clear. Migration is well-defined. Approach 1 is recommended.

---

## Candidate B: Clerk Webhook / User Sync

### Current State

Users are **only created via seed script or manual DB insert**. There is no auto-provisioning on first Clerk login. When a user authenticates via Clerk but doesn't exist in the database, the auth middleware returns `401 UnauthorizedError('User not found in database')` — the request is rejected. There is NO webhook endpoint, NO svix signature verification, and NO user sync mechanism.

**Evidence of the gap:**

| Evidence | Location |
|----------|----------|
| Explicitly documented as not implemented | `docs/SECURITY.md:142` — *"Clerk webhook: Not implemented yet. Webhook validation (svix-signature) is deferred to Phase 3 API Foundation."* |
| Phase 3 deliverable, unchecked | `docs/ROADMAP.md:93` — *"Clerk webhook handler"* (unchecked) |
| No webhook route registered | `apps/api/src/index.ts:33` — only `app.use('/api/v1/appointments', ...)` — no `/api/v1/auth` route at all |
| No auto-provisioning on login | `apps/api/src/middleware/auth.ts:74-76` — `if (!user) { throw new UnauthorizedError('User not found in database') }` |
| No svix/standardwebhooks package | `apps/api/package.json` — dependencies: `@clerk/express`, no `svix` or `standardwebhooks` |
| svix mentioned only in docs | `docs/SECURITY_MODEL.md:26` — aspirational docs describing the webhook as if it exists |
| webhook pseudo-code only in handoff | `docs/AI_HANDOFF.md:147-158` — pseudo-code switch statement, never implemented |
| No `user.created`, `user.updated`, `user.deleted` handlers | Zero matches in `apps/api/src/` |

**Architecture docs say the webhook exists** but **code does not**. The `SECURITY_MODEL.md` (lines 22-33) and `ARCHITECTURE.md` (line 110) describe `POST /api/v1/auth/webhook` as if implemented — this is aspirational documentation that needs to be realized. The `PRODUCT_SPEC.md` (line 21) says "Webhook-based user synchronization" as a core feature.

### Affected Areas

- **`apps/api/package.json`** — Must add `svix` package for webhook signature verification.
- **`apps/api/src/index.ts`** — Register new route: `app.use('/api/v1/auth', authRoutes)`.
- **`apps/api/src/routes/auth.ts`** — **NEW file**: webhook POST endpoint that:
  1. Verifies `svix-signature` header using Svix `Webhook` class.
  2. Parses Clerk event payload.
  3. Routes to handler based on `event.type`.
- **`apps/api/src/services/userSyncService.ts`** — **NEW file**: handles `user.created` (create User with clerkUserId, email, name), `user.updated` (update email/name), `user.deleted` (set deletedAt).
- **`apps/api/src/middleware/auth.ts`** — **OPTIONAL**: Could add auto-provisioning on first login as a fallback (if webhook missed an event). Lines 74-76 would change from `throw new UnauthorizedError` to `await prisma.user.create(...)`. However, this is a separate concern and may not be needed if webhook is reliable.
- **`apps/api/.env`** — Must add `CLERK_WEBHOOK_SECRET` (signing secret from Clerk dashboard).
- **Tests**: New integration test file for webhook (verify signature, create/update/delete events). New test fixtures with `svix-signature` headers.

### Approaches

**Approach 1: Pure webhook sync (no auto-provisioning on login)**

- Implement `POST /api/v1/auth/webhook` with Svix signature verification.
- Handle `user.created`, `user.updated`, `user.deleted`.
- Auth middleware stays as-is: rejects unknown users with 401.
- Pros: Clean separation of concerns, webhook is single source of truth for user data
- Cons: If webhook fails or is delayed, user can't log in until webhook arrives
- Effort: Medium

**Approach 2: Webhook sync + auto-provisioning fallback**

- Approach 1 + modify auth middleware to create user on first login if webhook hasn't fired yet.
- Auth middleware calls Clerk API to get user details, creates DB record, then proceeds.
- Pros: Resilient to webhook delays/failures, better UX (user can always log in)
- Cons: Auth middleware gains side effects, need Clerk SDK server-side API call, opens potential abuse vector (any Clerk-authenticated user creates a DB record)
- Effort: Medium-High

**Approach 3: Auto-provisioning only (no webhook)**

- Remove webhook entirely, create user on first Clerk login in auth middleware.
- Pros: Simplest implementation, no webhook infrastructure
- Cons: User data never updates after first login (email/name changes not reflected), no soft-delete on Clerk deletion, violates PRODUCT_SPEC which says "webhook-based"
- Effort: Low

### Recommendation

**Approach 1** — Pure webhook sync. This is what the product spec and architecture docs describe. It's the correct architectural choice: Clerk is the identity provider, the webhook is the synchronization mechanism. Auto-provisioning on login (Approach 2) can be added later as a resilience improvement without changing the webhook handler.

### Key Implementation Decisions

1. **Svix package**: Clerk uses Svix for webhook signing. Must install `svix` (NOT `standardwebhooks` which is a transitive dep). The `svix` package provides `Webhook` class for signature verification.
2. **Webhook secret**: Stored as `CLERK_WEBHOOK_SECRET` env var. Obtained from Clerk Dashboard → Webhooks → Signing Secret.
3. **`user.created` event**: Extract `data.id` (clerkUserId), `data.email_addresses[0].email_address`, `data.first_name` + `data.last_name`. Create User with role=CLIENT (default). What about OWNER/BARBER roles? Those must be assigned manually or via separate mechanism — the webhook can't know the role. This means the webhook creates all users as CLIENT, and an owner/barber must be manually promoted or created via admin flow.
4. **`user.updated` event**: Update User email and name fields.
5. **`user.deleted` event**: Set `User.deletedAt = new Date()` (soft delete). The auth middleware already checks `deletedAt` at line 78-80.
6. **Webhook route must be excluded from auth**: The webhook endpoint must NOT require Clerk authentication — it validates via Svix signature instead.
7. **Idempotency**: Must handle duplicate webhook deliveries gracefully. `user.created` should not fail if user already exists (use `upsert` or catch unique constraint violation).

### Risks

- **Role assignment gap**: New users created via webhook will all be CLIENT. Owner/barber creation still requires a manual step or separate admin API. This is acceptable for MVP but must be documented.
- **Email extraction**: Clerk's event payload nests email addresses in an array. Must handle primary vs. non-primary emails correctly.
- **Svix signature verification**: Must be tested with real signed payloads or a known test secret. Integration test must verify rejection of unsigned/tampered payloads.
- **Webhook secret management**: Secret must be added to CI/CD, deployment config, and local `.env`. Not to be committed.

### Ready for Proposal

**Yes** — scope is clear. This is a Phase 3 deliverable and a prerequisite for real user flows (without webhook, users must be manually inserted into DB).

---

## Comparison Table

| Question | Candidate A: Business Hours | Candidate B: Clerk Webhook |
|----------|---------------------------|---------------------------|
| **Problem it solves** | Appointments can be booked at any hour (3am Sundays). No business schedule enforcement. | Users must be manually inserted into DB. No sync from Clerk. Registration doesn't work without manual DB seeding. |
| **Current state evidence** | `docs/SECURITY.md:146`, `docs/ROADMAP.md:171`, no schedule models in `schema.prisma`, no `validateBusinessHours()` in `appointmentService.ts` | `docs/SECURITY.md:142`, `docs/ROADMAP.md:93`, `auth.ts:74-76` (rejects unknown users), no webhook route in `index.ts:33`, no svix package |
| **Smallest safe implementation** | Add `WorkingHours` table + validate `startAt` against it in `createAppointment()` / `updateAppointment()`. Barbershop-level only, Mon-Sun config. Defer employee overrides. | Add `POST /api/v1/auth/webhook` with Svix verification. Handle `user.created`/`user.updated`/`user.deleted`. New users default to CLIENT role. |
| **Migration required?** | **Yes** — new `WorkingHours` table (or JSON column on Barbershop). Seed data for existing shops. | **No migration** — all User fields already exist. Schema is sufficient. |
| **Expected files changed** | ~6 files: `schema.prisma`, migration SQL, `appointmentService.ts`, `appointment.test.ts`, `models.test.ts`, seed script | ~5 files: `package.json` (add svix), `index.ts` (register route), new `routes/auth.ts`, new `services/userSyncService.ts`, `webhook.test.ts` |
| **Estimated line count** | ~200-250 lines (schema + migration: ~30, service validation: ~60, tests: ~120, seed: ~20) | ~150-200 lines (webhook handler: ~60, user sync service: ~40, route: ~30, tests: ~100) |
| **Test strategy** | Integration tests: book within hours ✅, book outside hours ❌, book at boundary (open/close), timezone-aware day-of-week. DB tests: WorkingHours model constraints. | Integration tests: valid webhook ✅, invalid signature ❌, create/update/delete events. Verify DB state after each event. Test idempotency. |
| **Risk level** | **Medium** — timezone handling complexity, adjusting all existing test fixtures, DST edge cases | **Medium** — security-critical (signature verification), role assignment gap (all new users are CLIENT), webhook secret management |
| **Decisions Mateo must make** | 1. Approach: WorkingHours table (recommended) vs JSON field? 2. Default business hours for seed data? 3. Error HTTP code (400 vs 409)? 4. Employee-level overrides — defer or include? | 1. Auto-provisioning on login as fallback? (recommend: no, pure webhook) 2. How to assign OWNER/BARBER role? (webhook creates as CLIENT) 3. Webhook secret: where stored, how rotated? |

---

## Recommendation: Candidate B (Clerk Webhook) Next

**Why:**

1. **Blocker for real usage**: Without the webhook, no user can register and log in without manual DB intervention. Business hours enforcement is a UX improvement; Clerk webhook is a **prerequisite for going live**.

2. **Phase ordering**: The `ROADMAP.md` shows Clerk webhook as **Phase 3** (API Foundation) while business hours is **Phase 4** (Appointments Core). Following the roadmap order is correct — you need authentication/sync working before refining appointment rules.

3. **Lower line count, simpler**: ~150-200 lines vs ~200-250. No database migration needed. The User schema is already complete — all fields needed for sync already exist.

4. **Security-critical foundation**: Svix signature verification is mandatory for production. Getting it right early prevents replay attacks. The `SECURITY_MODEL.md` security checklist (line 385) lists "Webhook signature verification" as unchecked — this closes a documented security gap.

5. **Business hours builds on this**: Once webhook is working, real users can register. Then business hours enforcement has a real user base to test against. The reverse order (business hours first) means you add a feature before anyone can register.

### Exact Questions for Mateo

1. **Role assignment**: Webhook creates users as CLIENT by default. How should OWNER/BARBER roles be assigned? Manual DB update for now? A future admin API? Should the webhook check a pre-approved email list?

2. **Webhook secret**: Do you have the Clerk webhook signing secret (`whsec_...`) from the Clerk Dashboard? We'll need it for `.env` and for writing integration tests.

3. **Auto-provisioning on login**: Should the auth middleware auto-create users as a fallback if webhook delivery is delayed? Or strictly require webhook-first? I recommend webhook-only for MVP.

### Suggested Next Prompt

```
/sdd-propose "Clerk Webhook / User Sync"
```

Or for the full pipeline:

```
/sdd-ff "Clerk Webhook / User Sync"
```

This will generate the proposal, specs, design, and tasks for implementing `POST /api/v1/auth/webhook` with Svix signature verification and `user.created`/`user.updated`/`user.deleted` event handling.
