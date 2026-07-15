# Appointment notification outbox

BarberApp now delivers appointment email through a durable outbox, not an in-process timer.

## Scope

Implemented in this milestone:

- `BOOKING_CONFIRMATION` email
- `REMINDER_24H` email
- transactional outbox writes
- idempotent worker claiming with `FOR UPDATE SKIP LOCKED`
- bounded exponential backoff
- stale lock recovery
- reminder cancellation on cancel / complete / no-show / reschedule

Deferred:

- WhatsApp
- SMS
- push notifications
- marketing or campaign messaging
- 2-hour reminders

## Data model

`appointments`
- `client_email` stores the immutable appointment email snapshot.

`appointment_notifications`
- tenant-scoped by `(appointment_id, barbershop_id)`
- unique `idempotency_key`
- `status` in `PENDING | PROCESSING | SENT | FAILED | CANCELLED`
- `attempts` is the current worker-cycle retry counter
- manual retry audit metadata:
  - `manual_retry_count`
  - `last_manual_retry_at`
  - `last_manual_retry_by_user_id`
- `payload` stores only rendering-safe data:
  - customer name
  - barbershop name
  - service name
  - employee name
  - timezone
  - startAt
  - public slug/reference when applicable

`appointment_notification_attempts`
- append-only delivery-attempt audit table
- one row per actual transport call
- outcome in `SENT | TEMPORARY_FAILURE | PERMANENT_FAILURE`
- stores hashed/sanitized worker + provider identifiers only
- never stores recipient email, payload, or SMTP/provider secrets

The notification row stores current state; the attempts table stores durable history. Foreign keys are `RESTRICT`, so delivery audit rows are not deleted by accident.

## Transaction boundary

Notification rows are created in the same transaction as:

- staff appointment creation
- public booking creation

Notification rows are cancelled in the same transaction as:

- staff/authenticated cancellation
- public cancellation
- terminal lifecycle transitions
- reschedules that obsolete a previous 24h reminder

This guarantees that the appointment state and outbox state commit together.

## Idempotency

Scheduling keys:

- `appointment:<appointmentId>:BOOKING_CONFIRMATION:EMAIL`
- `appointment:<appointmentId>:REMINDER_24H:EMAIL:<scheduledForISO>`

Public booking replays reuse the same appointment and the same outbox rows.

## Worker claim algorithm

Worker entrypoint:

- `apps/api/src/scripts/notificationWorker.ts`

Flow:

1. release stale `PROCESSING` rows back to `PENDING`
2. claim due rows with one SQL statement using `FOR UPDATE SKIP LOCKED`
3. render the email from the stored payload
4. send through the configured transport
5. persist exactly one append-only attempt row for the transport call
6. mark `SENT`, `PENDING` with retry, or `FAILED`
7. if the appointment became incompatible while the row was claimed, mark it `CANCELLED`

## Retry policy

Automatic worker retries use bounded exponential backoff:

1. +1 minute
2. +5 minutes
3. +30 minutes
4. terminal `FAILED`

Manual operator retry supports only:

```text
FAILED -> PENDING
```

It is OWNER-only, compare-and-swap, clears stale lock state, resets the current worker-cycle retry counter, preserves cumulative attempt history, and never sends SMTP inline.

Errors are sanitized and truncated. Recipient addresses and message bodies are never logged.

## Email transport

Local development uses SMTP + Mailpit.

Environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USERNAME` (optional)
- `SMTP_PASSWORD` (optional)
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME` (optional)
- `PUBLIC_WEB_BASE_URL` (optional, for public cancellation links)

The worker fails clearly if SMTP is not configured.

## Privacy

- delivery payload omits internal notes, auth tokens, and Clerk identifiers
- notification summary APIs do not expose recipient email or raw payload
- public references are treated as bearer credentials and are not logged

## Delivery ambiguity

BarberApp keeps the worker as the only delivery path and records attempt history for every transport call, but SMTP success and database commit cannot be made globally atomic. A process crash after SMTP acceptance and before the state commit can still leave ambiguity. We mitigate this with deterministic Message-ID generation, hashed stored provider identifiers, and explicit operator visibility through the notification-operations surface.
