# Public Booking Pilot RC 1

**Date**: 2026-07-13
**Status**: MVP 1.1.0 published from the physical-QA release commit; deployment still pending
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
- Physical Samsung Galaxy S21 QA passed on Brave for Android (Chromium-based); `mvp-1.1.0` is now published on the physical-QA release commit and deployment remains pending.

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
| Published release tag | `mvp-1.1.0` |
| Published tag object | `48525c4e099ac7cafd21dfdc386e1d2ffd6a8045` |
| Published tag target | `49f69c4e323eab5f2226458979e7d2046ec208fa` |
| Physical-QA release commit on `main` | `49f69c4e323eab5f2226458979e7d2046ec208fa` |
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

## Physical Android QA evidence

Recorded manual physical result from `docs/manual-tests/public-booking-physical-qa.md`:

| Field | Value |
|---|---|
| Device | Samsung Galaxy S21 |
| Browser | Brave on Android |
| Browser class | Chromium-based |
| Overall result | `PASS` |
| Shop | `E2E Booking Shop F16DE1C2F8` |
| Service | `Servicio E2E F16DE1C2F8` |
| Barber | `Barbero E2E F16DE1C2F8` |
| Date/time | `14 de julio de 2026 a las 09:00` |
| Phone | `+5493816167701` |
| Public reference | `pb_XM3IT22J6Z3I6Y64` |
| Confirmation status shown | `CONFIRMED` |

Important:

- This release records **Brave on Android** as the captured browser evidence.
- A Chrome-specific rerun is **not** required for this controlled pilot unless a future browser-specific defect appears.

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
8. `mvp-1.1.0` publication is complete, but deployment is still pending.

## Nonblocking post-release UX follow-ups

1. `POST-RELEASE UX IMPROVEMENT — HIGH PRIORITY, NONBLOCKING FOR CONTROLLED PILOT`
   - Argentine phone-entry UX should accept familiar local formats such as `3816167701`, `381 6167701`, and `0381 15 6167701`, then normalize safely to canonical E.164 storage.
2. `POST-RELEASE COPY IMPROVEMENT — NONBLOCKING`
   - The customer-facing confirmation should later display `Confirmado` while the domain/API enum remains `CONFIRMED`.

## Release blocker policy

Publication gate that was satisfied before creating `mvp-1.1.0` on `49f69c4e323eab5f2226458979e7d2046ec208fa`:

1. Local integration to `main` passes with `git merge --ff-only`.
2. Samsung Galaxy S21 Brave-for-Android QA is recorded as passed in `docs/manual-tests/public-booking-physical-qa.md`.
3. Final Git state is reviewed on local `main`.
4. Mateo explicitly approves the pilot deployment.

## Release decision

Current evidence supports this classification:

> **Public Booking Pilot MVP 1.1.0 published; deployment pending**

That means the physical-QA release commit is now tagged and published as `mvp-1.1.0`, while all deployment work remains explicitly outstanding.

## Related operational docs

- Pilot release runbook: `docs/releases/public-booking-pilot-runbook.md`
- Physical QA checklist: `docs/manual-tests/public-booking-physical-qa.md`
- API production runbook: `docs/releases/api-production-runbook.md`
- Security context: `docs/SECURITY.md`, `docs/SECURITY_MODEL.md`
