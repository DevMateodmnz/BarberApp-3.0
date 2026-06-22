# BarberApp MVP — Release Candidate 1

**Date**: 2026-06-16
**Status**: Release Candidate — Functional scope validated, visual redesign implemented, redesign device QA pending
**HEAD commit**: `7903cb5 feat(mobile): polish auth and root loading surfaces`
**Branch**: `main`

---

## Current Validation Baseline

| Check | Result | Details |
|-------|--------|---------|
| Mobile TypeScript | ✅ clean | Current redesign baseline |
| Mobile ESLint | ✅ clean | Current redesign baseline |
| Mobile tests | ✅ 460/460 | Current redesign baseline |
| Backend tests | ✅ 356/356 | Last known good functional baseline; redesign work was mobile-only |
| API TypeScript | ✅ clean | Last known good functional baseline; redesign work was mobile-only |

> Note: the mobile redesign has a fresh automated baseline. A redesign-specific physical-device regression pass still needs to be executed and recorded.

## Operational Release Notes

- Production API startup and credentialed CORS now have a dedicated runbook: [`docs/releases/api-production-runbook.md`](./api-production-runbook.md)
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

### ⏳ Still required before final redesign sign-off

- Physical-device OWNER regression pass
- Physical-device BARBER regression pass
- Auth/sign-in device verification
- Loading/error/empty-state device verification
- Keyboard/safe-area/scroll verification

Detailed checklist: [`docs/manual-tests/mobile-mvp-final-qa.md`](../manual-tests/mobile-mvp-final-qa.md)

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
| Working Hours — view week schedule, edit day hours, toggle on/off, persist | OWNER | ✅ Functionally validated + visually redesigned |
| Appointments — view by date, filter by employee, status transitions (confirm, start, complete, cancel) | OWNER | ✅ Functionally validated + visually redesigned |
| Appointments — view own appointments, status transitions | BARBER | ✅ Functionally validated + visually redesigned |
| Service Record creation — select employee, service, payment, client name | OWNER | ✅ Functionally validated + visually redesigned |
| Service Record creation — own assigned services, price override | BARBER | ✅ Functionally validated + visually redesigned |
| Home summary (total records, revenue, employee breakdown) | OWNER | ✅ Functionally validated + visually redesigned |
| Cross-user data isolation (BARBER sees own data, OWNER sees all) | OWNER, BARBER | ✅ Functionally validated |
| Pull-to-refresh, back navigation, sign-out | OWNER, BARBER | ✅ Functionally validated |

### 🚫 Explicitly Deferred (Post-MVP)

| Feature | Reason |
|---------|--------|
| **CLIENT role** | Out of scope for functional MVP. No client sign-in, no client dashboard, no client booking. |
| Appointment creation from mobile | Backend endpoint exists; mobile UI deferred. |
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

1. **Physical-device redesign QA is pending**: Automated validation is current, but the final redesigned UI still needs explicit device regression evidence.
2. **CLIENT remains deferred/post-MVP**: The redesign did not expand CLIENT functionality or booking UX.
3. **Broader tab/header normalization is deferred**: PR-UI-008 intentionally stayed low risk and did not rework all navigation presentation patterns.
4. **RN mock-renderer tests have limits**: Vitest + React 19 RN component tests help guard structure/behavior but are not a substitute for device-level layout/keyboard verification.
5. **Test DB requires port 5433**: Backend tests need a separate PostgreSQL instance on port 5433. The main DB runs on 5432 via Docker.
6. **Appointment creation is API-only**: No mobile UI to create appointments; must use API or seed script.
7. **No date filtering on API**: `listAppointments` returns up to 100 records ordered by `startAt DESC` with no query parameters. Mobile filters client-side.
8. **Clerk Expo `getToken` instability**: Worked around with `getTokenRef` pattern across all screens. Upgrade to `@clerk/clerk-expo` v3+ may resolve natively.

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
6. Appointment creation from mobile
7. Calendar/timeline UI for appointments
8. Push notifications via Expo push service
9. Offline support and sync queue
10. Performance optimization and bundle size reduction
11. E2E test suite (Detox or Maestro)

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
**Redesign device QA complete**: ⏳ PENDING
**Scope frozen**: 2026-06-15
**Next phase**: redesign device QA + final polish backlog triage
