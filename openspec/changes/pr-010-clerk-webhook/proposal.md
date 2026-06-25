# Proposal: Clerk Webhook / User Synchronization

## Intent

Zero webhook code exists — users blocked by `auth.ts:74-76` (401 for unknown Clerk users). No auto-provisioning. Users must be manually inserted into DB. PR-010 implements Clerk webhook receiver with Svix signature verification to sync `user.created`/`user.updated`/`user.deleted` events to the database. Prerequisite for going live.

## Scope

### In Scope
- `POST /api/v1/webhooks/clerk` — webhook endpoint with raw body capture
- Svix signature verification via `standardwebhooks.Webhook` class (transitive dep made explicit)
- `user.created` → upsert User (idempotent via P2002 catch)
- `user.updated` → update email, name
- `user.deleted` → set `deletedAt` (soft delete)
- Unrecognized event types → 200 OK to prevent Clerk retries
- 7 tests: valid create, idempotent duplicate, invalid/missing signature, unknown event, update, soft delete

### Out of Scope
- Auto-provisioning on Clerk login (auth middleware keeps current 401 behavior)
- BARBER/OWNER role assignment — all webhook users default to CLIENT (MVP manual step)
- Per-event type route splitting
- Dashboard or webhook UI

## Capabilities

### New Capabilities
- `clerk-webhook`: receive and verify Clerk webhook events, sync User records (create/update/soft-delete) with idempotency guarantees

### Modified Capabilities
- None — no existing specs cover webhooks

## Approach

**Signature verification**: Extract `svix-id`, `svix-timestamp`, `svix-signature` headers from request. Use `new Webhook(CLERK_WEBHOOK_SECRET).verify(rawBody, headers)`. Missing headers or failed verification → 400.

**Raw body**: Register webhook route with `express.raw({ type: 'application/json' })` BEFORE `express.json()` in `index.ts`. Parse JSON manually after verification passes.

**Idempotency**: `user.created` does `prisma.user.create()` wrapped in try/catch for P2002 (unique constraint on `clerkUserId`) → 200 OK. `user.updated` and `user.deleted` use `prisma.user.update({ where: { clerkUserId } })` — naturally idempotent.

**Roles**: All webhook-created users default to `CLIENT`. Document as MVP limitation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/package.json` | Modified | Add `standardwebhooks` as explicit dependency |
| `apps/api/src/index.ts` | Modified | Register webhook route with `express.raw()` before `express.json()` |
| `apps/api/src/routes/webhooks.ts` | New | Route handler (~40 lines), extracts headers, verifies, dispatches |
| `apps/api/src/services/userSyncService.ts` | New | Sync logic (~50 lines): create/update/delete with idempotency |
| `apps/api/tests/integration/webhook.test.ts` | New | 7 tests (~100 lines) using `standardwebhooks.Webhook` to sign payloads |
| `apps/api/.env.example` | Modified | Add `CLERK_WEBHOOK_SECRET` placeholder |
| `docs/SECURITY.md` | Modified | Mark webhook as RESOLVED (line 142) |
| `docs/SECURITY_MODEL.md` | Modified | Update webhook section with correct endpoint, mark checklist item done |

**Total**: ~250-280 lines

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Raw body parsing conflicts with `express.json()` | Low | Webhook route registered with `express.raw()` before global `express.json()` |
| `standardwebhooks` removed from Clerk transitive deps | Low | Added as explicit dependency in `package.json` |
| Clerk event payload shape changes | Low | Only extract documented fields; skip unrecognized |
| Webhook endpoint outside rate limiter scope | Low | Webhook sits before appointment rate limiter; document that this is intentional (Clerk controls retry) |

## Rollback Plan

Revert commit: remove `routes/webhooks.ts`, `services/userSyncService.ts`, `webhook.test.ts`, remove route registration + `express.raw()` from `index.ts`, remove `standardwebhooks` from `package.json`, revert SECURITY.md line 142 to "not implemented", revert SECURITY_MODEL.md webhook section. No migration, no data cleanup.

## Dependencies

- `standardwebhooks@1.0.0` (transitive via `@clerk/backend`, made explicit in `package.json`)
- `CLERK_WEBHOOK_SECRET` env var (placeholder in `.env.example`, test secret in test setup)
- No other PRs blocked or blocking

## Success Criteria

- [ ] Valid signed webhook creates User with `role=CLIENT`
- [ ] Duplicate `user.created` returns 200 (idempotent — one row exists)
- [ ] Invalid signature → 400
- [ ] Missing signature headers → 400
- [ ] `user.updated` updates email/name in DB
- [ ] `user.deleted` sets `deletedAt` timestamp
- [ ] Unrecognized event type → 200 (Clerk won't retry)
- [ ] Existing 75 tests pass (webhook route isolation — no interference)
- [ ] `npm run lint`, `build`, `test` green
- [ ] `docs/SECURITY.md:142` marked RESOLVED
- [ ] `docs/SECURITY_MODEL.md` webhook section updated with correct endpoint + checklist item checked
