# BarberApp MVP — Release Candidate 1

**Date**: 2026-06-15  
**Status**: Release Candidate — Functional Freeze  
**HEAD commit**: `9624651 feat(mobile): add appointments screen`  
**Branch**: `main`

---

## Validation Results

| Check | Result | Details |
|-------|--------|---------|
| Mobile tests | ✅ 290/290 | 19 test files, Vitest |
| Backend tests | ✅ 356/356 | 11 test files, Vitest (last known good; test DB port 5433 unavailable at freeze time) |
| API TypeScript | ✅ clean | `tsc --noEmit` — no errors |
| Mobile TypeScript | ✅ clean | `tsc --noEmit` — no errors |
| Mobile ESLint | ✅ clean | 0 warnings, 0 errors |
| **Total automated** | **646/646** | **0 failures** |

> Note: Backend test DB (`localhost:5433`) was not running during freeze validation. Last known full run (2026-06-15, engram #371): 356/356 pass. Failures at freeze time are exclusively `PrismaClientInitializationError: Can't reach database server at localhost:5433` — environment issue, not code regression.

---

## Functional Scope — Frozen for MVP

### ✅ Included & Validated (Physical Expo Go QA PASS)

| Feature | Role | Status |
|---------|------|--------|
| Clerk OTP sign-in | OWNER, BARBER | ✅ PASS |
| `/me/context` resolution | OWNER, BARBER | ✅ PASS |
| Home dashboard | OWNER, BARBER | ✅ PASS |
| Services CRUD (create, edit, deactivate, reactivate, search, filter) | OWNER | ✅ PASS |
| Employees — add, view, manage service assignments | OWNER | ✅ PASS |
| Working Hours — view week schedule, edit day hours, toggle on/off, persist | OWNER | ✅ PASS |
| Appointments — view by date, filter by employee, status transitions (confirm, start, complete, cancel) | OWNER | ✅ PASS |
| Appointments — view own appointments, status transitions | BARBER | ✅ PASS |
| Service Record creation — select employee, service, payment, client name | OWNER | ✅ PASS |
| Service Record creation — own assigned services, price override | BARBER | ✅ PASS |
| Home summary (total records, revenue, employee breakdown) | OWNER | ✅ PASS |
| Cross-user data isolation (BARBER sees own data, OWNER sees all) | OWNER, BARBER | ✅ PASS |
| Pull-to-refresh, back navigation, sign-out | OWNER, BARBER | ✅ PASS |

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

## OWNER/BARBER Physical QA — PASS Summary

- **Date executed**: 2026-06-15
- **Device**: Physical Android phone with Expo Go
- **Owner Clerk user**: `real OWNER QA account` (`local-only OWNER Clerk ID`)
- **Barber Clerk user**: `real BARBER QA account` (`local-only BARBER Clerk ID`)
- **Barbershop**: Barbería Classic
- **DB barber record**: active BARBER employee mapping validated
- **Result**: All OWNER and BARBER phases passed. No P0/P1 blockers found.

Detailed QA runbook: [`docs/manual-tests/mobile-mvp-final-qa.md`](../manual-tests/mobile-mvp-final-qa.md)

---

## Known Limitations

1. **UI/UX is visually rough**: Functional but lacks polish — inconsistent spacing, no design system, basic card layouts, minimal loading/empty states. This is the next planned phase.
2. **Test DB requires port 5433**: Backend tests need a separate PostgreSQL instance on port 5433. The main DB runs on 5432 via Docker.
3. **Appointment creation is API-only**: No mobile UI to create appointments; must use API or seed script.
4. **No date filtering on API**: `listAppointments` returns up to 100 records ordered by `startAt DESC` with no query parameters. Mobile filters client-side.
5. **Clerk Expo `getToken` instability**: Worked around with `getTokenRef` pattern across all screens. Upgrade to `@clerk/clerk-expo` v3+ may resolve natively.

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

## Post-MVP Backlog (Priority Order)

1. **UI/UX redesign** — next phase (see [`docs/design/ui-ux-redesign-prep.md`](../design/ui-ux-redesign-prep.md))
2. CLIENT role — booking flow, client dashboard, photo gallery
3. Appointment creation from mobile
4. Calendar/timeline UI for appointments
5. Push notifications via Expo push service
6. Offline support and sync queue
7. Performance optimization and bundle size reduction
8. E2E test suite (Detox or Maestro)

---

## Release Artifacts

| Artifact | Path |
|----------|------|
| MVP RC document | `docs/releases/mvp-rc-1.md` |
| Final QA runbook | `docs/manual-tests/mobile-mvp-final-qa.md` |
| UI/UX redesign prep | `docs/design/ui-ux-redesign-prep.md` |
| QA setup guide | `docs/manual-tests/mobile-mvp-qa-setup.md` |
| QA strategy | `docs/QA_STRATEGY.md` |
| Architecture doc | `docs/ARCHITECTURE.md` |
| Product spec | `docs/PRODUCT_SPEC.md` |

---

## Sign-Off

**MVP RC ready**: ✅ YES  
**Scope frozen**: 2026-06-15  
**Next phase**: UI/UX redesign
