# BarberApp v3.0 — Restart Plan

## Why Restart?

The existing BarberApp codebase has accumulated significant technical debt and architectural inconsistencies:

1. **Documentation Drift**: Architecture docs reference Supabase, but actual implementation uses Express + Prisma
2. **Incomplete Features**: Client booking (core feature) was never implemented
3. **No Mobile Tests**: Entire mobile app has zero test coverage
4. **No CI/CD**: No automated testing or deployment pipelines
5. **Security Gaps**: No rate limiting, no dedicated security tests
6. **Environment Inconsistencies**: Wrong env var prefixes (NEXT_PUBLIC_ instead of EXPO_PUBLIC_)
7. **Missing Foundation**: No pagination, incomplete role permissions

## What We're Rescuing from v2

### Architecture & Patterns ✅

| Item | Source | Notes |
|------|--------|-------|
| Prisma Schema Design | `apps/api/prisma/schema.prisma` | Multi-tenant hierarchy, soft deletes, proper indexes |
| API Validation Pattern | `apps/api/src/middleware/validate.ts` | Zod schemas with consistent error responses |
| Authorization Middleware | `apps/api/src/middleware/auth.ts` | Owner/Employee access control |
| Clerk Integration | `apps/api/src/routes/auth.ts` | Webhook sync pattern |
| Mobile State Management | `apps/mobile/src/stores/*.ts` | Zustand stores with async actions |
| API Client Pattern | `apps/mobile/src/services/api.ts` | Token-attached fetch wrapper |
| UI Components | `apps/mobile/src/components/ui/*.tsx` | Button, Input, Card with dark theme |
| Navigation Structure | `apps/mobile/src/navigation/*.tsx` | Role-based navigation (Owner/Barber) |
| Shared Types | `packages/shared/src/types/index.ts` | TypeScript types for API contracts |

### Documentation Reference ✅

| Document | Use |
|----------|-----|
| SECURITY.md | Security model foundation |
| docker-compose.yml | PostgreSQL + infrastructure setup |

## What We're Discarding

| Item | Reason |
|------|--------|
| ARCHITECTURE.md | Documents Supabase stack that no longer exists |
| API_REFERENCE.md | Documents service layer for non-existent Supabase backend |
| PROJECT_STATUS.md | Stale session notes referencing obsolete patterns |
| Root `src/` directory | Legacy code, doesn't exist in v2 |
| `frontend/` and `backend/` dirs | Deprecated legacy directories |

## Clean Start Principles

1. **No Blind Copying**: Every pattern from v2 will be re-evaluated, not migrated
2. **Test-First**: Tests are written BEFORE implementation
3. **Single Source of Truth**: Documentation and code must agree at all times
4. **Incremental Validation**: Each phase ends with passing tests and QA report
5. **No Assumptions**: Security, multi-tenancy, and role permissions are tested, not assumed

## Phase Roadmap

| Phase | Focus | Deliverable |
|-------|-------|-------------|
| 0 + 1 | Foundation | Clean repo, docs, test infra |
| 2 | Database & ORM | Prisma schema, migrations, seed data |
| 3 | API Foundation | Auth, CRUD, validation, tests |
| 4 | Business Logic | Appointments, double-booking prevention |
| 5 | Mobile Foundation | Navigation, auth screens, API client |
| 6 | Mobile Features | Booking flow, appointment management |
| 7 | Integration | E2E tests, final QA |

## File Inventory for v3.0

```
BarberApp-3.0/
├── apps/
│   ├── api/              # Express + Prisma REST API
│   └── mobile/           # Expo React Native app
├── packages/
│   └── shared/           # Shared TypeScript types
├── docs/
│   ├── RESTART_PLAN.md   # This file
│   ├── PRODUCT_SPEC.md   # Core product definition
│   ├── ARCHITECTURE.md   # Technical architecture
│   ├── SECURITY_MODEL.md # Security approach
│   ├── QA_STRATEGY.md   # Testing strategy
│   ├── ROADMAP.md       # Implementation phases
│   └── AI_HANDOFF.md    # Context for AI agents
├── package.json          # Root workspace
└── tsconfig.base.json    # Base TypeScript config
```

## Dependency Conflict Analysis (Phase 1 Correction)

### Conflict: React Native + React + Testing Library

**Root Cause**: The Expo SDK 54 stack uses React 19.1.0, but `@testing-library/react-native` transitively requires `react-test-renderer@19.2.6` which expects `react@^19.2.6`.

**Affected Packages**:
- `react-native@0.81.5` requires `react@^19.1.0`
- `react-test-renderer@19.2.6` (transitive via `@testing-library/react-native@12.4.0`) requires `react@^19.2.6`

**Resolution**: Used `--legacy-peer-deps` to install. This is acceptable because:
1. The old project (`/home/mateo/Documents/coding/barberapp/`) uses the same stack and works
2. The conflict is in dev dependencies (testing library), not production code
3. Phase 1 only has placeholder tests, real mobile tests come in Phase 6

**Risk Assessment**:
- **Production impact**: None (conflict is in dev/test dependencies)
- **Test impact**: Low (placeholder tests only in Phase 1)
- **Recommended fix**: In Phase 5/6, upgrade to testing libraries compatible with React 19.2+ or downgrade React to 18.x

**Alternative Considered**: Pinning older versions of testing libraries, but this would delay Phase 1 further.

## Next Steps

1. ✅ Create folder structure
2. ✅ Document this restart plan
3. ⬜ Create PRODUCT_SPEC.md
4. ⬜ Create ARCHITECTURE.md
5. ⬜ Create SECURITY_MODEL.md
6. ⬜ Create QA_STRATEGY.md
7. ⬜ Create ROADMAP.md
8. ⬜ Create AI_HANDOFF.md
9. ⬜ Initialize package.json with test tooling
10. ⬜ Create basic test infrastructure
11. ⬜ Run validation

## Reference: Old Project Location

```
/home/mateo/Documents/coding/barberapp/
```

This directory is preserved and must NOT be modified during v3.0 development.
