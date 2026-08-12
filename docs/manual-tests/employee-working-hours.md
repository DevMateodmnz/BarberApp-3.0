# Manual Test Plan — Employee Working Hours and Time-Off Availability

> Deferred on purpose during implementation. Do **not** block development on running this checklist during the batch.

## Scope

Validate the employee-specific availability milestone across OWNER, BARBER, public booking, staff booking, rescheduling, and the daily Agenda.

## Preconditions

- A barbershop with at least two active barbers.
- At least one employee still inheriting barbershop hours.
- At least one employee switched to a custom weekly schedule.
- Existing appointments both inside and outside the employee's current schedule for conflict visibility checks.
- Public booking enabled for the barbershop slug.

## OWNER schedule-management checks

1. Open **Manage → Employees → [employee] → Schedule**.
2. Confirm the default mode is **Use barbershop hours** for legacy employees.
3. Switch to **Custom schedule** and save a narrower weekly window.
4. Confirm success feedback appears.
5. Use **Copy barbershop hours** and confirm the editable week is repopulated.
6. Save a full-day time off exception.
7. Save a special-hours exception for a different day.
8. Confirm the effective preview updates immediately.
9. Confirm the upcoming exceptions list reflects both entries.
10. Delete one exception and confirm the list refreshes.

## Conflict behavior

1. Narrow an employee schedule so a future appointment falls outside the new hours.
2. Save the schedule.
3. Confirm the schedule save still succeeds.
4. Confirm the UI shows a conflict warning and affected appointment summary.
5. Confirm the existing appointment still appears in the Agenda and appointment list.
6. Confirm the appointment was not auto-cancelled or auto-rescheduled.

## BARBER read-only checks

1. Sign in as a BARBER linked to an employee.
2. Open **Manage → My schedule**.
3. Confirm the schedule is visible.
4. Confirm weekly mode buttons, save actions, and exception mutations are not available.
5. Confirm upcoming time off is shown as operational availability only.
6. Confirm private administrative reasons are not exposed if policy keeps them hidden.

## Public booking checks

1. Configure employee custom hours that exclude part of a barbershop-open day.
2. Open public booking for that employee/service/date.
3. Confirm only valid slots are shown.
4. Add a full-day time off exception and confirm all slots disappear for that date.
5. Add special hours and confirm only the narrowed slot window appears.
6. Confirm the public UI does not reveal vacation / time-off reasons.

## Staff booking and rescheduling checks

1. In staff appointment creation, choose an employee with custom hours.
2. Confirm invalid slots are not returned.
3. Try a crafted invalid request if tooling is available; confirm deterministic rejection.
4. Reschedule an existing appointment into employee time off; confirm rejection.
5. Reschedule into a valid employee slot; confirm success.
6. Confirm a failed reschedule writes no schedule-change audit and does not mutate reminders.

## Daily Agenda checks

1. Open the Agenda on a date where one employee is working, one is off, and one has time off.
2. Confirm owner summary chips distinguish those states with localized labels.
3. Open an employee timeline with special hours.
4. Confirm working intervals and available gaps stay inside the effective employee schedule.
5. Confirm an existing out-of-hours appointment remains visible with an attention indicator.

## Regression checks

1. An inheriting employee should still behave exactly like the old barbershop-wide schedule.
2. Notification operations should still show existing appointments and reminders normally.
3. Customer directory history should remain unchanged except for legitimate appointment edits.
4. Public cancellation by reference should still work for appointments that happen to be outside a newly narrowed schedule.

## Explicitly deferred

Do not extend this manual plan into:

- payroll;
- attendance clock-in;
- leave approvals;
- automatic bulk rescheduling;
- Mercado Pago / deposits.
