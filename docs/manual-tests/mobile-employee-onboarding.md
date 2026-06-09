# Employee Onboarding — Manual QA Checklist

This checklist covers the employee-by-email flow (PR-065A) and subsequent UX/error-handling improvements (PR-067A through PR-069A). It should be run manually on a real device or in Expo Go.

**Related docs**: [`mobile-daily-operations-e2e.md`](./mobile-daily-operations-e2e.md) covers the full daily-operations loop that depends on this onboarding flow.

## Scope

1. Add an existing user as employee by email (happy path).
2. Client-side validation (empty input).
3. API error handling — unknown email, duplicate employee, backend unavailable.
4. User ID fallback path.
5. Role-gate enforcement.
6. PR-069A regression: form and feedback behaviour after API failure.

Relevant screen: `apps/mobile/app/(tabs)/employees.tsx`

---

## Preconditions

> **Setup first**: If you haven't started the stack yet, follow **[MVP QA Setup Guide](./mobile-mvp-qa-setup.md)** before continuing.

Before starting, confirm:

- [ ] API server is running and reachable from the device.
- [ ] Mobile app `EXPO_PUBLIC_API_URL` points to the reachable API host.
- [ ] Clerk publishable key is configured.
- [ ] An OWNER account exists with a barbershop (`context.barbershopId` is not null).
- [ ] A BARBER user account **already exists in the system** (via Clerk webhook or seed). You know their email address.
- [ ] If testing the User ID fallback, you also know the BARBER's Clerk user ID (e.g. `user_<clerk-id>…`).
- [ ] The barbershop has no pre-existing employees (clean state), or you are aware of which employees already exist.

### How to create a BARBER user if one doesn't exist

The app does **not** have an invitation flow. Create the user via one of:

- Clerk Dashboard → Users → Add user → set public metadata `{ "role": "BARBER" }`.
- Seed script (if one exists in the repo) that creates a User row with `role = 'BARBER'`.
- Sign up in the mobile app with a new Clerk account and manually set the role in Clerk metadata, then ensure the Clerk webhook creates the User row.

**Important**: the user must be present in the `User` table (`email` must exist). A Clerk account alone is not enough — the webhook must have run.

---

## Phase 1: Happy Path — Add by Email

### 1.1 Navigate to Employees

1. Sign in as the OWNER.
2. Confirm the Home screen loads with the OWNER summary.
3. Tap **View Employees** on Home.
4. Confirm the Employees screen opens.

### 1.2 Open the add form

5. Tap **+ Add Employee**.
6. Confirm the add-employee form appears with:
   - Title: **New Employee**.
   - Help text: _"The person must have an account (logged in at least once). Enter their email or, if you know it, their Clerk user ID."_
   - Label: **Email (or User ID)**.
   - Placeholder: `e.g. barber@example.com`.
   - **Add Employee** and **Cancel** buttons.

### 1.3 Submit a valid email

7. Enter the BARBER's email address (e.g. `barber@shop.com`).
8. Tap **Add Employee**.
9. Confirm:
   - The button shows **Adding…** while the request is in flight.
   - A success flash/message appears: `Employee added successfully.`
   - The form closes (returns to the **+ Add Employee** button state).
   - The input field is cleared when the form is re-opened.
10. Confirm the new employee appears in the list with:
    - Name (or email if name is null).
    - Email address.
    - Role `BARBER`.
    - `Active` badge.

### 1.4 Add a second employee (if you have a second BARBER)

11. Repeat steps 5–10 with a different existing BARBER email.
12. Confirm both employees appear in the list.

---

## Phase 2: Error Path — Empty Input (Client-Side Validation)

13. Tap **+ Add Employee**.
14. Leave the email field **empty** and tap **Add Employee**.
15. Confirm:
    - The error text **"Email or User ID is required."** appears inside the form (red, below the input).
    - The form stays open — no API call is made (no network request).
    - The input retains focus (or you can tap it to continue typing).
    - No success flash appears.

16. Enter only whitespace (spaces) and tap **Add Employee**.
17. Confirm the same "Email or User ID is required." error appears (whitespace is trimmed).

---

## Phase 3: Error Path — Unknown Email

18. Enter an email that does **not** belong to any existing user (e.g. `noone@test.com`).
19. Tap **Add Employee**.
20. Confirm:
    - The friendly error message appears: **"No account found with this email or ID. Make sure the person has logged in at least once."**
    - The form **stays open** — the input is still visible with the email you typed.
    - No success flash appears.
    - The employee list is unchanged.

---

## Phase 4: Error Path — Duplicate Employee

21. Enter the email of the BARBER you already added in Phase 1.
22. Tap **Add Employee**.
23. Confirm:
    - The friendly error message appears: **"This person is already an employee of this barbershop."**
    - The form **stays open**.
    - No success flash appears.
    - The employee list is unchanged (no duplicate entry).

---

## Phase 5: Fallback — Add by User ID

24. Tap **+ Add Employee**.
25. Enter a raw Clerk user ID (e.g. `user_<clerk-id>…`) — the ID of a user that is **not** yet an employee.
26. Tap **Add Employee**.
27. Confirm the employee is added successfully (same behaviour as Phase 1 happy path).
28. Confirm the new employee appears in the list.

> **Note**: User ID is a fallback. The UI encourages email-first (label, placeholder, help text). Both paths must work.

---

## Phase 6: Role Restrictions

### 6.1 BARBER cannot add employees

29. Sign out of OWNER. Sign in as BARBER.
30. Confirm the Home screen loads. There should be **no View Employees** card.
31. Attempt to navigate directly to `/(tabs)/employees`. Confirm:
    - You either cannot reach the screen, or the screen shows **"Only barbershop owners can manage the employee roster."**
    - No employee form or list is visible.

### 6.2 CLIENT cannot add employees

32. Sign out. Sign in as CLIENT.
33. Confirm there is no View Employees card.
34. Attempt to reach the Employees screen directly. Confirm you either cannot reach it or see the owner-only message.

### 6.3 Unauthenticated users

35. Sign out completely. Attempt to reach the Employees screen.
36. Confirm the app redirects you to sign-in or shows a blank/loading state.

---

## Phase 7: PR-069A Regression — Form Behaviour After API Failure

These checks verify the fix from PR-069A: the form must **not** reset and must **not** show a false success flash after an API error.

### 7.1 Failure does not reset the form

37. Sign in as OWNER. Navigate to Employees → **+ Add Employee**.
38. Enter an unknown email (e.g. `bad@nope.com`).
39. Tap **Add Employee**.
40. Confirm:
    - The error appears ("No account found…").
    - The form is **still open** with the email you typed still visible in the input.
    - You can edit the email and try again without re-typing everything.

### 7.2 No false success flash

41. Repeat the unknown-email submission.
42. Confirm **no** "Employee added successfully." flash/message appears.
43. Confirm the only visible feedback is the error message.

### 7.3 Success still works correctly

44. Enter a valid existing BARBER email.
45. Tap **Add Employee**.
46. Confirm:
    - The form closes.
    - The success flash "Employee added successfully." appears.
    - The new employee is in the list.

### 7.4 Duplicate failure does not reset form

47. Enter the same email again (duplicate).
48. Tap **Add Employee**.
49. Confirm:
    - Error "This person is already an employee of this barbershop." appears.
    - Form stays open, input is preserved.
    - No success flash.

---

## Phase 8: Pull-to-Refresh After Add

50. Pull to refresh on the Employees screen.
51. Confirm the employee list reloads and reflects the latest state.
52. Confirm no error banner appears during refresh.

---

## Known Limitations

Documented for testers and future PRs:

- [ ] **No invite flow**: the user must already exist in the `User` table (created via Clerk webhook or seed). There is no "send invitation" button.
- [ ] **No email autocomplete/search**: a single text field for email or user ID. No user search suggestions.
- [ ] **No i18n**: all labels, help text, and error messages are in English only.
- [ ] **No RNTL / component tests**: all employee onboarding checks are manual. No automated component or E2E tests exist.
- [ ] **No bulk add**: employees must be added one at a time.
- [ ] **Employee list shows raw role**: e.g. `BARBER` / `OWNER` (not a human-readable label).
- [ ] **Deactivated employees disappear from the list**: the list endpoint filters by `deletedAt: null`. Reactivation requires a direct API call (`PATCH /employees/:id/reactivate`) because there is no "show inactive" toggle.
- [ ] **Error classification by code/status** (PR-068A): the friendly error mapper uses structured `ApiError` codes first, then falls back to exact message strings. If the backend ever changes error messages, the structured path still works — but the legacy string fallback could miss. This is documented, not a bug.

## Notes for testers

- **Minimal test accounts**:
  - 1 OWNER with a barbershop.
  - 1–2 BARBER users that already exist in the User table.
  - Know the BARBER emails and optionally their Clerk user IDs.
- The phases are designed to run in order (Phase 2 relies on Phase 1, Phase 4 relies on Phase 1, etc.).
- If a step fails, note the step number and what you observed vs. expected.
- For User ID testing (Phase 5), you can find a Clerk user ID in the Clerk Dashboard → Users → click the user → copy the ID.
