# Notification Operations and Delivery Audit

> Owner-facing operational visibility for transactional appointment email.
> This milestone does not replace the durable outbox; it sits on top of it.

## Quick path

1. `appointment_notifications` stores the current lifecycle state of each
   scheduled transactional notification.
2. `appointment_notification_attempts` stores the append-only delivery
   history for actual transport calls.
3. Only `FAILED` notifications are manually retryable, and retry means
   `FAILED -> PENDING` only.
4. Manual retry is compare-and-swap, tenant-scoped, OWNER-only, and never
   sends SMTP inline.
5. BARBER users keep appointment-row notification visibility, but the
   global operations screen and retry controls are OWNER-only.

## Product scope

This milestone adds:

- barbershop notification summary counts;
- paginated owner operations list;
- owner notification detail with attempt timeline;
- append-only worker attempt auditing;
- audited manual retry metadata;
- safe manual requeue for terminal failures.

This milestone explicitly does **not** add:

- bulk retry;
- WhatsApp, SMS, or push delivery;
- campaigns / promotions / loyalty flows;
- inline SMTP send from the API request;
- customer-facing notification controls.

## Role decision

| Role | Access |
| --- | --- |
| OWNER | Full operations summary/list/detail + manual retry |
| BARBER | Existing appointment-level notification state only |
| CLIENT | No access |

Why this split:

- owners need barbershop-wide delivery operations and controlled recovery;
- barbers already see appointment-row status labels relevant to daily work;
- retry authority is intentionally narrower than read access to avoid
  accidental duplicate recovery actions.

Cross-tenant probes remain hidden as `404`.

## Data model

### Current-state row

`appointment_notifications` still owns the current state machine:

- `status` in `PENDING | PROCESSING | SENT | FAILED | CANCELLED`
- `attempts` as the current worker-cycle retry counter
- `manual_retry_count`
- `last_manual_retry_at`
- `last_manual_retry_by_user_id`
- sanitized `last_error`
- hashed `provider_message_id`

`attempts` is **not** the durable history. It is reset when a manual retry
requeues a terminal failure for a fresh worker cycle.

### Append-only attempt history

`appointment_notification_attempts` records one row per actual transport
call.

Important semantics:

- one delivery call ⇒ one attempt row;
- no call ⇒ no attempt row;
- stale-lock recovery does not fabricate attempts;
- cancelled rows do not create attempts;
- successful delivery keeps its attempt row forever;
- manual retry produces a later attempt row rather than a new
  notification.

Fields intentionally avoid PII/secrets:

- no recipient email;
- no payload/body;
- no raw lock token;
- no SMTP credentials;
- no full provider response;
- `worker_token_hash` and `provider_message_id_hash` store hashed opaque
  identifiers only.

Attempt ordering is deterministic by:

1. `attempt_number`
2. `attempted_at`

## Summary semantics

`GET /api/v1/barbershops/:barbershopId/notifications/summary`
returns barbershop-scoped counts.

Definitions:

- `pending`: notifications currently waiting to be claimed
- `processing`: claimed notifications still in-flight
- `sent`: successfully delivered notifications
- `failed`: terminal failures awaiting operator intervention
- `cancelled`: obsolete notifications intentionally suppressed
- `dueNow`: `PENDING` rows whose `next_attempt_at <= now`
- `retrying`: `PENDING` rows with `attempts > 0`

`dueNow` and `retrying` are operational counters, not lifecycle statuses.

## List and detail privacy

Safe list/detail responses include:

- notification id + appointment id;
- type/channel/status;
- scheduled / next-attempt / sent / cancelled timestamps;
- masked recipient (`m***@example.com` shape);
- customer display name;
- service / employee / appointment summary;
- sanitized latest failure;
- bounded attempt history;
- manual retry metadata;
- retry eligibility.

They exclude:

- raw recipient email;
- raw payload;
- raw provider identifiers;
- lock tokens;
- public booking references;
- stack traces.

## Manual retry state machine

Only one explicit transition is supported:

```text
FAILED -> PENDING
```

Why only `FAILED`:

- `PENDING` already has scheduled work;
- `PROCESSING` may already be in-flight;
- `SENT` must never be redelivered manually;
- `CANCELLED` was intentionally suppressed.

Retry behavior:

- owner access is re-validated in the service layer;
- the update uses conditional `WHERE status = 'FAILED'` semantics;
- the winner clears stale locks and sanitized last error;
- `next_attempt_at = now`;
- `manual_retry_count` increments exactly once;
- actor/timestamp are written using local `users.id`, never Clerk ids;
- `attempts` resets for a fresh retry cycle;
- prior attempt history remains untouched.

Concurrent retries produce:

- one successful transition;
- one deterministic `NOTIFICATION_RETRY_CONFLICT`.

## Why the API does not send mail inline

The retry endpoint only requeues work. It does **not** send SMTP from the
HTTP request because inline send would:

- bypass worker claim/idempotency rules;
- make retries race with the worker;
- hide delivery attempts from the audit table;
- turn a state transition into a network-coupled request path.

The worker remains the single delivery path.

## Worker integration and ambiguity

The worker writes attempt history inside the same DB-side state update
transaction that marks success / retry / terminal failure.

This prevents duplicate audit rows for a single claimed attempt under
normal worker races, but one ambiguity remains unavoidable:

> SMTP delivery can succeed externally and the process can still fail
> before the database commit is visible.

Because of that, the architecture does **not** claim perfect exactly-once
email delivery. The mitigation remains:

- deterministic idempotent Message-ID generation;
- hashed stored provider identifiers;
- explicit operator visibility into duplicates/failures when needed.

## Deferred follow-ups

Still intentionally deferred:

- bulk retry
- retry by filter/search batch
- WhatsApp / SMS / push channels
- provider-specific delivery webhooks
- operator resend with edited content
- customer-facing notification inbox
