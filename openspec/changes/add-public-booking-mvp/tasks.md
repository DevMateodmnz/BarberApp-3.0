# Tasks: Public Booking MVP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,500+ across schema, API, web UI, tests, and rollout docs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 8 vertical slices |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Outcome | Dependencies | Areas | Tests written first | Acceptance / validation | Likely commit boundary | Risks |
|------|------|---------|--------------|-------|---------------------|-------------------------|-----------------------|-------|
| 1 | Lock public identifiers + policy | Slug, policy module, public DTO contracts agreed in code | none | API config + shared policy | slug normalization, policy defaults | typecheck + unit tests | `feat(api): add public booking policy boundary` | naming drift |
| 2 | Add schema support | slug, schedule exceptions, public reference, consent, idempotency tables/fields | 1 | Prisma + DB tests | schema/constraint tests | migrate on dev/test, db tests | `feat(api): add public booking schema support` | migration complexity |
| 3 | Public read APIs | shop lookup, services, eligible barbers | 2 | routes/services/integration | fail-closed + privacy tests | api unit/integration | `feat(api): add public booking discovery routes` | data leakage |
| 4 | Availability hardening | public availability with exceptions, notice, horizon | 2,3 | appointment services | timezone + schedule tests | api integration + diff check | `feat(api): add public availability contract` | timezone bugs |
| 5 | Public create + idempotency | anonymous booking creation into `Appointment` | 2,4 | services/routes | stale-slot, replay, mismatch tests | api integration + db race tests | `feat(api): add public booking creation` | race + replay errors |
| 6 | Public web foundation | Next.js workspace, slug route shell, API client, a11y baseline | 3 | new web app | render/router tests | web typecheck/lint/tests | `feat(web): scaffold public booking app` | setup churn |
| 7 | Complete booking UI | service/barber/date/time/form/confirmation UX | 4,5,6 | web app | form + conflict tests | web tests + manual mobile-browser QA | `feat(web): add public booking flow` | UX edge cases |
| 8 | Pilot hardening | rate limits, rollout toggles, monitoring docs, e2e path | 5,7 | API/web/docs | rate-limit + e2e plan | full regression + pilot checklist | `docs(release): prepare public booking pilot` | operational tuning |

## Phase 1: Decision Lock and Schema Foundations

- [ ] 1.1 Add `publicSlug`, `publicReference`, consent fields, schedule exceptions, and idempotency records to Prisma with backward-conscious migrations and rollback notes.
  - [x] 1.1.a Add nullable `Barbershop.publicSlug` with lowercase canonical storage rules, uniqueness, and no automatic backfill.
  - [ ] 1.1.b Add `publicReference`, consent fields, schedule exceptions, and idempotency records.
    - [x] 1.1.b.i Add `BarbershopScheduleException` and `BarbershopScheduleExceptionInterval` with backward-conscious migration support.
    - [ ] 1.1.b.ii Add `publicReference`, consent fields, and idempotency records.
- [x] 1.2 Add slug normalization/reserved-word utilities and a shared public booking policy module for notice, horizon, and slot interval defaults.
- [ ] 1.3 Write DB/unit tests for slug uniqueness, public reference uniqueness, exception interval validation, and idempotency-key scope.
  - [x] 1.3.a Write DB/unit tests for slug normalization, reserved words, uniqueness, case handling, and canonical database constraints.
  - [ ] 1.3.b Write DB/unit tests for public reference uniqueness, exception interval validation, and idempotency-key scope.
    - [x] 1.3.b.i Write DB/unit tests for schedule exception interval validation and controlled provisioning flows.
    - [ ] 1.3.b.ii Write DB/unit tests for public reference uniqueness and idempotency-key scope.

## Phase 2: Public Catalogue and Barbershop Identity API

- [x] 2.1 Create anonymous public routes under `/api/v1/public/barbershops/:slug` for shop lookup, services, and eligible barbers.
  - [x] 2.1.a Add anonymous public shop lookup for active published barbershops.
  - [x] 2.1.b Add anonymous public active-service catalogue under the resolved slug.
  - [x] 2.1.c Add anonymous public eligible-barber listing scoped by slug + service.
- [x] 2.2 Reuse existing tenant/service/employee invariants while filtering inactive/private data.
- [x] 2.3 Write integration tests for fail-closed behavior, omitted private fields, and service-to-barber eligibility.

## Phase 3: Schedule Exceptions and Availability Hardening

- [ ] 3.1 Extend availability logic to apply schedule exceptions before weekly hours and enforce notice/horizon policy.
- [ ] 3.2 Keep barbershop-timezone conversion authoritative and add DST-sensitive regression tests.
- [ ] 3.3 Validate stale-slot and closed-date responses before any web implementation begins.

## Phase 4: Public Booking Write Path and Durable Idempotency

- [ ] 4.1 Add anonymous booking creation with `Idempotency-Key`, payload fingerprinting, replay support, and mismatch detection.
- [ ] 4.2 Extract shared appointment-creation invariants instead of duplicating a weaker public-only path.
- [ ] 4.3 Write RED-first tests for consent, phone normalization, concurrency, replay, in-progress duplicate, and safe confirmation DTOs.

## Phase 5: Dedicated Public Web Foundation

- [ ] 5.1 Create `apps/public-web` with Next.js, route shell(s) for `/barberias/[slug]` and booking/confirmation pages, and a small API client boundary.
- [ ] 5.2 Add responsive layout, loading/empty/error states, keyboard/focus management, and localized date/time formatting based on barbershop timezone.
- [ ] 5.3 Add unit/render tests for route loading, missing shop, and accessible form scaffolding.

## Phase 6: Complete Customer Booking Flow

- [ ] 6.1 Implement service, barber, date, and slot selection backed by the public API.
- [ ] 6.2 Implement customer name/phone/consent form validation and submission retry behavior with preserved fields.
- [ ] 6.3 Add stale-slot conflict recovery, rate-limit handling, and success-page behavior that does not require reference lookup-by-URL.

## Phase 7: Security, Privacy, and Abuse Hardening

- [ ] 7.1 Add separate read/availability/write rate-limit classes using a production-safe shared store abstraction.
  - [x] 7.1.a Add a dedicated `public_catalog_read` limiter boundary for the current single-instance pilot.
- [ ] 7.2 Verify public DTO minimization, error-envelope consistency, and tenant/privacy guarantees through integration tests.
  - [x] 7.2.a Verify public catalogue DTO minimization, fail-closed errors, and tenant/privacy guarantees through integration tests.
- [ ] 7.3 Confirm existing OWNER/BARBER/mobile booking flows still pass their full regressions.

## Phase 8: Pilot Rollout and Launch Validation

- [ ] 8.1 Document manual provisioning for the first pilot barbershop: owner identity, slug, timezone, services, employees, assignments, weekly hours, exceptions.
  - [x] 8.1.a Add an operator-only public-slug provisioning command and pilot runbook for controlled publish/unpublish.
  - [ ] 8.1.b Document the full pilot barbershop provisioning checklist, including services, employees, assignments, and exceptions.
    - [x] 8.1.b.i Add an operator-only schedule-exception command and pilot runbook for date-specific overrides.
- [ ] 8.2 Define monitoring and rollback steps so public routes/web can be disabled without affecting staff booking.
- [ ] 8.3 Add a future browser-based E2E that books publicly and verifies the appointment through staff-visible surfaces.

## Risk Gate

Stop and mark BLOCKED if:
- schema changes imply a separate public reservation system,
- anonymous routes require leaking private IDs or tenant state,
- idempotency cannot be scoped safely to tenant + operation,
- schedule exceptions cannot be modeled without split-interval support,
- or the implementation plan cannot be kept in chained review slices.
