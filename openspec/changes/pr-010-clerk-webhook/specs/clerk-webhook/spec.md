# Clerk Webhook Specification

## Purpose
Receive Clerk webhook events, verify Svix signatures, sync User records with idempotency.

## Requirements

### Requirement: Signature Verification
POST /api/v1/webhooks/clerk MUST verify Svix signatures via `standardwebhooks.Webhook`. Missing headers or invalid signature SHALL return 400.

| Scenario | GIVEN | THEN |
|----------|-------|------|
| Valid signature | svix-id, svix-timestamp, svix-signature match CLERK_WEBHOOK_SECRET | 200, event processed |
| Missing svix-id | svix-id absent | 400 |
| Missing svix-timestamp | svix-timestamp absent | 400 |
| Missing svix-signature | svix-signature absent | 400 |
| Invalid signature | tampered payload or wrong secret | 400 |

### Requirement: user.created Handler
MUST create User. Duplicates SHALL 200 with no side effects. Soft-deleted users SHALL reactivate.

| Scenario | GIVEN | THEN |
|----------|-------|------|
| New user | valid payload with id, email, name | User(clerkUserId, email, name, role=CLIENT) created |
| Duplicate | clerkUserId exists | 200 OK, P2002 caught, no duplicate |
| Reactivate | user has deletedAt set | deletedAt cleared |

### Requirement: user.updated Handler
MUST update email/name. Non-existent clerkUserId SHALL upsert.

| Scenario | GIVEN | THEN |
|----------|-------|------|
| Update | clerkUserId exists, new email/name | DB updated |
| Upsert | clerkUserId not in DB | User created, role=CLIENT |

### Requirement: user.deleted Handler
MUST set deletedAt. Non-existent clerkUserId SHALL no-op.

| Scenario | GIVEN | THEN |
|----------|-------|------|
| Soft delete | clerkUserId exists | deletedAt set to now |
| No-op | clerkUserId not in DB | 200 OK |

### Requirement: Unknown Event Types
MUST return 200 for unrecognized types to prevent Clerk retries.

| Scenario | GIVEN | THEN |
|----------|-------|------|
| Unrecognized | event type ∉ {user.created, user.updated, user.deleted} | 200, no action |

### Requirement: Field Mapping
Clerk payload fields MUST map to User columns:

| Clerk field | DB column | Rule |
|------------|----------|------|
| `data.id` | `clerkUserId` | Direct |
| `data.email_addresses[primary]` | `email` | Match `primary_email_address_id`, else first. Empty → 400. |
| `data.first_name` + `data.last_name` | `name` | Trimmed join. Both empty → email local-part. |
| — | `role` | Always `CLIENT` |

### Requirement: Idempotency
All handlers MUST be idempotent. `user.created` catches Prisma P2002 on clerkUserId unique constraint. `user.updated`/`user.deleted` use `where: { clerkUserId }` (naturally idempotent). Duplicate events SHALL 200 no-op.

### Requirement: Route Isolation (Non-Functional)

| ID | Constraint |
|----|-----------|
| NF1 | No Clerk auth middleware on webhook route |
| NF2 | Excluded from appointment rate limiter |
| NF3 | `express.raw()` before `express.json()` preserves raw body |
| NF4 | Normal API routes parse JSON correctly after wiring |
| NF5 | CLERK_WEBHOOK_SECRET from env only |
| NF6 | `.env.example` placeholder only |
| NF7 | `standardwebhooks` explicit dependency |
| NF8 | 75 existing tests pass |
| NF9 | No schema change or migration |

## Out of Scope
Auto-provisioning in auth middleware, OWNER/BARBER roles, admin role API, webhook UI, rate limiting on webhook endpoint.
