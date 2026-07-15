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
- `payload` stores only rendering-safe data:
  - customer name
  - barbershop name
  - service name
  - employee name
  - timezone
  - startAt
  - public slug/reference when applicable

The table keeps delivery history. Foreign keys are `RESTRICT`, so notification audit rows are not deleted by accident.

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
5. mark `SENT`, `PENDING` with retry, or `FAILED`
6. if the appointment became incompatible while the row was claimed, mark it `CANCELLED`

## Retry policy

Attempts use bounded exponential backoff:

1. +1 minute
2. +5 minutes
3. +30 minutes
4. terminal `FAILED`

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
