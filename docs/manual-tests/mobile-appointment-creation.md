# Mobile Appointment Creation — Manual QA Runbook

This is a **future QA checklist** for the appointment-create feature. It is **not** evidence of completed QA.

## Scope

Covers OWNER and BARBER appointment creation from the mobile Appointments tab after implementation.

## Preconditions

- [ ] API and mobile app are running from the implementation branch under test.
- [ ] Auth works for OWNER and BARBER test accounts.
- [ ] The authenticated OWNER has an active barbershop.
- [ ] The authenticated BARBER has an active employee record in that barbershop.
- [ ] At least two active employees exist for OWNER testing.
- [ ] At least two active services exist.
- [ ] At least one employee has multiple assigned services.
- [ ] Working hours are configured for open and closed days.
- [ ] There is at least one known conflict slot on a test date.
- [ ] Test data uses fake identities only.
- [ ] App supports all six locales: `es`, `en`, `de`, `fr`, `it`, `zh-Hans`.

## OWNER happy path

1. Sign in as OWNER.
2. Open **Appointments**.
3. Change the selected list date to a known open day.
4. Tap **New appointment**.
5. Confirm the create screen opens.
6. Confirm the employee picker is visible.
7. Select an active employee.
8. Confirm only that employee’s assigned active services appear.
9. Select a service.
10. Confirm the date defaults to the list’s selected date.
11. Confirm available time slots appear.
12. Select a slot.
13. Enter client name.
14. Optionally enter phone and notes.
15. Confirm summary shows service, duration, end time, and price.
16. Submit.
17. Confirm success feedback appears.
18. Confirm the app returns to the Appointments list.
19. Confirm the selected date is preserved.
20. Confirm the new appointment appears immediately.

## BARBER happy path

1. Sign in as BARBER.
2. Open **Appointments**.
3. Tap **New appointment**.
4. Confirm no employee picker is visible.
5. Confirm only the barber’s assigned active services appear.
6. Select a service.
7. Select a valid date.
8. Select a valid time slot.
9. Enter client name.
10. Optionally enter phone and notes.
11. Submit.
12. Confirm success feedback appears.
13. Confirm the appointment appears in the barber-scoped list.

## Invalid employee / service checks

### OWNER

- [ ] Inactive employee does not appear as a selectable option.
- [ ] If an employee becomes inactive before submit, the API returns the localized inactive-employee error.
- [ ] If a service is unassigned after selection but before submit, the API returns the localized assignment error.
- [ ] If a service becomes inactive before submit, the API returns the localized inactive-service error.

### BARBER

- [ ] A barber cannot create for another employee by crafting the request.
- [ ] Hidden employee controls cannot be bypassed.

## Conflict case

1. Prepare an existing appointment for the same employee/date.
2. Open the create flow.
3. Select a slot that is initially available.
4. Make the slot conflicting from another client/session before submit.
5. Submit.
6. Confirm a localized conflict message appears.
7. Confirm the form remains open.
8. Confirm the selected time clears or refreshes.
9. Confirm updated slots are shown.

## Working-hours case

- [ ] Closed day shows no valid slots and/or a clear closed message.
- [ ] Times before opening are not selectable.
- [ ] Times that would end after closing are not selectable.
- [ ] Past times on today are not selectable.
- [ ] If the API rejects a stale/out-of-hours slot, the localized hours error is shown.

## Role restrictions

- [ ] OWNER can create for any eligible active employee in their own barbershop.
- [ ] OWNER cannot create across tenants.
- [ ] BARBER can create only inside their own employee scope.
- [ ] CLIENT cannot access the create route.

## Multilingual checks

For each locale, verify screen title, CTA, field labels, validation, summary, and success/error states.

- [ ] Spanish (`es`)
- [ ] English (`en`)
- [ ] German (`de`)
- [ ] French (`fr`)
- [ ] Italian (`it`)
- [ ] Simplified Chinese (`zh-Hans`)

Additional locale stress checks:
- [ ] German labels/buttons do not clip or overlap.
- [ ] French helper text wraps correctly.
- [ ] Simplified Chinese glyphs render correctly and remain aligned.

## Keyboard and responsiveness

- [ ] Keyboard does not cover client name input.
- [ ] Keyboard does not cover phone input.
- [ ] Keyboard does not cover notes input.
- [ ] Screen scrolls correctly while editing.
- [ ] Submit button stays reachable on a narrow phone.
- [ ] Wrapped slot chips remain tappable.
- [ ] Long service names do not break the summary layout.

## Success and list refresh

- [ ] Success returns to the Appointments tab.
- [ ] Selected list date remains the same after return.
- [ ] The list refreshes automatically.
- [ ] OWNER employee filter still behaves correctly after creation.
- [ ] BARBER list remains self-scoped after creation.

## Evidence table

| Scenario | Locale | Role | Device / Runtime | Result | Notes | Screenshot / Video |
|------|------|------|------|------|------|------|
| OWNER happy path |  |  |  |  |  |  |
| BARBER happy path |  |  |  |  |  |  |
| Conflict recovery |  |  |  |  |  |  |
| Outside working hours |  |  |  |  |  |  |
| German overflow stress | `de` |  |  |  |  |  |
| Chinese rendering | `zh-Hans` |  |  |  |  |  |
| Keyboard safety |  |  |  |  |  |  |
