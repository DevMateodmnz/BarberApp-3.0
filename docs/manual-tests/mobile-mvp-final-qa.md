# BarberApp Mobile MVP — Final Visual QA Runbook

**Date**: 2026-06-16
**Commit under test**: `7903cb5 feat(mobile): polish auth and root loading surfaces`
**Status**: Pending physical-device regression pass for the redesigned UI
**Device required**: Physical mobile device (Android required; additional iPhone coverage recommended if available)
**Estimated total time**: ~60–90 minutes

---

## Quick status

- The mobile visual redesign is implemented in code through **PR-UI-001 → PR-UI-008**.
- Automated mobile baseline is currently:
  - ✅ TypeScript clean
  - ✅ ESLint clean
  - ✅ Tests passing: **460/460**
- Historical functional QA evidence exists from **2026-06-15** on the pre-redesign MVP baseline.
- **Redesign-specific physical QA is still pending** and must be recorded separately before claiming final visual sign-off.

---

## Historical evidence vs. remaining work

| Evidence type | Status | Notes |
|---------------|--------|-------|
| Pre-redesign functional physical QA | ✅ Recorded | Ran on 2026-06-15 for the MVP baseline before the final redesign commits |
| Current redesigned UI automated validation | ✅ Recorded | 460/460 mobile tests, TypeScript clean, ESLint clean |
| Current redesigned UI physical-device regression QA | ⏳ Pending | This document is the active checklist for that pass |

---

## Preconditions

- [ ] Physical device connected to Expo Go / development build
- [ ] API reachable from the device (`EXPO_PUBLIC_API_URL` uses reachable LAN host)
- [ ] Clerk publishable key configured in `apps/mobile/.env.local`
- [ ] OWNER Clerk account available
- [ ] BARBER Clerk account available
- [ ] Seed/services/employees/appointments data available for QA flows
- [ ] Metro running for the current app build

> CLIENT remains deferred/post-MVP. Do not expand CLIENT scope during this run.

---

## Remaining manual QA checklist

### 1) Auth + root surfaces

- [ ] Cold start while signed out lands on the redesigned sign-in surface
- [ ] Cold start while signed in lands in the tab app after the branded root loading surface
- [ ] Sign-in email step is visually correct on device
- [ ] OTP code step is visually correct on device
- [ ] Keyboard does not cover the active auth input
- [ ] Signed-out → signed-in redirect still behaves correctly
- [ ] Signed-in → sign-out → signed-out redirect still behaves correctly
- [ ] Missing Clerk key fallback surface is visually understandable when intentionally tested in a safe local environment

### 2) OWNER full flow

- [ ] Sign in as OWNER
- [ ] Home dashboard looks correct and remains functional
- [ ] Record Service full flow works and looks correct
- [ ] Services full flow works and looks correct
- [ ] Appointments full flow works and looks correct
- [ ] Employees full flow works and looks correct
- [ ] Working Hours full flow works and looks correct
- [ ] OWNER-only navigation/actions still match role permissions

### 3) BARBER full flow

- [ ] Sign in as BARBER
- [ ] Home dashboard looks correct and remains functional
- [ ] Record Service full flow works and looks correct
- [ ] Appointments full flow works and looks correct
- [ ] OWNER-only screens remain hidden or blocked as expected
- [ ] BARBER-only role behavior still matches existing permissions

### 4) Screen-specific regression checks

#### Record Service

- [ ] OWNER sees employee picker
- [ ] BARBER does not see employee picker
- [ ] Service context / pricing / payment states remain clear
- [ ] Validation and success states remain readable

#### Services

- [ ] Active/inactive filtering still reads clearly
- [ ] Search, create, edit, deactivate, and reactivate flows remain visually coherent
- [ ] Destructive/secondary actions are distinguishable

#### Appointments

- [ ] Date navigation is clear and tappable
- [ ] OWNER employee filtering remains understandable
- [ ] Status transitions remain visually obvious
- [ ] Card density and scrolling remain usable on device

#### Employees

- [ ] Add Employee form remains clear with the redesigned visual system
- [ ] Assignment expand/collapse area remains readable on device
- [ ] OWNER-only blocked states remain clear for BARBER/CLIENT paths if exercised

#### Working Hours

- [ ] Full weekly schedule fits and scrolls correctly
- [ ] Time editing remains usable on device
- [ ] Save state and validation remain understandable

### 5) Loading / error / empty states

- [ ] Home loading/error states look intentional
- [ ] Record Service loading/error/empty states look intentional
- [ ] Services loading/error/empty states look intentional
- [ ] Appointments loading/error/empty states look intentional
- [ ] Employees loading/error/empty states look intentional
- [ ] Working Hours loading/error/empty states look intentional
- [ ] Auth/root loading states look intentional

### 6) Layout / device-behavior checks

- [ ] Safe-area padding looks correct on all redesigned screens
- [ ] Scroll behavior feels stable on long screens/lists
- [ ] Pull-to-refresh remains usable where supported
- [ ] Buttons remain tappable near screen edges / bottom areas
- [ ] Keyboard + input behavior is acceptable on auth and form screens
- [ ] No clipped text, overlapping controls, or broken card layouts on device

### 7) Deferred / post-MVP reminders

- [ ] CLIENT functionality is still intentionally deferred
- [ ] Broader tab/header normalization remains deferred unless a confirmed bug is found
- [ ] Dark mode polish remains out of scope for this pass

---

## Optional detailed flow references

Use these when you want full step-by-step functional coverage while running the redesigned UI:

- `docs/manual-tests/mobile-services-management.md`
- `docs/manual-tests/mobile-service-record-creation.md`
- `docs/manual-tests/mobile-employee-onboarding.md`
- `docs/manual-tests/mobile-daily-operations-e2e.md`

---

## QA evidence to record after the run

When the redesign device pass is actually executed, record:

| Field | Value to capture |
|-------|------------------|
| Date | Execution date |
| Tester | Name |
| Device | Device model + OS |
| Build/runtime | Expo Go / dev build details |
| Commit | Git commit tested |
| Result | PASS / FAIL / PARTIAL |
| Notes | Bugs, screenshots, follow-up items |

### Redesign regression evidence table

| Area | Date | Tester | Device | Result | Notes |
|------|------|--------|--------|--------|-------|
| Auth + root surfaces | — | — | — | ⏳ PENDING | |
| OWNER full flow | — | — | — | ⏳ PENDING | |
| BARBER full flow | — | — | — | ⏳ PENDING | |
| Record Service | — | — | — | ⏳ PENDING | |
| Services | — | — | — | ⏳ PENDING | |
| Appointments | — | — | — | ⏳ PENDING | |
| Employees | — | — | — | ⏳ PENDING | |
| Working Hours | — | — | — | ⏳ PENDING | |
| Loading/error/empty states | — | — | — | ⏳ PENDING | |
| Keyboard/safe-area/scroll | — | — | — | ⏳ PENDING | |

---

## Known limitations / interpretation notes

1. **Do not treat 2026-06-15 physical QA as redesign sign-off.** It remains valid functional evidence, but it predates the final visual redesign commits.
2. **Vitest + React 19 RN mock tests have renderer limits.** They are useful for fast regression coverage, but they do not replace physical-device layout and keyboard verification.
3. **CLIENT remains deferred/post-MVP.** Any CLIENT notes during this run are informational only unless scope changes explicitly.
