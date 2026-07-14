# Appointment Lifecycle

> Domain rules for the appointment state machine, the lifecycle
> timestamps recorded on every transition, the cancellation
> contract, and the customer-lookup endpoint. This document is the
> source of truth for behavior; the implementation must match.

## Overview

The `Appointment` model carries the full lifecycle of a
single appointment:

- A scheduled start (`startAt`, `endAt`).
- A snapshot of the service that was booked (`serviceName`,
  `servicePriceCents`, `serviceDurationMinutes`,
  `serviceCurrency`) — the snapshot never changes even if the
  service is later renamed or repriced.
- A snapshot of the client when the customer is anonymous
  (`clientName`, `clientPhone`, `clientPhoneNormalized`).
- A reference for the public confirmation page
  (`publicReference`).
- A status (`status`) drawn from a closed enum.
- Lifecycle timestamps recording when each terminal event
  happened.
- An optional `cancelReason` and the role of the actor who
  cancelled (`cancelledByRole`).

The lifecycle helper
(`apps/api/src/lib/appointmentLifecycle.ts`) is the **only**
place where a status change is translated into a persistence
payload. All callers go through it.

## Status enum

```text
PENDING
CONFIRMED
IN_PROGRESS
COMPLETED          (terminal)
CANCELLED          (terminal)
NO_SHOW            (terminal)
```

## Allowed transitions

The `STATUS_TRANSITIONS` map in
`apps/api/src/services/appointmentService.ts` is the single
source of truth for valid transitions. Transitions are validated
**before** any database write, with the actor's role checked
against `allowedRoles` for the target status.

| From | To | Allowed roles |
| --- | --- | --- |
| PENDING | CONFIRMED | OWNER |
| PENDING | CANCELLED | CLIENT, OWNER |
| CONFIRMED | IN_PROGRESS | BARBER, OWNER |
| CONFIRMED | CANCELLED | CLIENT, OWNER |
| IN_PROGRESS | COMPLETED | BARBER, OWNER |
| IN_PROGRESS | NO_SHOW | BARBER, OWNER |
| COMPLETED, CANCELLED, NO_SHOW | (none) | (terminal) |

> The `BARBER -> CANCELLED` transition is intentionally **not**
> allowed. A barber cannot unilaterally cancel a customer's
> confirmed appointment. If a barber needs to cancel, the OWNER
> must do it. This is a product policy decision; if it needs to
> change, update the map and add a regression test.

## Lifecycle timestamps

Each transition to a non-cancel terminal state stamps exactly
one timestamp column:

| Target status | Column |
| --- | --- |
| CONFIRMED | `confirmedAt` |
| IN_PROGRESS | `startedAt` |
| COMPLETED | `completedAt` |
| NO_SHOW | `noShowAt` |
| CANCELLED | (handled by the cancel helper, see below) |

The mapping lives in
`buildLifecycleUpdateForStatus(status, actorRole, now)`. Adding
a new status or changing the mapping is a single-file change.

## Cancellation

`cancelAppointment(appointmentId, userId, role, options)` is the
only entry point for cancellation from inside the API. It
records:

- `status = 'CANCELLED'`
- `cancelledAt = now` (default: server wall clock)
- `cancelledByRole = role` (`OWNER`, `BARBER`, or `CLIENT`)
- `cancelReason = trim(reason).slice(0, 500)` or `NULL` when the
  reason is empty / whitespace

The public cancel flow
(`POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel`)
is a separate entry point that lives in
`publicBookingService.cancelPublicBookingByReference`. It always
sets `cancelledByRole = 'CLIENT'` to represent the anonymous
guest. The public endpoint is the only path that does not
require a Clerk-authenticated user.

### Why `CLIENT` for public cancellation

`cancelledByRole` is intentionally constrained to the existing
`UserRole` enum to avoid a new migration that changes an enum.
For analytics, "CLIENT" means "the customer-initiated the
cancellation" — it does not require a logged-in account. The
semantic is documented in the helper's JSDoc and is exercised by
the public-cancel integration test.

If a future milestone introduces a real "PUBLIC" or "GUEST"
role, this convention can be tightened.

## Customer lookup

`GET /api/v1/barbershops/:barbershopId/customers/lookup?phone=E164`

- Returns a zeroed-out `CustomerInsights` payload (no error) when
  the phone has no history in the barbershop, so the UI does not
  need a special branch.
- Counts only `appointments.clientPhoneNormalized` matches.
  Legacy staff rows with NULL `clientPhoneNormalized` are
  excluded — they are visible in the appointment list but not
  matched by this endpoint. This is documented behavior; if
  legacy data matters for a tenant, the operator can normalize
  historical rows in a one-off backfill.
- `lastVisitAt` is the most recent `startAt` for any matching
  appointment regardless of status.
- `lastNoShowAt` is the most recent `startAt` of any matching
  `NO_SHOW` row.
- Recent appointments are ordered by `startAt` descending and
  capped at the requested `limit` (default 10, max 50).
- The endpoint hides cross-tenant existence: a probe for a
  foreign barbershop returns 404, not 403, matching the
  `getAppointment` convention.

## Database constraints

- The existing `no_double_booking` GiST exclusion constraint
  applies to rows whose status is in `BLOCKING_APPOINTMENT_STATUSES`
  (`PENDING`, `CONFIRMED`, `IN_PROGRESS`). Terminal rows are
  exempt.
- The new index
  `appointments_barbershop_id_client_phone_normalized_idx`
  supports the customer lookup endpoint. The migration does not
  use a partial index because Prisma's `@@index` does not
  support `WHERE` clauses; the column is filtered naturally by
  the `clientPhoneNormalized` equality predicate.

## Migration discipline

- The Phase 1 migration
  `20260714150000_add_appointment_lifecycle_tracking/migration.sql`
  is purely additive. Every new column is nullable and has no
  default. No backfill is performed.
- Legacy `appointments` rows keep their existing
  `clientPhone` value, but their `clientPhoneNormalized` is
  NULL until the next update or a one-off backfill.
- Rollback implications: dropping the columns and the index
  would re-add the previous (more limited) lifecycle surface.
  No data is lost when rolling back because the new columns
  carry no historical information for pre-migration rows.

## Test coverage

| Behavior | File |
| --- | --- |
| Status-to-timestamp mapping, cancel reason normalization | `apps/api/tests/unit/appointmentLifecycle.test.ts` |
| Transition timestamps and cancel-with-reason | `apps/api/tests/integration/appointmentLifecycle.test.ts` |
| Cross-tenant hidden existence on cancel | `apps/api/tests/integration/appointmentLifecycle.test.ts` |
| Customer lookup counts and tenant scoping | `apps/api/tests/integration/customerLookup.test.ts` |
| Public cancel by reference | `apps/api/tests/integration/publicCancel.test.ts` |
| Mobile API client cancel-with-reason and lookup | `apps/mobile/tests/unit/appointmentsStore.test.ts` |
| Public-web confirmation cancel flow | (covered by existing publicBookingConfirmation test) |
