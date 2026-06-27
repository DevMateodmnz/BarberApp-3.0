# BarberApp Mobile MVP — Release-Readiness Phone Checklist

Use this checklist for the **current MVP** on a physical Samsung Galaxy S21 with Expo Go when deciding whether the app is ready for a controlled demo or pilot.

**Recommended runtime**:
- API running locally on the development machine
- Expo/Metro running in LAN mode
- Phone and laptop on the same Wi-Fi
- QA setup prepared via [`mobile-mvp-qa-setup.md`](./mobile-mvp-qa-setup.md)

**Current known local limitations**:
- If local `CLERK_WEBHOOK_SECRET` is missing, live webhook-specific proof is limited.
- Employee invitation acceptance can still be validated through the authoritative mobile reconciliation path before `/me/context`.

## Test metadata

| Field | Value |
|------|-------|
| Date | |
| Device | Samsung Galaxy S21 |
| Runtime | Expo Go |
| Branch / commit | |
| API URL | |
| Expo URL | |
| Tester | |

## Roles / accounts to prepare

- **OWNER QA account** — existing local QA owner with valid barbershop context
- **BARBER QA account** — existing local QA barber with active employee mapping
- **Fresh invitee A** — controlled email for accepted employee invitation
- **Fresh invitee B** — controlled email for revoke QA (optional but recommended)

> Record **PASS**, **FAIL**, or **BLOCKED** for every phase. If something fails, note the exact visible behavior and the step number.

---

## Phase 1 — Startup / sign-in / sign-out

**Role/account**: OWNER QA, then BARBER QA  
**Action**:
1. Cold start the app.
2. Confirm signed-out experience is understandable.
3. Sign in as OWNER.
4. Sign out.
5. Sign in as BARBER.

**Expected result**:
- App loads without crash or endless spinner.
- Sign-in completes.
- Sign-out returns to signed-out flow cleanly.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 2 — OWNER Home and context

**Role/account**: OWNER QA  
**Action**:
1. Land on Home.
2. Confirm barbershop context loads.
3. Review daily summary cards.
4. Navigate away and back.

**Expected result**:
- OWNER context resolves without loop.
- Home cards render correctly.
- No stale-context or repeated-loading deadlock.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 3 — BARBER Home and context

**Role/account**: BARBER QA  
**Action**:
1. Sign in as BARBER.
2. Open Home.
3. Confirm barber-scoped summary and role-aware navigation.

**Expected result**:
- BARBER context resolves successfully.
- OWNER-only surfaces are hidden.
- No role leakage.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 4 — Services management

**Role/account**: OWNER QA  
**Action**:
1. Open Services.
2. Create or edit a service if safe for QA.
3. Toggle active/inactive if safe.
4. Return to the list.

**Expected result**:
- OWNER can manage services.
- List refreshes correctly.
- No clipping, broken forms, or silent failures.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 5 — Employees list and existing actions

**Role/account**: OWNER QA  
**Action**:
1. Open Employees.
2. Confirm existing employees render.
3. Pull to refresh.
4. If safe, verify deactivate/reactivate and service assignment actions on an existing QA employee.

**Expected result**:
- Existing rows load cleanly.
- Refresh works.
- Existing employee actions still behave correctly.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 6 — Employee invitation onboarding

### 6A. Existing BARBER add/reactivate

**Role/account**: OWNER QA  
**Action**:
1. Use an existing safe BARBER account not already active in the target state.
2. Submit via Employees screen.

**Expected result**:
- Immediate local employee add/reactivation path works.
- No pending invitation is created for this path.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

### 6B. Pending invitation

**Role/account**: OWNER QA + Fresh invitee A  
**Action**:
1. Create a new invitation by email.
2. Confirm pending row appears.

**Expected result**:
- Pending invitation row appears with the invited email.
- No local employee exists yet.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

### 6C. Resend

**Role/account**: OWNER QA  
**Action**:
1. Tap resend on the pending invitation.

**Expected result**:
- Action succeeds once.
- Same local row remains.
- Timestamps / resend count refresh if visible.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

### 6D. Revoke

**Role/account**: OWNER QA + Fresh invitee B  
**Action**:
1. Create second safe invitation if needed.
2. Revoke it from the UI.

**Expected result**:
- Invitation becomes revoked or non-actionable according to the UI.
- No local user/employee is created from the revoked path.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

### 6E. Accepted invitee sign-in / reconcile

**Role/account**: Fresh invitee A  
**Action**:
1. Accept the invitation.
2. Sign in on mobile with the invitee account.
3. Let the app reconcile before `/me/context`.
4. Refresh OWNER Employees screen afterward.

**Expected result**:
- Invitee becomes a working BARBER locally.
- BARBER context loads.
- OWNER view shows the invitation as accepted.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 7 — Working hours

**Role/account**: OWNER QA  
**Action**:
1. Open Working Hours.
2. Review current schedule.
3. Edit one safe row if needed and save.

**Expected result**:
- OWNER-only access works.
- Save and refresh work without broken state.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 8 — Appointment list

**Role/account**: OWNER QA, then BARBER QA  
**Action**:
1. Open Appointments as OWNER.
2. Change date / employee filters if present.
3. Open Appointments as BARBER.

**Expected result**:
- OWNER sees shop-level list.
- BARBER sees scoped appointments only.
- No list crash or unauthorized leakage.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 9 — Staff appointment creation

### 9A. OWNER create

**Role/account**: OWNER QA  
**Action**:
1. Create a guest appointment from mobile.

**Expected result**:
- Employee, service, date, slot, and client input flow works.
- Appointment is created successfully.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

### 9B. BARBER create

**Role/account**: BARBER QA  
**Action**:
1. Create an appointment from the barber-scoped flow.

**Expected result**:
- Employee is barber-scoped automatically.
- Only allowed services appear.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

### 9C. Conflict recovery / cancelled-slot reopening

**Role/account**: OWNER or BARBER QA  
**Action**:
1. Attempt a conflicting slot if safe.
2. Cancel an appointment.
3. Confirm the cancelled slot becomes reusable when expected.

**Expected result**:
- Conflict is rejected safely.
- Cancelled-slot reopening behavior still works.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 10 — Service record creation

**Role/account**: OWNER QA, then BARBER QA  
**Action**:
1. Create a service record as OWNER.
2. Create a service record as BARBER for self.

**Expected result**:
- Record creation works for both supported roles.
- Daily data updates after refresh.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 11 — Daily summary / revenue analytics

**Role/account**: OWNER QA, then BARBER QA  
**Action**:
1. Return to Home after creating/updating records.
2. Compare summary behavior for OWNER vs BARBER.

**Expected result**:
- OWNER summary reflects shop totals.
- BARBER summary remains scoped appropriately.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 12 — Six-language smoke check

**Role/account**: any signed-in QA account  
**Action**:
1. Switch to Spanish.
2. Switch to German.
3. Switch to Simplified Chinese.
4. Spot-check Home, Appointments, Employees, and one form-heavy screen.

**Expected result**:
- No untranslated keys.
- No obvious broken wrapping or unusable buttons.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 13 — Keyboard / layout smoke check

**Role/account**: OWNER QA  
**Action**:
1. Open a form with several fields (invitation, service, appointment, working hours as applicable).
2. Use the keyboard on multiple inputs.

**Expected result**:
- Inputs remain visible.
- Buttons remain tappable.
- No severe overlap/clipping.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 14 — Pull-to-refresh and navigation

**Role/account**: OWNER QA, then BARBER QA  
**Action**:
1. Pull to refresh on key list screens.
2. Move between Home, Appointments, Record, Manage/secondary screens.

**Expected result**:
- Refresh works.
- Back/navigation state remains stable.
- Hidden routes do not appear as tabs accidentally.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Phase 15 — Offline / network-failure smoke

**Role/account**: OWNER QA or BARBER QA  
**Action**:
1. Temporarily disable network or point the phone into an unreachable state.
2. Attempt a lightweight refresh or mutation.
3. Restore network and retry.

**Expected result**:
- App fails gracefully.
- No permanent broken state after reconnect.

**Result**: PASS / FAIL / BLOCKED  
**Notes**:

---

## Final decision

| Decision | Mark |
|---------|------|
| Ready for controlled demo / pilot | ☐ |
| Not ready — blockers remain | ☐ |

### Blocking issues

- 

### Non-blocking issues / UI debt

- 
