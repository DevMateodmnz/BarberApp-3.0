# BarberApp MVP — Final Manual QA Runbook

**Date**: 2026-06-15  
**Commit under test**: `9624651 feat(mobile): add appointments screen`  
**Device required**: Physical Android phone with Expo Go  
**Estimated total time**: ~90 minutes (setup + all phases)

---

## Preconditions

### Required Clerk Users

| # | Email | Role | Clerk publicMetadata | Status |
|---|-------|------|---------------------|--------|
| 1 | `real OWNER QA account` | OWNER | `{ "role": "OWNER" }` | ✅ QA verified |
| 2 | `real BARBER QA account` | BARBER | `{ "role": "BARBER" }` | ✅ QA verified |
| 3 | (Any CLIENT Clerk account) | CLIENT | `{ "role": "CLIENT" }` | 🚫 Deferred |

### Required Database Rows (after first setup)

| Table | Row | Key fields |
|-------|-----|-----------|
| User | OWNER | `clerkUserId` matches Clerk, `role: OWNER` |
| User | BARBER | `clerkUserId` matches Clerk, `role: BARBER` |
| Barbershop | QA Barbershop | `ownerId` = OWNER DB UUID, `timezone: America/Argentina/Buenos_Aires` |
| Employee | BARBER employee | `userId` = BARBER DB UUID, `barbershopId` = QA Barbershop ID, `isActive: true` |

### Required Services (create during QA or pre-seed)

| Service | Duration | Price | Active |
|---------|----------|-------|--------|
| Classic Cut | 30 min | $50.00 (5000¢) | Yes |
| Beard Trim | 20 min | $30.00 (3000¢) | Yes |

### Required Employee-Service Assignments

- BARBER assigned to: Classic Cut, Beard Trim

### Required Working Hours

At minimum: Mon-Fri 09:00-18:00, Sat 09:00-13:00 (can be configured during QA)

### Required Appointments (create during QA or pre-seed)

At least 3 appointments for today:
- 1 PENDING, assigned to BARBER
- 1 CONFIRMED, assigned to BARBER
- 1 for tomorrow (to test date navigation)

### Environment Running

- [ ] Docker PostgreSQL running (`docker compose up -d`)
- [ ] API running on port 3000 (`npm run dev --workspace @barberapp/api`)
- [ ] Metro bundler running (`npm run dev --workspace @barberapp/mobile`)
- [ ] Expo Go connected to Metro on physical device
- [ ] API reachable from device (`EXPO_PUBLIC_API_URL` uses LAN IP)
- [ ] Clerk publishable key configured in `apps/mobile/.env.local`

---

## Phase 0: Startup Verification (5 min)

| Step | Action | Expected |
|------|--------|----------|
| 0.1 | Open BarberApp in Expo Go | Sign-in screen appears |
| 0.2 | Sign in as OWNER | Home loads, no stuck loading |
| 0.3 | Confirm context loads | "My Shop" or barbershop name visible |
| 0.4 | Sign out | Returns to sign-in screen |
| 0.5 | Sign in as BARBER | Home loads with context |
| 0.6 | Sign out | Returns to sign-in screen |
| 0.7 | Sign in as CLIENT (optional) | Home loads, client dashboard message |

---

## Phase 1: OWNER — Services Catalog (15 min)

> **Existing detailed checklist**: [`mobile-services-management.md`](./mobile-services-management.md)  
> Run that checklist in full. Summary below:

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Sign in as OWNER | Home loads |
| 1.2 | Tap **View Services** | Services screen opens |
| 1.3 | Create **Classic Cut**: $50.00, 30min | Success flash, appears in list |
| 1.4 | Create **Beard Trim**: $30.00, 20min | Success flash, appears in list |
| 1.5 | Verify Active filter shows `(2)` | Both services visible |
| 1.6 | Edit a service name | Name updates in list |
| 1.7 | Deactivate a service | Moves to Inactive |
| 1.8 | Reactivate the service | Returns to Active |
| 1.9 | Search by name | Filters correctly |
| 1.10 | Pull to refresh | List reloads |
| 1.11 | Return to Home | Back navigation works |

---

## Phase 2: OWNER — Employees & Assignments (15 min)

> **Existing detailed checklists**: [`mobile-employee-onboarding.md`](./mobile-employee-onboarding.md) and [`mobile-daily-operations-e2e.md`](./mobile-daily-operations-e2e.md) §1.2–1.3

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Tap **View Employees** | Employees screen opens |
| 2.2 | Tap **+ Add Employee** | Form opens |
| 2.3 | Enter BARBER email, tap Add | Success, employee appears with Active badge |
| 2.4 | Tap **Manage Services** on BARBER row | Assignment section expands |
| 2.5 | Available Services shows Classic Cut, Beard Trim | Both listed |
| 2.6 | Tap **Assign** on Classic Cut | Moves to Assigned |
| 2.7 | Tap **Assign** on Beard Trim | Both assigned |
| 2.8 | Tap **Hide Services** | Section collapses |
| 2.9 | Reopen Manage Services | Both still assigned |
| 2.10 | Try adding empty email | Error: "Email or User ID is required." |
| 2.11 | Try adding nonexistent email | Friendly error (not raw API error) |
| 2.12 | Return to Home | Back navigation works |

---

## Phase 3: OWNER — Working Hours (10 min)

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Tap **View Working Hours** | Working Hours screen opens |
| 3.2 | Confirm all 7 days visible | Mon through Sun rows |
| 3.3 | Verify Mon-Fri have times (e.g., 09:00–18:00) | Active toggle ON |
| 3.4 | Verify Sat has times (e.g., 09:00–13:00) | Active toggle ON |
| 3.5 | Verify Sun is inactive or closed | Active toggle OFF or empty times |
| 3.6 | Change Monday hours to 08:00–17:00 | Time fields update |
| 3.7 | Toggle Sunday ON, set 10:00–14:00 | Activates with times |
| 3.8 | Tap **Save Changes** | Success feedback, data persists |
| 3.9 | Pull to refresh | Reloads from server, Monday shows 08:00–17:00 |
| 3.10 | Navigate away, come back | Data persists (no reset) |
| 3.11 | Toggle Sunday OFF, Save | Sunday deactivates |
| 3.12 | Return to Home | Back navigation works |

---

## Phase 4: OWNER — Appointments (10 min)

> **Existing QA guide**: `openspec/changes/appointments-mobile/proposal.md` §11

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Tap **View Appointments** (Home card) | Appointments screen opens |
| 4.2 | Confirm date shows today (YYYY-MM-DD) | Today's date displayed |
| 4.3 | Confirm appointments for today are visible | Cards with time, status, client, service, barber |
| 4.4 | Verify employee filter chips visible | "All" active + one chip per employee |
| 4.5 | Tap a specific employee chip | Only that employee's appointments shown |
| 4.6 | Tap "All" | All appointments shown again |
| 4.7 | Find a PENDING appointment, tap **Confirm** | Status changes to CONFIRMED, list refreshes |
| 4.8 | Find a CONFIRMED appointment, tap **Cancel** | Appointment disappears (cancelled) |
| 4.9 | Tap ▶ (next day) | Date advances by 1, appointments filter |
| 4.10 | Tap **Today** button | Date returns to today |
| 4.11 | Tap ◀ for several days back | Date navigates backward correctly |
| 4.12 | Pull to refresh | List reloads |
| 4.13 | Return to Home | Back navigation works |

---

## Phase 5: OWNER — Service Records (5 min)

> **Existing detailed checklist**: [`mobile-service-record-creation.md`](./mobile-service-record-creation.md)  

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Tap **Record Service** | Creation screen opens |
| 5.2 | Confirm employee picker visible (OWNER) | Dropdown with BARBER listed |
| 5.3 | Select BARBER, select Classic Cut | Service context block shows: name, $50.00, 30min |
| 5.4 | Confirm price pre-filled with 5000 | "Using default service price." shown |
| 5.5 | Select CARD payment, enter client name "John" | Form updates |
| 5.6 | Tap **Create Record** | Success, returns to Home |
| 5.7 | Confirm record appears in Home summary | Total records updated, revenue updated |
| 5.8 | Scroll to Service Records section | New record visible with service, price, time, client |

---

## Phase 6: BARBER — Context & Home (5 min)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Sign out of OWNER | Returns to sign-in |
| 6.2 | Sign in as BARBER | Home loads with BARBER context |
| 6.3 | Confirm Home shows BARBER summary | Employee name visible |
| 6.4 | Confirm NO View Services card | OWNER-only, hidden for BARBER |
| 6.5 | Confirm NO View Employees card | OWNER-only, hidden for BARBER |
| 6.6 | Confirm NO View Working Hours card | OWNER-only, hidden for BARBER |
| 6.7 | Confirm Record Service entry visible | BARBER can record services |
| 6.8 | Confirm View Appointments card visible | BARBER can view appointments |

---

## Phase 7: BARBER — Appointments (5 min)

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Tap **View Appointments** | Appointments screen opens |
| 7.2 | Confirm ONLY BARBER's appointments shown | No other employees' appointments |
| 7.3 | Confirm NO employee filter chips | Filter not shown for BARBER |
| 7.4 | Find a CONFIRMED appointment, tap **Start** | Status changes to IN_PROGRESS |
| 7.5 | Find the IN_PROGRESS appointment, tap **Complete** | Status changes to COMPLETED, actions disappear |
| 7.6 | Confirm can navigate dates | Previous/next days work |
| 7.7 | Pull to refresh | List reloads |
| 7.8 | Return to Home | Back navigation works |

---

## Phase 8: BARBER — Service Records (5 min)

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Tap **Record Service** | Creation screen opens |
| 8.2 | Confirm NO employee picker (BARBER) | Uses own context |
| 8.3 | Confirm assigned services visible | Classic Cut, Beard Trim |
| 8.4 | Select Classic Cut | Price pre-fills with 5000 |
| 8.5 | Change price to 4000 | "Price differs from default" indicator appears |
| 8.6 | Select CASH payment, enter client name | Form updates |
| 8.7 | Tap **Create Record** | Success, returns to Home |
| 8.8 | Confirm record appears in BARBER summary | Revenue updated |
| 8.9 | Sign out | Returns to sign-in |

---

## Phase 9: OWNER — Cross-User Verification (5 min)

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Sign in as OWNER | Home loads |
| 9.2 | Confirm summary shows records from ALL users | BARBER's records + OWNER's records |
| 9.3 | Confirm employee breakdown shows BARBER name | Record count correct |
| 9.4 | Go to Appointments | Confirm status changes from BARBER visible (COMPLETED) |
| 9.5 | Confirm employee filter shows BARBER | Chip available |

---

## Phase 10: CLIENT — Restricted Flow (DEFERRED — Post-MVP)

> 🚫 **This phase is explicitly deferred.** CLIENT role is out of scope for functional MVP RC.  
> The steps below are preserved for reference when CLIENT is implemented.

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Sign out, sign in as CLIENT | Home loads |
| 10.2 | Confirm NO Record Service entry | Hidden |
| 10.3 | Confirm NO View Services | Hidden |
| 10.4 | Confirm NO View Employees | Hidden |
| 10.5 | Confirm NO View Working Hours | Hidden |
| 10.6 | Confirm NO View Appointments | Hidden |
| 10.7 | Confirm client dashboard message | "Coming soon" or similar |
| 10.8 | If Appointments accessible via URL, confirm blocked | Friendly blocked message |

---

## Phase 11: Stability & Edge Cases (5 min)

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Pull to refresh on every screen | All reload without errors |
| 11.2 | Kill app, reopen, sign in | Context loads correctly |
| 11.3 | Hot reload during appointments view | No crash, no stuck loading |
| 11.4 | Rapid sign-out/sign-in (3x) | No stuck loading loops |
| 11.5 | Navigate between 4+ screens rapidly | No crashes, no red screens |
| 11.6 | Scroll large lists (many services/appointments) | Smooth scrolling |

---

## PASS/FAIL Evidence Table

| Phase | Test | Date | Tester | Device | Result | Notes |
|-------|------|------|--------|--------|--------|-------|
| 0 | Startup verification | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | OWNER + BARBER sign-in, context loads |
| 1 | Services catalog | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | CRUD, filters, search, deactivate/reactivate |
| 2 | Employees & assignments | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Add, assign/unassign services, validation |
| 3 | Working hours | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Edit, toggle, save, persist across navigation |
| 4 | OWNER appointments | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Date nav, employee filter, status transitions |
| 5 | OWNER service records | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Select employee/service/payment, create record |
| 6 | BARBER context & home | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Context loads, OWNER-only cards hidden |
| 7 | BARBER appointments | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Own appointments only, no filter chips, status transitions |
| 8 | BARBER service records | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Own services, price override, record creation |
| 9 | Cross-user verification | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | BARBER records visible to OWNER, data isolation confirmed |
| 10 | CLIENT restricted flow | — | — | — | 🚫 DEFERRED | CLIENT out of scope for MVP RC |
| 11 | Stability & edge cases | 2026-06-15 | Mateo | Android, Expo Go | ✅ PASS | Pull-to-refresh, kill/reopen, rapid sign-in/out, navigation |

---

## Blocker Triage Rules

### Severity Definitions

| Level | Definition | Action |
|-------|-----------|--------|
| **P0** | App crashes, cannot sign in, data loss, security bypass | **Must fix before MVP RC** |
| **P1** | Core feature broken (can't create record, can't transition appointment, screen blank) | **Must fix before MVP RC** |
| **P2** | Non-blocking bug (cosmetic issue, slow load, missing label, edge case) | Document in release notes, fix post-MVP |
| **P3** | Enhancement request, nice-to-have, performance optimization | Post-MVP backlog |

### P0/P1 Example Triggers

- Sign-in fails or gets stuck on "Loading your context…"
- Any screen shows a red error screen (unhandled exception)
- Status transition fails with error
- Service record creation fails with error
- Data visible to wrong role (e.g., BARBER sees OWNER data)
- Appointment cancellation deletes data instead of setting CANCELLED

### P2 Example Triggers

- A label shows raw enum value instead of human-readable text
- Filter chip text overflows on very long names
- "Today" button not visually distinct from normal date
- Pull-to-refresh spinner shows briefly then disappears without data change
- Scroll position resets after filter change

### P3 Example Triggers

- Calendar/timeline view for appointments
- Batch service assignment
- Appointment creation from mobile
- Push notifications
- Offline queue

---

## Existing QA Documents Reference

These documents provide detailed checklists for specific features. Use them alongside this runbook:

| Document | Covers | Status |
|----------|--------|--------|
| [`mobile-mvp-qa-setup.md`](./mobile-mvp-qa-setup.md) | Environment setup, DB seeding, troubleshooting | **Run first** |
| [`mobile-services-management.md`](./mobile-services-management.md) | Service CRUD, filters, search, deactivate/reactivate | Reference for Phase 1 |
| [`mobile-employee-onboarding.md`](./mobile-employee-onboarding.md) | Employee add, validation, error handling, PR-069A regression | Reference for Phase 2 |
| [`mobile-service-record-creation.md`](./mobile-service-record-creation.md) | Record creation (OWNER + BARBER), price handling | Reference for Phase 5, 8 |
| [`mobile-daily-operations-e2e.md`](./mobile-daily-operations-e2e.md) | Pre-appointments E2E loop (128 steps) | Legacy reference, superseded by this document |

---

## Post-QA: Sign-Off

- [x] All OWNER/BARBER phases (0–9, 11) executed on physical Android device with Expo Go
- [x] PASS/FAIL table completed
- [x] No P0/P1 blockers found
- [x] P2/P3 items deferred to post-MVP (UI/UX redesign phase)
- [x] CLIENT phase (10) explicitly deferred — out of scope for functional MVP RC

**MVP RC ready**: ✅ YES

**Sign-off**: Mateo  **Date**: 2026-06-15

---

## QA User Credentials (for reference)

| Role | Clerk Email | DB Email (if different) | Clerk User ID |
|------|------------|------------------------|---------------|
| OWNER | `real OWNER QA account` | `real OWNER QA account` | `local-only OWNER Clerk ID` |
| BARBER | `real BARBER QA account` | `real BARBER QA account` | `local-only BARBER Clerk ID` |
| CLIENT | 🚫 Deferred | 🚫 Deferred | 🚫 Deferred |

**Barbershop**: Barbería Classic  
**BARBER employee name**: Juan Pérez
