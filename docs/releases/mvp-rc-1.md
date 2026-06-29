# BarberApp MVP — Release Candidate 1

**Date**: 2026-06-16
**Status**: Historical RC-1 baseline document — current `main` has now passed full Samsung Galaxy S21 / Expo Go MVP physical QA and is ready for a controlled demo or pilot
**Historical RC-1 HEAD**: `7903cb5 feat(mobile): polish auth and root loading surfaces`
**Current relevant release-hygiene commits**: `021e57a fix(onboarding): allow existing staff bootstrap`, `c80cef4 docs(qa): record full physical MVP pass`
**Branch**: `main`

---

## Current MVP release state (2026-06-29)

The current merged `main` branch has completed the broader MVP release-readiness cycle since the original RC-1 baseline:

- Full Samsung Galaxy S21 / Expo Go physical MVP QA: **PASS**
- Full API suite: **443/443 PASS**
- Full Mobile suite: **593/593 PASS**
- Release-critical onboarding blocker fixed in `021e57a fix(onboarding): allow existing staff bootstrap`
- Final physical QA evidence recorded in `c80cef4 docs(qa): record full physical MVP pass`
- Current recommendation: **ready for controlled demo or pilot**

Primary physical QA evidence lives in [`docs/manual-tests/mobile-mvp-release-readiness.md`](../manual-tests/mobile-mvp-release-readiness.md).

## Current Validation Baseline

| Check | Result | Details |
|-------|--------|---------|
| Mobile TypeScript | ✅ clean | Current redesign baseline |
| Mobile ESLint | ✅ clean | Current redesign baseline |
| Mobile tests | ✅ 460/460 | Current redesign baseline |
| Backend tests | ✅ 356/356 | Last known good functional baseline; redesign work was mobile-only |
| API TypeScript | ✅ clean | Last known good functional baseline; redesign work was mobile-only |

> Historical note: this table captures the original RC-1 baseline from 2026-06-16. The later Samsung Galaxy S21 / Expo Go physical pass has now been completed and recorded in the release-readiness checklist.

## 2026-06-26 staff appointment-creation acceptance update

Staff appointment creation is now **accepted for the MVP**.

### Acceptance summary

| Topic | Decision |
|-------|----------|
| Manual result | Mateo manually reviewed the OWNER and BARBER creation workflows on Android and accepted the implementation for the MVP |
| Visual issues | Minor placement/layout imperfections remain, but they were explicitly accepted as **non-blocking UI debt** |
| Functional fixes | No functional source fix was required during Batch 4 |
| Automated baseline | API **422/422**, Mobile **567/567**, both clean at acceptance time |

### Accepted feature commits

- `c2b50aa feat(api): add staff appointment booking and availability`
- `772065e feat(mobile): add appointment creation domain layer`
- `eb0ed1d feat(mobile): add staff appointment creation flow`

## 2026-06-27 employee invitation onboarding acceptance update

Employee invitation onboarding is now **accepted for merge review / MVP continuation**.

### Acceptance summary

| Topic | Decision |
|-------|----------|
| Manual / live result | Automated validation plus live Clerk/provider/API reconciliation validated the feature for merge review |
| Functional fixes | No functional source fix was required during Batch 4 |
| Feature-branch state at acceptance | Clean `feat/employee-invitation-onboarding` at `7feb09b` with no Batch 4 code commit required |
| Automated baseline | API **441/441**, Mobile **593/593**, both clean at acceptance time |

### Validated behavior

- Local invitation lifecycle exists
- OWNER can create a pending invitation by email
- Duplicate pending invite is idempotent
- Resend preserves the local row and rotates the provider invitation
- Revoke marks the local row revoked and does not create a user/employee
- Accepted invitee reconciliation creates the local BARBER user/employee
- Reconciliation runs before `/me/context`
- Repeated reconciliation is idempotent
- OWNER refresh shows the accepted invitation
- Existing BARBER/OWNER flows remained covered by automated validation

### Acceptance limitations

- Literal inbox receipt was not directly verified from the CLI environment
- The Clerk/browser acceptance page HTML and provider acceptance URL were validated, but not a full manually-driven browser UI flow
- First invitee sign-in was validated through a real Clerk invitee account/session and local reconciliation, not a full physical mobile tap-through
- Live webhook-specific verification remained limited because local `CLERK_WEBHOOK_SECRET` was missing
- At acceptance time, a physical Samsung Galaxy S21 follow-up still remained recommended; that later follow-up has now passed in the merged-`main` release-readiness run

### Accepted feature commits

- `6c8e9e5 feat(api): add employee invitation onboarding`
- `56bb6de feat(mobile): add employee invitation domain layer`
- `7feb09b feat(mobile): add employee invitation UI`

## Operational Release Notes

- Production API startup and credentialed CORS now have a dedicated runbook: [`docs/releases/api-production-runbook.md`](./api-production-runbook.md)
- Railway publication/deployment steps now have a target-specific runbook: [`docs/releases/railway-mvp-deployment.md`](./railway-mvp-deployment.md)
- Mobile preview/production distribution now has a dedicated EAS runbook: [`docs/releases/mobile-eas-release.md`](./mobile-eas-release.md)
- Production releases should use `prisma migrate deploy` and must not rely on local QA bootstrap or demo seed workflows.

---

## Mobile Visual Redesign Status

### ✅ Implemented in code

| Area | Status | Source commit |
|------|--------|---------------|
| Design tokens + reusable UI primitives | ✅ complete | `191f360` |
| Home dashboard | ✅ complete | `191f360` |
| Record Service | ✅ complete | `191f360` |
| Services | ✅ complete | `191f360` |
| Appointments | ✅ complete | `af10285` |
| Employees | ✅ complete | `63ff57c` |
| Working Hours | ✅ complete | `fa36f60` |
| Auth/root loading surfaces | ✅ complete | `7903cb5` |

### ✅ Device QA status

The redesign/device checks that were still open at the original RC-1 baseline were later completed in the merged-`main` release-readiness pass on Samsung Galaxy S21 / Expo Go.

Detailed evidence: [`docs/manual-tests/mobile-mvp-release-readiness.md`](../manual-tests/mobile-mvp-release-readiness.md)

---

## Functional Scope — Frozen for MVP

### ✅ Included & Validated (Functional scope)

| Feature | Role | Status |
|---------|------|--------|
| Clerk OTP sign-in | OWNER, BARBER | ✅ Functionally validated |
| `/me/context` resolution | OWNER, BARBER | ✅ Functionally validated |
| Home dashboard | OWNER, BARBER | ✅ Functionally validated + visually redesigned |
| Services CRUD (create, edit, deactivate, reactivate, search, filter) | OWNER | ✅ Functionally validated + visually redesigned |
| Employees — add, view, manage service assignments | OWNER | ✅ Functionally validated + visually redesigned |
| Employees — invite new BARBER by email, manage pending/resend/revoke, reconcile accepted invitee into local BARBER context | OWNER, invited BARBER | ✅ Functionally validated; live provider/API reconciliation accepted for merge review |
| Working Hours — view week schedule, edit day hours, toggle on/off, persist | OWNER | ✅ Functionally validated + visually redesigned |
| Appointments — view by date, filter by employee, status transitions (confirm, start, complete, cancel) | OWNER | ✅ Functionally validated + visually redesigned |
| Appointments — view own appointments, status transitions | BARBER | ✅ Functionally validated + visually redesigned |
| Appointments — create guest appointments from mobile with availability-driven slot selection | OWNER, BARBER | ✅ Functionally validated; Android-reviewed and accepted for MVP |
| Service Record creation — select employee, service, payment, client name | OWNER | ✅ Functionally validated + visually redesigned |
| Service Record creation — own assigned services, price override | BARBER | ✅ Functionally validated + visually redesigned |
| Home summary (total records, revenue, employee breakdown) | OWNER | ✅ Functionally validated + visually redesigned |
| Cross-user data isolation (BARBER sees own data, OWNER sees all) | OWNER, BARBER | ✅ Functionally validated |
| Pull-to-refresh, back navigation, sign-out | OWNER, BARBER | ✅ Functionally validated |

### 🚫 Explicitly Deferred (Post-MVP)

| Feature | Reason |
|---------|--------|
| **CLIENT role** | Out of scope for functional MVP. No client sign-in, no client dashboard, no client booking. |
| Calendar/timeline view for appointments | UI enhancement post-MVP. |
| Push notifications | Requires Expo push service integration. |
| Offline queue / sync | Infrastructure complexity. |
| Photo upload / gallery | Deferred until CLIENT phase. |

---

## Historical Functional Physical QA Evidence

- **Date executed**: 2026-06-15
- **Device**: Physical Android phone with Expo Go
- **Owner Clerk user**: real OWNER QA account (masked in local-only bootstrap config)
- **Barber Clerk user**: real BARBER QA account (masked in local-only bootstrap config)
- **Barbershop**: local QA barbershop context validated
- **DB barber record**: active BARBER employee mapping validated
- **Result**: All OWNER and BARBER functional phases passed. No P0/P1 blockers found for the pre-redesign baseline.

> Important: this evidence predates the final redesign commits. It is valid functional evidence, but it is **not** redesign-specific visual/device sign-off.

Current redesign checklist: [`docs/manual-tests/mobile-mvp-final-qa.md`](../manual-tests/mobile-mvp-final-qa.md)

---

## Known Limitations

1. **Direct live Clerk webhook proof may still be environment-limited locally**: `CLERK_WEBHOOK_SECRET` is still required to reproduce webhook-specific evidence end-to-end on a local machine.
2. **CLIENT remains deferred/post-MVP**: The redesign did not expand CLIENT functionality or booking UX.
3. **Broader tab/header normalization is deferred**: PR-UI-008 intentionally stayed low risk and did not rework all navigation presentation patterns.
4. **RN mock-renderer tests have limits**: Vitest + React 19 RN component tests help guard structure/behavior but are not a substitute for device-level layout/keyboard verification.
5. **Test DB requires port 5433**: Backend tests need a separate PostgreSQL instance on port 5433. The main DB runs on 5432 via Docker.
6. **Appointment-create layout polish remains deferred**: Minor placement/layout imperfections were observed during manual Android review, but they were explicitly accepted as non-blocking UI debt for the MVP.
7. **No date filtering on API**: `listAppointments` returns up to 100 records ordered by `startAt DESC` with no query parameters. Mobile filters client-side.
8. **Clerk Expo `getToken` instability**: Worked around with `getTokenRef` pattern across all screens. Upgrade to `@clerk/clerk-expo` v3+ may resolve natively.
9. **Invitation QA still has environment-limited webhook proof locally**: the accepted onboarding run and later physical QA proved the authoritative mobile reconciliation behavior, but direct webhook-specific evidence still depends on local secret configuration.
10. **Release docs should be read as layered history**: the original RC-1 acceptance notes remain useful context, while the final MVP release-readiness result is now captured by the 2026-06-29 physical QA evidence.

---

## Blocker Policy

Only **P0** (crash, sign-in failure, data loss, security bypass) or **P1** (core feature broken) bugs can reopen the frozen MVP scope.

| Level | Definition | Action |
|-------|-----------|--------|
| **P0** | App crashes, cannot sign in, data loss, security bypass | Must fix before MVP RC sign-off |
| **P1** | Core feature broken (can't record service, can't transition appointment, blank screen) | Must fix before MVP RC sign-off |
| **P2** | Cosmetic issue, missing label, edge case | Document, fix post-MVP |
| **P3** | Enhancement, optimization, nice-to-have | Post-MVP backlog |

---

## Post-Redesign / Post-MVP Backlog

1. Final visual QA fixes after device regression
2. Accessibility-label sweep
3. Tab/header consistency audit
4. CLIENT role — booking flow, client dashboard, photo gallery
5. Dark mode / further visual polish
6. Calendar/timeline UI for appointments
7. Push notifications via Expo push service
8. Offline support and sync queue
9. Performance optimization and bundle size reduction
10. E2E test suite (Detox or Maestro)

---

## Release Artifacts

| Artifact | Path |
|----------|------|
| MVP RC document | `docs/releases/mvp-rc-1.md` |
| Final QA runbook | `docs/manual-tests/mobile-mvp-final-qa.md` |
| UI/UX redesign status + QA handoff | `docs/design/ui-ux-redesign-prep.md` |
| QA setup guide | `docs/manual-tests/mobile-mvp-qa-setup.md` |
| QA strategy | `docs/QA_STRATEGY.md` |
| Architecture doc | `docs/ARCHITECTURE.md` |
| Product spec | `docs/PRODUCT_SPEC.md` |

---

## Sign-Off

**Functional MVP RC ready**: ✅ YES
**Visual redesign implemented in code**: ✅ YES
**Redesign device QA complete**: ✅ YES
**Scope frozen**: 2026-06-15
**Next phase**: controlled demo/pilot readiness, then post-MVP backlog triage
