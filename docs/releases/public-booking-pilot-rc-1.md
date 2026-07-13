# Public Booking Pilot RC 1

**Date**: 2026-07-13
**Status**: Audited release candidate ready for local-`main` fast-forward after documentation prep; push/tag/deploy remain blocked on Samsung Galaxy S21 Chrome QA
**Audited candidate code HEAD**: `900274909f4b96ba3a3b7faf70d454b3ace2e94b` — `test(release): verify public booking production parity`
**Branch**: `fix/public-booking-production-parity`
**Base release**: `origin/main` at `8385ae4da31db3524b5c76347d0f8f4078fea79f` — `fix(appointments): use server-side date scoped listing`
**Cumulative audited range**: `8385ae4da31db3524b5c76347d0f8f4078fea79f..900274909f4b96ba3a3b7faf70d454b3ace2e94b`

---

## Quick status

- The public-booking stack from `origin/main...fix/public-booking-production-parity` is **17 commits**, strictly linear, and merge-free.
- The audited slice remains clean on disk: `git diff --check origin/main...HEAD` passed and the working tree was clean before this release-prep documentation step.
- Prisma public-booking migrations deploy cleanly from a fresh isolated PostgreSQL database on `5433`.
- Anonymous public traffic remains limited to `apps/api/src/app.ts` route namespace `/api/v1/public`.
- Production-mode parity passed with independently built artifacts via `npm run qa:public-booking` and its nested `npm run qa:public-booking:production`.
- Physical Samsung Galaxy S21 Chrome QA is still pending and must happen before any push, tag, or deployment.

## Release identity

| Field | Value |
|---|---|
| Product milestone | `Public Booking Pilot RC 1` |
| Audited candidate code commit | `900274909f4b96ba3a3b7faf70d454b3ace2e94b` |
| Candidate branch | `fix/public-booking-production-parity` |
| Base release ref | `origin/main` @ `8385ae4da31db3524b5c76347d0f8f4078fea79f` |
| Local `main` before integration | `8edea901205ec69613bae923ac00d385bcf4fdcd` |
| Audited cumulative commit range | `origin/main..900274909f4b96ba3a3b7faf70d454b3ace2e94b` |
| Audited commit count | `17` |
| Release-prep evidence docs | `docs/releases/public-booking-pilot-rc-1.md`, `docs/manual-tests/public-booking-physical-qa.md` |

## Delivered scope

- Public shop slug foundations in `apps/api/prisma/schema.prisma` and `apps/api/src/lib/publicSlug.ts`
- Controlled pilot provisioning through `apps/api/src/scripts/publicSlug.ts`
- Anonymous public catalogue routes in `apps/api/src/routes/publicCatalog.ts`
- Eligible barber listing scoped by slug + service in `apps/api/src/services/publicCatalogService.ts`
- Date-specific schedule exceptions in `apps/api/prisma/migrations/20260713130000_add_barbershop_schedule_exceptions/migration.sql`
- Public availability with notice/horizon/schedule enforcement in `apps/api/src/services/publicAvailabilityService.ts`
- Guest appointment creation in `apps/api/src/services/publicBookingService.ts`
- Explicit consent capture via `publicConsentAcceptedAt` / `publicConsentVersion`
- Durable idempotency in `PublicBookingIdempotency` plus `apps/api/src/lib/publicBookingIdempotency.ts`
- Separate public catalogue / availability / write rate limits in `apps/api/src/middleware/publicRateLimit.ts`
- Next.js public website at `apps/public-web`
- Mobile-first responsive booking flow in `apps/public-web/components/PublicBookingFlow.tsx`
- Confirmation page with session-storage-only recovery boundary in `apps/public-web/app/barberias/[slug]/confirmacion/page.tsx`
- Playwright E2E browser coverage in `apps/public-web/e2e/publicBooking.spec.ts`
- Production-parity gate in `scripts/qaPublicBookingProduction.mjs`
- Mobile terminology update (`Appointments` → `Agenda`) in `apps/mobile/src/i18n/locales/es.ts`

## Deferred scope

- Customer accounts
- Customer self lookup
- Customer cancellation
- Customer rescheduling
- Notifications
- Payments
- “Any barber” selection
- Multi-location support
- Self-service shop onboarding
- Shared/distributed rate-limit storage
- Production monitoring / observability rollout
- Broader commercial rollout beyond one controlled pilot shop/location

## Validation evidence from this batch

| Check | Command / source | Result |
|---|---|---|
| API unit | `npm run qa:public-booking` | ✅ `15 files / 79 tests` |
| API integration | `npm run qa:public-booking` | ✅ `14 files / 416 tests` |
| API database | `npm run qa:public-booking` | ✅ `7 files / 67 tests` |
| Public-web unit/component | `npm run qa:public-booking` | ✅ `4 files / 12 tests` |
| Playwright E2E | `apps/public-web/e2e/publicBooking.spec.ts` via `npm run qa:public-booking` | ✅ `8 passed` |
| Public-web production build | `next build` via `npm run qa:public-booking:production` | ✅ passed |
| Shared validation | `npm run qa:public-booking` | ✅ typecheck passed; `1 file / 2 tests` |
| Mobile validation | `npm run qa:public-booking` | ✅ typecheck passed; lint passed; `42 files / 597 tests` |
| Full release gate | `npm run qa:public-booking` | ✅ passed |
| Production-parity smoke | nested `npm run qa:public-booking:production` from the release gate | ✅ passed; logs under `apps/public-web/test-results/public-booking-production-parity/` |

### Production-parity proof

The production smoke in `scripts/qaPublicBookingProduction.mjs` successfully:

1. reused the isolated PostgreSQL database on `5433`,
2. applied test migrations with `npm run db:migrate:test --workspace @barberapp/api`,
3. provisioned a deterministic fixture through `apps/api/tests/support/publicBookingE2eFixture.cli.ts`,
4. built `@barberapp/api` and `@barberapp/public-web`,
5. started the compiled API on `3000`,
6. started `next start` on `3001`,
7. loaded the Next BFF route and `/barberias/<slug>`,
8. cleaned the fixture after completion.

## Migration and security evidence

- Schema files inspected: `apps/api/prisma/schema.prisma`, `apps/api/prisma/test.schema.prisma`
- Public-booking migrations inspected:
  - `apps/api/prisma/migrations/20260713121500_add_barbershop_public_slug_foundations/migration.sql`
  - `apps/api/prisma/migrations/20260713130000_add_barbershop_schedule_exceptions/migration.sql`
  - `apps/api/prisma/migrations/20260713170000_add_public_booking_write_foundations/migration.sql`
- Clean-state deploy proved on isolated DB with:
  - `DATABASE_URL='postgresql://postgres:postgres@localhost:5433/barberapp_migrate_audit' npm run db:migrate:deploy --workspace @barberapp/api`
- Public route boundary verified in `apps/api/src/app.ts`
- Tenant resolution verified by slug-only lookups in:
  - `apps/api/src/services/publicCatalogService.ts`
  - `apps/api/src/services/publicAvailabilityService.ts`
  - `apps/api/src/services/publicBookingService.ts`
- Public confirmation privacy boundary verified in:
  - `apps/public-web/lib/bookingConfirmationStorage.ts`
  - `apps/public-web/app/barberias/[slug]/confirmacion/page.tsx`

## Known pilot limitations

1. One controlled pilot shop/location at a time.
2. Shop publish/unpublish and schedule-exception provisioning remain manual/operator-driven.
3. Public rate limits use the in-memory pilot implementation from `apps/api/src/middleware/publicRateLimit.ts`.
4. Confirmation recovery is browser-session scoped; there is no public reference lookup route.
5. No automated notifications.
6. No public booking management (no self-service cancel/reschedule).
7. Production deployment has not happened yet.
8. Physical Samsung Galaxy S21 Chrome QA is still pending.

## Release blocker policy

This candidate must **not** be pushed, tagged, or deployed until all four conditions are true:

1. Local integration to `main` passes with `git merge --ff-only`.
2. Samsung Galaxy S21 Chrome QA passes using `docs/manual-tests/public-booking-physical-qa.md`.
3. Final Git state is reviewed on local `main`.
4. Mateo explicitly approves the pilot deployment.

## Release decision

Current evidence supports this classification:

> **Public Booking Pilot Release Candidate — pending physical Android QA and deployment**

That means the audited code is acceptable for a single controlled pilot release path, but **not** for push/tag/deploy yet.

## Related operational docs

- Pilot release runbook: `docs/releases/public-booking-pilot-runbook.md`
- Physical QA checklist: `docs/manual-tests/public-booking-physical-qa.md`
- API production runbook: `docs/releases/api-production-runbook.md`
- Security context: `docs/SECURITY.md`, `docs/SECURITY_MODEL.md`
