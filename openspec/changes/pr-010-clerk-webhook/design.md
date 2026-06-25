# Design: Clerk Webhook / User Synchronization

## Technical Approach

Add `POST /api/v1/webhooks/clerk` route registered with `express.raw()` **before** global `express.json()` in `index.ts`. Route extracts `svix-*` headers, maps them to `webhook-*` names expected by `standardwebhooks.Webhook`, verifies signature, dispatches to `userSyncService`. Existing routes unaffected — route-specific middleware isolates the raw body requirement.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Webhook route placement | Before `express.json()` with `express.raw({type:'application/json'})` as route-specific | (B) Separate sub-app/router | Option A is simpler: one-line middleware on the route, no new router wiring, visually clear in `index.ts` |
| Header mapping | Map `svix-*` → `webhook-*` in handler; `standardwebhooks` expects lowercase `webhook-id/signature/timestamp` | — | `standardwebhooks` uses standard webhooks protocol headers; Clerk brands them `svix-*`. Source code (line 52-54) reads `headers["webhook-id"]` after lowercasing all keys |
| CJS import in ESM | `import { Webhook } from 'standardwebhooks'` — works via Node.js ESM interop + `esModuleInterop:true` | Dynamic import, `createRequire` | TypeScript `.d.ts` declares ES exports. tsx/vitest/NodeNext handle CJS-in-ESM transparently |
| Signature verification | `new Webhook(secret).verify(rawBody, headers)` — returns parsed JSON on success, throws on failure | Manual HMAC-SHA256 | Library already available (transitive dep), battle-tested |
| Idempotency (create) | P2002 catch → check deletedAt → restore or return existing | Pre-check with findUnique | Single DB round-trip in common case; handles duplicate + reactivation atomically |
| Soft-delete reactivation | `user.created` clears `deletedAt` | Only restore on explicit Clerk re-activation event | Clerk says user exists → they're active. Simplest signal. |
| Name fallback | `email.split('@')[0]` → `'User'` | First name only, empty string | Graceful degradation for edge cases without email gate |
| Rate limiter scope | Webhook excluded — registered before `appointmentRateLimit` | Apply separate limiter | Clerk controls retry; rate limiting webhooks could cause data loss |

## Data Flow

```
Clerk ──POST /api/v1/webhooks/clerk──→ express.raw() (Buffer)
                                          │
                                   Extract svix-* headers
                                   Map → webhook-* headers
                                          │
                                   Webhook.verify(rawBody, headers)
                                          │
                              ┌──success──┴──failure──┐
                              ▼                       ▼
                       JSON.parse              throw BadRequestError(400)
                              │
                     switch(event.type)           Unknown → 200 OK
                    ┌──────┼──────┐
                    ▼      ▼      ▼
                created updated deleted
                    │      │      │
              userSyncService──→ Prisma ──→ DB
                    │
              200 {success:true}
```

## Middleware Order (index.ts)

```typescript
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { appointmentRateLimit } from './middleware/rateLimit.js';
import appointmentRoutes from './routes/appointments.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', credentials: true }));

// Webhook route — MUST be before express.json() for raw body capture
app.use('/api/v1/webhooks', webhookRoutes);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/v1/ping', (_req, res) => {
  res.json({ success: true, data: { message: 'pong' } });
});
app.use('/api/v1/appointments', appointmentRateLimit, appointmentRoutes);
app.use(errorHandler);
```

## Header Mapping (Webhook Handler)

`standardwebhooks` lowercases all header keys then looks for `webhook-id`, `webhook-timestamp`, `webhook-signature`. Clerk sends `svix-id`, `svix-timestamp`, `svix-signature`. Map in handler:

```typescript
const headers = {
  'webhook-id': req.headers['svix-id'] as string,
  'webhook-timestamp': req.headers['svix-timestamp'] as string,
  'webhook-signature': req.headers['svix-signature'] as string,
};
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/package.json` | Modify | Add `"standardwebhooks": "^1.0.0"` to dependencies |
| `apps/api/src/index.ts` | Modify | Register webhook route with `express.raw()` before `express.json()` |
| `apps/api/src/routes/webhooks.ts` | Create | Route: `POST /clerk` with raw body middleware, header extraction, verification, event dispatch |
| `apps/api/src/services/userSyncService.ts` | Create | `handleUserCreated`, `handleUserUpdated`, `handleUserDeleted` with idempotency + email/name extraction |
| `apps/api/tests/integration/webhook.test.ts` | Create | 11 tests: 5 success cases, 2 error cases, 1 edge case, 1 existing-route regression |
| `apps/api/.env.example` | Modify | Add `CLERK_WEBHOOK_SECRET` placeholder |
| `docs/SECURITY.md` | Modify | Line 142: mark webhook as RESOLVED |
| `docs/SECURITY_MODEL.md` | Modify | Update webhook section with actual endpoint + implementation |
| `docs/AI_HANDOFF.md` | Modify | Update pseudo-code reference |

## Interfaces / Contracts

### ClerkWebhookEvent (in userSyncService.ts)
```typescript
interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: Array<{ id: string; email_address: string }>;
    primary_email_address_id?: string | null;
  };
}
```

### User Sync Functions
```typescript
handleUserCreated(event: ClerkWebhookEvent): Promise<User>
handleUserUpdated(event: ClerkWebhookEvent): Promise<User>
handleUserDeleted(event: ClerkWebhookEvent): Promise<User>
```

### Webhook Route
```
POST /api/v1/webhooks/clerk
  No auth middleware
  Body: raw Buffer (express.raw)
  → 200 { success: true } on any processed event
  → 400 { success: false, error: { code: "BAD_REQUEST", message: "..." } } on failure
```

## Error Handling

| Condition | HTTP | Code | Message |
|-----------|------|------|---------|
| Valid event | 200 | — | `{ success: true }` |
| Unknown event type | 200 | — | `{ success: true }` |
| Missing svix headers | 400 | BAD_REQUEST | "Missing required webhook signature headers" |
| Invalid signature | 400 | BAD_REQUEST | "Invalid webhook signature" |
| Email missing | 400 | BAD_REQUEST | "User email is required" |

`standardwebhooks.WebhookVerificationError` messages (timestamp too old/new, missing headers) are caught and re-thrown as `BadRequestError`.

## Testing Strategy

11 tests in `apps/api/tests/integration/webhook.test.ts` using `standardwebhooks.Webhook` to sign test payloads with test secret `whsec_test_mock_key_for_testing_only`:

| # | Test | Expected |
|---|------|----------|
| 1 | Valid `user.created` | 200, user in DB with role=CLIENT |
| 2 | Duplicate `user.created` | 200, idempotent (P2002 catch) |
| 3 | Soft-deleted user + `user.created` | 200, deletedAt cleared |
| 4 | `user.updated` on existing user | 200, name/email updated |
| 5 | `user.updated` on non-existent user | 200, user created (upsert) |
| 6 | `user.deleted` on existing user | 200, deletedAt set |
| 7 | `user.deleted` on non-existent user | 200, no-op |
| 8 | Unknown event type | 200 |
| 9 | Invalid signature | 400 |
| 10 | Missing `svix-id` header | 400 |
| 11 | Existing `POST /api/v1/appointments` with JSON body | 201, `express.json()` still works |

Test setup: set `CLERK_WEBHOOK_SECRET` before import via `tests/setup.ts` env or inline `process.env` before `import { app }`.

## Risk Gate Check

| Gate | Status | Detail |
|------|--------|--------|
| Raw body restructures index.ts? | ❌ No | Simple reorder: webhook route before `express.json()`, no structural change |
| Email missing in payload? | ✅ Handled | `extractEmail` throws `BadRequestError` if no email_addresses |
| `standardwebhooks` API issue? | ✅ Verified | CJS-in-ESM works; header mapping documented; sign/verify confirmed from source |
| Auth mishandles deleted users? | ✅ No change | `auth.ts:74-79` rejects null user + deletedAt users — correct behavior preserved |
| Forecast > 400 lines? | ❌ No | ~310 lines: services(60) + routes(55) + index.ts(8) + tests(160) + docs(25) |

## Migration / Rollout

No migration required. Rollback: revert commit (remove 2 new files, revert 4 modified files, remove 1 dependency).

## Open Questions

None — all design decisions resolved.
