# Manual Test Plan — Daily Schedule Board

This checklist is intentionally **deferred**. It documents the future targeted manual QA for the Operational Daily Schedule Board and its integrations. It was **not** executed in this batch.

## Quick path

1. Log in as OWNER and BARBER on the Expo mobile app.
2. Open `Turnos` and switch between `Lista` and `Agenda`.
3. Verify the operational scenarios below without changing production data.

## Preconditions

- A barbershop with at least two active employees.
- One day with working hours and at least one schedule exception.
- Appointments covering: `PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`, `CANCELLED`.
- At least one customer with completed history and one with previous no-shows.
- At least one failed appointment notification tied to a visible appointment.

## OWNER agenda flow

- [ ] Agenda/List switch preserves the appointment area instead of opening a new permanent tab.
- [ ] OWNER can see the `All` overview cards for active employees.
- [ ] OWNER can filter to one employee and return to `All`.
- [ ] Date navigation (`previous`, `today`, `next`) updates the agenda without losing the selected mode.
- [ ] Pull-to-refresh keeps the selected date and employee filter.

## BARBER agenda flow

- [ ] BARBER opens directly into their own schedule.
- [ ] BARBER cannot browse another employee through agenda filters.
- [ ] BARBER still sees existing allowed lifecycle actions only.

## Timeline and states

- [ ] Today shows a current-time marker.
- [ ] Another date does not show a current-time marker.
- [ ] Schedule exceptions render as readable closed intervals.
- [ ] Available gaps render between blocking appointments only.
- [ ] `COMPLETED`, `CANCELLED`, and `NO_SHOW` remain visible but do not block later gaps.
- [ ] No raw enum values appear in Spanish UI.

## Appointment cards

- [ ] Each card shows time range, customer, service, and status.
- [ ] Returning customers show the expected friendly label.
- [ ] Previous no-shows appear only when the count is greater than zero.
- [ ] Failed notifications appear as a concise delivery-error label.
- [ ] Tapping a card opens the canonical appointment detail screen.

## Gap-to-create flow

- [ ] Tapping `Crear turno` from a gap opens appointment creation.
- [ ] Employee is prefilled correctly.
- [ ] Date is prefilled correctly.
- [ ] Preferred start time is preselected when still valid.
- [ ] Service remains unselected until the operator chooses one.
- [ ] Selecting a service that does not fit the gap does not allow invalid submission.

## Detail and action reuse

- [ ] Appointment detail shows change history when reschedules exist.
- [ ] Appointment detail shows notification history when present.
- [ ] `Reprogramar` routes to the canonical reschedule flow.
- [ ] Lifecycle actions (`Iniciar`, `Completar`, `Marcar inasistencia`, `Cancelar`) behave consistently with the existing appointment flows.
- [ ] After an action, the agenda refreshes without resetting the selected date or employee.

## Timezone checks

- [ ] A UTC-near-midnight appointment appears on the correct local day.
- [ ] The `today` shortcut uses the barbershop timezone, not the device's server timezone assumption.
- [ ] Viewing tomorrow does not inherit today's current-time marker.

## Deferred related manual QA

The following existing areas remain deferred and should be revisited together in a later physical QA batch:

- appointment email reminders
- notification operations and retry
- appointment rescheduling and change history
- daily schedule board end-to-end operational flow
