# BarberApp Mobile MVP — Final Visual QA Runbook

**Date**: 2026-06-25
**Commit under test**: `ceea8ce feat(mobile): add role-based daily navigation`
**Status**: Latest multilingual navigation + redesign-focused physical-device regression pass recorded as PASS
**Device required**: Physical mobile device (Android required; additional iPhone coverage still recommended if available)
**Recorded device/runtime**: Samsung Galaxy S21 / Expo Go
**Estimated total time**: ~60–90 minutes for future full reruns

---

## Quick status

- The multilingual navigation redesign is implemented through:
  - i18n foundation
  - complete mobile interface localization
  - role-based OWNER/BARBER navigation
  - OWNER Manage surface
  - Home hierarchy/spacing redesign
- Automated mobile baseline is currently:
  - ✅ TypeScript clean
  - ✅ ESLint clean
  - ✅ Tests passing: **529/529**
- Historical functional QA evidence exists from **2026-06-15** on the pre-redesign MVP baseline.
- **Current redesigned multilingual navigation physical-device QA passed on 2026-06-25**.

---

## Historical evidence vs. current state

| Evidence type | Status | Notes |
|---------------|--------|-------|
| Pre-redesign functional physical QA | ✅ Recorded | Ran on 2026-06-15 for the MVP baseline before the final redesign commits |
| Current redesigned UI automated validation | ✅ Recorded | 529/529 mobile tests, TypeScript clean, ESLint clean |
| Current redesigned multilingual navigation physical-device regression QA | ✅ Recorded | Passed on 2026-06-25 on Samsung Galaxy S21 using Expo Go |

---

## Recorded 2026-06-25 PASS evidence

### Physical QA metadata

| Field | Value |
|-------|-------|
| Date | 2026-06-25 |
| Device | Samsung Galaxy S21 |
| Runtime | Expo Go |
| Commit | `ceea8ced4efa9782d6fe866e7faef2dabdfe7f9d` |
| Result | PASS |
| Notes | No blocking issues reported during the compact multilingual navigation pass |

### Evidence summary

| Area | Result | Notes |
|------|--------|-------|
| Spanish OWNER | PASS | Tabs, Home hierarchy, spacing, Appointments, Record, Manage, sign-out/navigation all reported good |
| Spanish BARBER | PASS | Tabs correct, Manage hidden, Home/Appointments/Record usable, role restrictions intact |
| German stress | PASS | No clipping/overlap; Home and Manage wrapping remained usable |
| Simplified Chinese | PASS | Glyphs rendered correctly; tabs and management rows aligned |
| Persistence | PASS | Selected non-Spanish locale survived reload; app returned to Spanish |
| Navigation / safe area / spacing | PASS | No tab clipping, route instability, or spacing regressions reported |

---

## Future full regression checklist

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

### 4) Layout / device-behavior checks

- [ ] Safe-area padding looks correct on all redesigned screens
- [ ] Scroll behavior feels stable on long screens/lists
- [ ] Pull-to-refresh remains usable where supported
- [ ] Buttons remain tappable near screen edges / bottom areas
- [ ] Keyboard + input behavior is acceptable on auth and form screens
- [ ] No clipped text, overlapping controls, or broken card layouts on device

---

## Known limitations / interpretation notes

1. The 2026-06-25 pass is the current device-signoff evidence for the multilingual navigation redesign, but native-speaker translation review is still recommended before wider international rollout.
2. Vitest + React Native mock tests are useful for regression coverage, but they still do not replace physical-device layout, keyboard, and safe-area verification.
3. CLIENT remains deferred/post-MVP. Any CLIENT notes during future reruns are informational only unless scope changes explicitly.
