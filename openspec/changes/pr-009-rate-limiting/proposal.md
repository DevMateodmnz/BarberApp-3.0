# Proposal: Rate Limiting on Appointment Routes

## Intent

`express-rate-limit` v7.5.1 is installed but unused. All 6 appointment endpoints under `/api/v1/appointments` are unprotected against brute-force or DoS, documented as an open gap at `docs/SECURITY.md:138`. Add router-level rate limiting with configurable defaults, deterministic test support, and JSON error responses matching the existing error format.

## Scope

### In Scope
- New `apps/api/src/middleware/rateLimit.ts` — configures an `express-rate-limit` instance
- Apply limiter specifically to the `/api/v1/appointments` router in `apps/api/src/index.ts:27`
- Env-var configuration: `RATE_LIMIT_ENABLED` (default: true except in `NODE_ENV=test`), `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- Custom JSON 429 handler: `{ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } }`
- Default max: 100 requests per 15-minute window in non-test; disabled by default in test env for existing test stability
- Explicit test configuration for deterministic 429 proof: enable with `max=3`, send 4 requests, assert Nth returns 429
- Document `app.set('trust proxy', 1)` as deployment-sensitive config (explain why without blindly applying)
- Update `docs/SECURITY.md:138` and `docs/SECURITY_MODEL.md` to mark resolved

### Out of Scope
- Shared store for horizontal scaling (Redis, etc.) — documented as known limitation
- Per-IP or per-user granular limits
- Rate limiting on `/health` or `/api/v1/ping` — both defined directly on `app` (lines 17, 22), not on the appointment router (line 27)
- Global API limiter — only appointment routes in this PR
- CAPTCHA, auth redesign, Clerk webhook, business hours

## Capabilities

### New Capabilities
- `api-rate-limiting`: router-level rate limiting on `/api/v1/appointments` with configurable window/max, standard draft-8 headers, explicit enable/disable flag for test determinism, and project-consistent JSON 429 responses

### Modified Capabilities
- None — no existing specs cover rate limiting

## Approach

### Configuration Strategy (REFINED)

Instead of globally disabling via `skip: NODE_ENV === 'test'`, use an explicit `RATE_LIMIT_ENABLED` env var:

| Environment | `RATE_LIMIT_ENABLED` | Window | Max | Behavior |
|------------|---------------------|--------|-----|----------|
| Production | `true` (default) | 15 min | 100 | Active — protects endpoints |
| Dev | `true` (default) | 15 min | 100 | Active — simulates production |
| Test (existing 73 tests) | `false` (default) | N/A | N/A | Disabled — no flaky interference |
| Test (rate-limit specific) | `true` (explicit) | 60 sec | 3 | Enabled — deterministic 429 proof |

**Why not `skip: NODE_ENV === 'test'`**: That makes rate limiting globally untestable. The explicit flag lets us disable for normal test runs (73 existing tests stay stable) while enabling it specifically for rate-limit tests with a small config (e.g., window=60s, max=3 → 4th request returns 429).

The `RATE_LIMIT_ENABLED` check goes in the exported factory function or as a conditional middleware: if disabled, return a pass-through `(req, res, next) => next()` no-op.

### Test Plan (REFINED)

New file: `apps/api/tests/integration/rateLimit.test.ts` (or add to security.test.ts)

**Deterministic approach**: Create a fresh Express app instance with rate limiting enabled at `max=3, windowMs=60000`. Make 4 consecutive requests to an appointment endpoint. The first 3 return 200/401 (expected auth behavior before rate limit kicks in). The 4th returns 429.

Or more precisely: apply the limiter to a test-only route that always returns 200. Make 4 requests:
1. Request 1 → 200 ✅
2. Request 2 → 200 ✅
3. Request 3 → 200 ✅
4. Request 4 → 429 ❌ `{ code: 'RATE_LIMITED' }`

Also verify:
- `/health` returns 200 even with rate limiter active (different route mount)
- Response body contains stable error structure matching project conventions
- No flaky timing — `max=3` with in-memory store is instant and deterministic

**Existing tests**: All 73 tests continue to pass because `RATE_LIMIT_ENABLED` defaults to `false` when `NODE_ENV=test` in `tests/setup.ts`.

### trust proxy

`express-rate-limit` uses `req.ip` to identify clients. Behind a reverse proxy (nginx, AWS ALB, etc.), `req.ip` shows the proxy's IP unless `trust proxy` is set. However:

- BarberApp-3.0 currently has **no known production deployment** behind a proxy
- Setting `trust proxy` blindly could change IP resolution behavior unexpectedly

**Decision**: Add a **commented-out line** in `index.ts` with documentation:
```typescript
// Trust proxy for correct client IP detection behind reverse proxy (nginx, ALB, etc.)
// Uncomment and configure when deploying behind a proxy:
//   app.set('trust proxy', 1); // trust first proxy
//   app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']); // trust known networks
```

This avoids inadvertently changing behavior while providing clear deployment guidance. The `express-rate-limit` docs explicitly recommend trust proxy configuration, and we document that here.

### MemoryStore Limitation

Document in `docs/SECURITY.md`: MemoryStore is acceptable for single-instance MVP/development. For production horizontal scaling, replace with a shared store (Redis via `rate-limit-redis`, PostgreSQL via `rate-limit-postgres`, etc.). No external store is added in this PR.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/middleware/rateLimit.ts` | New | ~40 lines — limiter factory with enable flag, env-var resolution, custom handler |
| `apps/api/src/index.ts` | Modified | +4 lines — import + apply limiter to appointment router + trust proxy comment |
| `apps/api/tests/integration/rateLimit.test.ts` | New | ~40 lines — deterministic 429 proof + health exclusion test |
| `apps/api/tests/setup.ts` | Modified | +1 line — `RATE_LIMIT_ENABLED=false` default for test env |
| `apps/api/.env.test.example` | Modified | +2 lines — document rate limit env vars |
| `docs/SECURITY.md` | Modified | ~5 lines — line 138 RESOLVED + MemoryStore limitation |
| `docs/SECURITY_MODEL.md` | Modified | ~3 lines — mark rate limiting as active |

**Total**: ~95 lines

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MemoryStore not suitable for multi-instance | Med | Documented as known limitation; acceptable for single-instance MVP |
| New test uses real Express app — may interfere with other tests | Low | Uses isolated app instance, not the shared singleton; `fileParallelism: false` ensures no concurrent test contamination |
| `RATE_LIMIT_ENABLED=false` forgotten in production | Low | Default is `true` in non-test envs; only test env defaults to `false` |

## Rollback Plan

Revert the commit: remove `rateLimit.ts`, remove the limiter from `index.ts`, remove test file, restore `SECURITY.md:138` and `SECURITY_MODEL.md`. No migration, no schema change, no data cleanup.

## Dependencies

- `express-rate-limit` v7.5.1 (already installed)
- No other PRs blocked or blocking

## Success Criteria

- [ ] `/health` returns 200 — no rate limiting (different route mount)
- [ ] `/api/v1/appointments/*` routes include `RateLimit-*` response headers when enabled
- [ ] Rate limit test: 4th request returns 429 with `{ code: 'RATE_LIMITED' }` JSON
- [ ] Existing 73 tests pass (rate limiting disabled by default in test env)
- [ ] Rate limiting explicitly disabled in test env via `RATE_LIMIT_ENABLED=false` in `setup.ts`
- [ ] `npm run lint`, `build`, `test` green
- [ ] `docs/SECURITY.md:138` updated with MemoryStore limitation documented
- [ ] No trust proxy behavior changed unconsciously
