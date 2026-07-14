# Appointment Lifecycle

> Domain rules for the appointment state machine, the lifecycle
> timestamps recorded on every transition, the cancellation
> contract (including the anonymous-public-cancel and its
> future-start cutoff), and the customer-lookup endpoint. This
> document is the source of truth for behavior; the implementation
> must match.

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
  (`publicReference`). See [Booking reference security](#booking-reference-security).
- A status (`status`) drawn from a closed enum.
- Lifecycle timestamps recording when each terminal event
  happened.
- A decoupled cancellation model: `cancelledByRole` records the
  authenticated actor's role (nullable for anonymous/system),
  `cancellationSource` records where the cancellation
  originated, and `cancelReason` carries the optional reason.

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
authenticated staff/client entry point. The public flow lives in
`publicBookingService.cancelPublicBookingByReference` and is
described separately in [Public cancellation](#public-cancellation).

The cancellation model has two coupled fields:

- `cancelledByRole` (`UserRole?`) — the authenticated actor's role,
  **nullable** for anonymous flows.
- `cancellationSource` (`AppointmentCancellationSource?`) — where
  the cancellation originated.

| Source | When | `cancelledByRole` |
| --- | --- | --- |
| `STAFF` | OWNER/BARBER cancel | the actor's role |
| `AUTHENTICATED_CLIENT` | Authenticated CLIENT self-cancel (future mobile flow) | `CLIENT` |
| `PUBLIC_BOOKING` | Anonymous public cancel-by-reference | `null` |
| `SYSTEM` | Automated jobs (future no-show sweep, slot expiration) | `null` |

Both columns are stamped together with `cancelledAt`. The reason
is trimmed and clamped to 500 chars by the lifecycle helper; an
empty/whitespace reason is stored as `NULL`.

The application layer enforces the row invariant
(`cancelledByRole` is non-null iff `cancellationSource` is
`STAFF` or `AUTHENTICATED_CLIENT`).

## Public cancellation

`POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel`

Anonymous public cancellation is the customer self-cancel flow
that runs on the public-web confirmation page. It is
intentionally strict because a miscancel can convert a missed
appointment into a "cancel" and skew no-show analytics.

### Security model: the reference is a bearer credential

The `publicReference` functions as a bearer credential. Whoever
presents it can cancel the matching booking. This is the same
security model that most consumer booking services use; it is
acceptable when:

- The reference has enough entropy to be unguessable. See
  [Booking reference security](#booking-reference-security).
- The reference is rotated for any operator-facing view; a
  reference printed on a receipt, email, or shared screenshot
  is, in effect, transferred.
- The endpoint is rate-limited. The public cancel route uses
  `bookingWriteRateLimit` (the same bucket as the public booking
  create endpoint), so a single source cannot enumerate or brute
  force references at scale.

### Policy: future-start cutoff

The endpoint enforces a strict future-start cutoff. A row can be
cancelled by an anonymous public request **only** when:

- The booking reference is well-formed and the row exists.
- The barbershop is active and the slug matches the request slug
  (cross-tenant probes return 404, not 403).
- The status is `CONFIRMED`. `PENDING` and `IN_PROGRESS` rows are
  also closed to public cancel (returned with the same 409 code
  but a different stable error message).
- `appointment.startAt > now`. The instant `startAt <= now` the
  endpoint returns `409 PUBLIC_BOOKING_CANCELLATION_CLOSED` and
  the staff side takes over (the staff can transition the row to
  `NO_SHOW` or `COMPLETED`).

This rule prevents a customer from retroactively converting a
missed appointment into a "cancel" after the start.

### Atomic transition

The check + state mutation run in a single Prisma transaction.
The transaction re-reads the row, re-evaluates the conditions, and
only commits if the row is still eligible. A competing staff
transition (e.g. an OWNER marking the row as `NO_SHOW` while the
customer is hitting the cancel button) cannot interleave: the
loser observes the terminal state and returns 409 with
`PUBLIC_BOOKING_ALREADY_TERMINAL`.

### Idempotent on the row, not on the request

A repeated cancel after a successful cancel returns
`409 PUBLIC_BOOKING_ALREADY_TERMINAL` and does not modify the
row. The status code and error code are stable so the public-web
client can render a precise message.

### Stable error codes

| HTTP | Code | When |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Slug, reference, or barbershop is missing/mismatched. Existence is hidden. |
| 409 | `PUBLIC_BOOKING_ALREADY_TERMINAL` | Row is in a terminal state. |
| 409 | `PUBLIC_BOOKING_CANCELLATION_CLOSED` | Row is `PENDING`/`IN_PROGRESS` or `startAt <= now`. |
| 400 | `VALIDATION_ERROR` | Body fails E.164 / 500-char reason validation. |
| 429 | `RATE_LIMITED` | Public booking write rate limit exceeded. |

## Customer lookup

`POST /api/v1/barbershops/:barbershopId/customers/lookup`

Body:

```json
{ "phone": "+549..." }
```

- Body-only. The legacy `GET ...?phone=...` route was removed in
  Phase 1 hardening because the URL is logged by access proxies,
  web servers, and referer headers; a customer phone number is
  PII and must not appear in any of them.
- Validated with zod for E.164 format. Malformed input returns
  `400 VALIDATION_ERROR`.
- Returns a `CustomerInsights` payload that **omits the
  submitted phone**. The caller already has it; repeating it
  would re-expose PII in any response-body log. The shape is:
  - `visitCount`, `noShowCount`, `cancelledCount`, `completedCount`
  - `lastVisitAt`, `lastNoShowAt`
  - `recentAppointments[]` with `id`, `startAt`, `endAt`, `status`,
    `serviceName`, `employeeName`.
- Counts only `appointments.clientPhoneNormalized` matches.
  Legacy staff rows with NULL `clientPhoneNormalized` are
  excluded. If legacy data matters for a tenant, the operator
  can normalize historical rows in a one-off backfill.
- `lastVisitAt` is the most recent `startAt` for any matching
  appointment regardless of status.
- `lastNoShowAt` is the most recent `startAt` of any matching
  `NO_SHOW` row.
- Recent appointments are ordered by `startAt` descending and
  capped at the requested `limit` (default 10, max 50).
- The endpoint hides cross-tenant existence: a probe for a
  foreign barbershop returns 404, not 403, matching the
  `getAppointment` convention.
- Authorized for OWNER and BARBER; CLIENT returns 403.

## Booking reference security

Generated by `apps/api/src/lib/publicBookingReference.ts`:

- **Source**: `crypto.randomBytes(12)` — OpenSSL-backed CSPRNG.
- **Entropy**: 96 bits (12 bytes). Encoded as 20 base32 chars
  (`[A-Z2-7]`, no 0/1/I/O for legibility).
- **Format**: `pb_<20 base32 chars>`. The regex is
  `^pb_[A-Z2-7]{20}$`.
- **Uniqueness**: enforced at the database level by the
  `publicReference @unique` constraint on `Appointment`.
  Collision probability is < 2^-96 per booking; on collision
  the unique index rejects and the caller retries.
- **Not sequential**: random, not auto-incrementing. A leak of
  one reference reveals nothing about other references.
- **Not logged**: the reference is generated, persisted, and
  returned to the caller. The error middleware does not log
  request bodies. The public booking service does not log the
  reference. The reference is not part of
  `fingerprintPublicBookingRequest`.
- **Rate-limited**: the public cancel route is under
  `bookingWriteRateLimit` (same bucket as the public booking
  create endpoint).

A separate cancellation-token hash could be added as a future
hardening pass (a one-way hash derived from the reference that
must be presented alongside it to cancel). It is not currently
required given the entropy floor and the rate limit.

## Database constraints

- The existing `no_double_booking` GiST exclusion constraint
  applies to rows whose status is in `BLOCKING_APPOINTMENT_STATUSES`
  (`PENDING`, `CONFIRMED`, `IN_PROGRESS`). Terminal rows are
  exempt.
- The composite index
  `appointments_barbershop_id_client_phone_normalized_idx`
  supports the customer lookup endpoint. The migration does not
  use a partial index because Prisma's `@@index` does not
  support `WHERE` clauses; the column is filtered naturally by
  the `clientPhoneNormalized` equality predicate.
- The `AppointmentCancellationSource` enum is added by the
  hardening migration and is enforced at the application layer
  (not by a CHECK constraint, because the relationship with
  `cancelledByRole` is logical, not a single-value rule).

## Migration discipline

The Phase 1 hardening is delivered as two additive migrations:

1. `20260714150000_add_appointment_lifecycle_tracking/migration.sql` —
   nullable lifecycle columns and the customer-lookup index.
2. `20260714180000_add_appointment_cancellation_source/migration.sql` —
   the `AppointmentCancellationSource` enum and the
   `cancellation_source` column.

### Rollback and down-migration

- **Before any production writes** (i.e. immediately after
  `mvp-1.1.1` deploys and before customer traffic): dropping the
  additive columns and the index is operationally simple and
  affects no real data.

- **After lifecycle data exists** (i.e. after the public cancel
  flow has been used and `cancellationSource`/`cancelledAt`/
  `cancelledByRole`/`cancelReason` rows are populated): a
  destructive down-migration is **not** an automatic rollback
  strategy. Dropping the columns destroys:
  - cancellation reasons (for analytics and support escalations)
  - cancellation actor metadata (who cancelled, when)
  - the `cancellationSource` audit trail (staff vs anonymous
    public vs future system)
  - transition timestamps for confirmed/started/completed/no-show

  In this state, prefer one of:
  - a **forward-fix** migration that restores the columns and
    backfills from a verified backup, or
  - a **backup-restore** to a known-good point before the
    destructive change.

  Never deploy a destructive down-migration against production
  once lifecycle data exists.

## Test coverage

| Behavior | File |
| --- | --- |
| Status-to-timestamp mapping, cancel reason normalization, source semantics | `apps/api/tests/unit/appointmentLifecycle.test.ts` |
| Transition timestamps and cancel-with-reason | `apps/api/tests/integration/appointmentLifecycle.test.ts` |
| Cross-tenant hidden existence on cancel | `apps/api/tests/integration/appointmentLifecycle.test.ts` |
| Reference entropy, format, non-sequential | `apps/api/tests/unit/publicBookingReference.test.ts` |
| Public cancel atomic future-start cutoff, cancellation source, rate-limit context | `apps/api/tests/integration/publicCancel.test.ts` |
| Customer lookup body-only contract, PII exclusion from response | `apps/api/tests/integration/customerLookup.test.ts` |
| Mobile API client cancel-with-reason and lookup | `apps/mobile/tests/unit/appointmentsStore.test.ts` |
| Mobile warning copy with no-show pluralization | `apps/mobile/src/components/__tests__/AppointmentCreateScreenView.test.tsx` |
| Public-web confirmation cancel flow | (covered by existing publicBookingConfirmation test) |
