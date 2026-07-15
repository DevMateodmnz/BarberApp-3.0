# Appointment Rescheduling and Change Audit

## Scope

Staff rescheduling is an OWNER/BARBER workflow for **future
confirmed** appointments only. It does **not** add:

- public self-rescheduling;
- recurring appointments;
- SMS / WhatsApp / push notifications.

## Eligibility

An appointment can be rescheduled only when all of these are true:

- `status = CONFIRMED`
- `deletedAt IS NULL`
- `startAt > now`

Rescheduling is rejected for:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `NO_SHOW`
- `CANCELLED`
- soft-deleted rows
- already-started rows

## API contract

Primary route:

```text
PATCH /api/v1/appointments/:appointmentId/reschedule
```

Body:

```json
{
  "employeeId": "optional",
  "serviceId": "optional",
  "startAt": "2026-07-20T13:00:00.000Z",
  "reason": "optional staff-only note"
}
```

Legacy compatibility:

```text
PUT /api/v1/appointments/:appointmentId
```

still works as a time-only alias for older callers.

History route:

```text
GET /api/v1/appointments/:appointmentId/changes
```

## Authorization

- **OWNER** may reschedule any eligible appointment in the same
  barbershop.
- **BARBER** may reschedule only appointments they already manage
  under the existing product rules, and may not move a booking onto
  another barber’s calendar.
- **CLIENT** is forbidden.
- cross-tenant probes stay hidden behind `404`.

## Atomic write design

Rescheduling is not implemented as “read availability, then
unconditional update”.

The service now:

1. loads the tenant-authorized appointment;
2. validates eligibility;
3. validates the destination employee/service/assignment;
4. derives `endAt` from the selected service duration;
5. validates the destination against the employee-effective schedule;
6. checks application-level overlap excluding the appointment itself;
7. performs a compare-and-swap `updateMany(...)` using the original
   `(status, employeeId, serviceId, startAt, endAt, deletedAt)` as
   the guard;
8. relies on PostgreSQL’s `no_double_booking` exclusion constraint as
   the final authority;
9. writes the audit row and notification mutations in the same
   transaction.

The schedule validation now goes through the canonical
`validateEmployeeAvailabilityWindow(...)` helper, which itself uses
`resolveEmployeeEffectiveScheduleForDate(...)`. That means staff
create, staff reschedule, public booking, and the daily schedule board
all agree on employee-specific time off and custom hours.

Outcomes:

- same-appointment concurrent reschedules → one `200`, one
  `APPOINTMENT_RESCHEDULE_CONFLICT` `409`;
- two appointments racing for one slot → one `200`, one
  `APPOINTMENT_SLOT_UNAVAILABLE` `409`;
- lifecycle-vs-reschedule races resolve through the CAS guard on
  `status = CONFIRMED`.

## Audit model

`appointment_changes` is append-only and stores:

- actor user id + role;
- previous/new employee ids;
- previous/new service ids;
- previous/new start/end timestamps;
- previous/new employee/service display names;
- optional staff reason.

The readable name snapshots are intentional: employee or service
renames later must not erase the operational story of the change.

The table uses restrictive foreign keys, so deleting an appointment,
barbershop, or actor row cannot silently erase history.

## Notification synchronization

On a successful reschedule transaction:

1. obsolete pending/processing `REMINDER_24H` rows are cancelled;
2. a new `REMINDER_24H` row is created only when the new start remains
   more than 24 hours away;
3. one `APPOINTMENT_RESCHEDULED` email outbox row is created when the
   appointment has an email snapshot.

The outbox row is immediate and uses:

```text
appointment:<appointmentId>:APPOINTMENT_RESCHEDULED:EMAIL:<appointmentChangeId>
```

Public references remain stable, so the same public cancellation link
still works after a staff reschedule.

## Public-web compatibility

No public self-reschedule route was added.

Compatibility changes are narrow:

- public appointments keep the same `publicReference`;
- `GET /api/v1/public/barbershops/:slug/appointments/:reference`
  returns the **current** timing for the confirmation page;
- the public web confirmation page now refreshes from `?ref=...`
  when that reference is available (for example from a reschedule
  email link).

## Deferred work

- customer self-rescheduling
- recurring appointments
- additional reminder channels
- broader cross-employee BARBER rescheduling policy
- automatic bulk repair of appointments that fall outside a newly
  narrowed employee schedule
