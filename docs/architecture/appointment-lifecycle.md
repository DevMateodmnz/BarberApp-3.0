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

## Time-blocking statuses

The appointment lifecycle and the schedule/availability domain now
share one canonical slot-blocking rule in
`apps/api/src/lib/appointmentBlocking.ts`.

### Blocking statuses

- `PENDING`
- `CONFIRMED`
- `IN_PROGRESS`

### Non-blocking statuses

- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`

Why `PENDING` blocks time: the current staff/public booking domain
still treats a pending appointment as a held operational slot. The
schedule board therefore shows it, counts it, and excludes it from
available gaps. Do not fork a second “board-only” interpretation of
blocking status.

## Deposit-backed pending holds

The payment milestone keeps `PENDING` as a first-class lifecycle status, but it
now has **two valid meanings**:

1. legacy/staff pending appointment not tied to an online payment hold;
2. public deposit-backed reservation hold waiting for payment approval.

Payment-backed pending rows add:

- `paymentHoldExpiresAt`
- optional linked `BookingPayment` rows
- deferred confirmation notifications until approval

Important rules:

- an unexpired payment-backed `PENDING` appointment still blocks the slot;
- an expired hold is treated as non-blocking by the canonical blocking helper
  even before the cleanup worker finishes cancellation;
- `paymentConfirmedAt` is audit-only and is populated only after authoritative
  provider approval;
- staff may not manually confirm an unpaid deposit-backed `PENDING` appointment.

## Operational daily schedule board

The mobile Agenda view and
`GET /api/v1/barbershops/:barbershopId/schedule/day` expose the
appointment lifecycle as an operator-facing day board.

Important lifecycle-to-board rules:

- The board shows all same-day non-deleted appointments, including
  completed, cancelled, and no-show rows, because staff still need
  historical operational context during the day.
- Gap calculation ignores only the non-blocking statuses listed above.
- Returning-customer context is defined by completed visits only.
- Previous no-show context is grouped from historical `NO_SHOW`
  appointments only.
- Capability flags on the board (`canReschedule`, `canStart`,
  `canComplete`, `canMarkNoShow`, `canCancel`) are convenience hints
  for mobile rendering. They do **not** replace server authorization
  or transition validation.

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

### Atomic CAS for every transition

Every status change (staff transition, staff cancel, public
cancel) goes through `compareAndSwapAppointmentStatus` in
`apps/api/src/lib/atomicTransition.ts`. The helper issues a
single `prisma.appointment.updateMany({ where: { id, status:
expectedSource }, data: { status: newStatus, ...lifecycle } })`
and returns `count = 1` only when the row still had the expected
source status at write time. A concurrent transition that wins
the race leaves the row in a different state, the helper returns
`count = 0`, and the service throws
`AppointmentTransitionConflictError` with the stable
`APPOINTMENT_TRANSITION_CONFLICT` (409).

This is the only way to prove race safety under default
READ COMMITTED isolation. A plain `findUnique` + `update` pair,
even inside a `prisma.$transaction`, is read-then-write and is
not race-safe.

### Database CHECK constraint

The cancellation metadata invariants are enforced at the
database level by a CHECK constraint
(`appointments_cancellation_metadata_check`). The constraint
distinguishes three states:

**A. No cancellation metadata.** `cancelled_at`, `cancellation_source`,
`cancelled_by_role`, and `cancel_reason` are all `NULL`.
This is the state of every active appointment and any row that
predates lifecycle tracking. Partial cancellation metadata on
an uncancelled row is a nonsense state and is rejected.

**B. Legacy recorded cancellation.** `cancelled_at IS NOT NULL`
and `cancellation_source IS NULL` (with `cancelled_by_role`
either NULL or populated, and `status = 'CANCELLED'`). This is
the explicit backward-compat branch for rows written between the
first and second lifecycle migrations. No backfill is required.

**C. Fully classified cancellation.** `cancelled_at IS NOT NULL`
and `cancellation_source IS NOT NULL` and `status = 'CANCELLED'`.
The `cancelled_by_role` value must match the source's contract:

| `cancellation_source` | required `cancelled_by_role` |
| --- | --- |
| `STAFF` | `OWNER` or `BARBER` |
| `AUTHENTICATED_CLIENT` | `CLIENT` |
| `PUBLIC_BOOKING` | `NULL` |
| `SYSTEM` | `NULL` |

The constraint is added `NOT VALID` and then `VALIDATE`d in the
same transaction. The `VALIDATE` step DOES scan existing rows.
If any pre-existing row violates the corrected invariant, the
entire migration rolls back and the constraint is removed. This
is intentional and correct: it forces a preflight to find and
fix the rows before the migration is re-applied. It is NOT a
harmless warning.

The corrected migration is
`20260714210000_fix_cancellation_metadata_check/migration.sql`.
The earlier migration
`20260714200000_add_cancellation_metadata_check/migration.sql`
contained a broken first branch (`cancelled_at IS NULL`) that
trivially accepted any row with a null `cancelled_at`, regardless
of the other metadata fields. It is preserved untouched per the
batch rule "do not edit the existing committed migration", but
the corrected constraint supersedes it. The pre-existing
constraint is dropped by the new migration before the corrected
one is added.

### Preflight: detect violating rows before production cutover

Run the query in
`apps/api/prisma/migrations/20260714210000_fix_cancellation_metadata_check/preflight.sql`
against the target database BEFORE applying the migration. The
query must return zero rows; otherwise the migration's `VALIDATE
CONSTRAINT` step will roll back the entire transaction.

The preflight identifies five classes of violation:

1. `cancelled_at IS NULL` with `cancellation_source IS NOT NULL`
   (partial metadata on an active row).
2. `cancelled_at IS NULL` with `cancelled_by_role IS NOT NULL`.
3. `cancelled_at IS NULL` with `cancel_reason IS NOT NULL`.
4. `cancelled_at IS NOT NULL AND status <> 'CANCELLED'`.
5. Classified cancellation metadata where the role does not match
   the source's contract.

Resolution per row: clear spurious metadata on uncancelled rows;
on cancelled rows, fix the role to match the source, or set the
source to `NULL` to fall back to the legacy branch. Do not delete
or rewrite data merely to make the constraint pass.

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

## Rescheduling

Appointment rescheduling is now a first-class staff workflow and is
documented in detail in
[`docs/architecture/appointment-rescheduling.md`](./appointment-rescheduling.md).

Lifecycle-specific rules worth calling out here:

- rescheduling is **not** a lifecycle status transition; the row stays
  `CONFIRMED`;
- only future confirmed appointments are eligible;
- the reschedule write uses a compare-and-swap guard on the original
  appointment shape so a competing lifecycle transition or competing
  reschedule cannot silently overwrite the winner;
- append-only `appointment_changes` rows preserve the operational audit
  trail separately from lifecycle timestamps.
