# Appointment rescheduling manual QA

> Deferred physical QA is allowed for this milestone; this checklist is
> the follow-up script for targeted manual verification.

## 1. Staff reschedule on mobile

1. Open a future confirmed appointment.
2. Tap **Reprogramar turno**.
3. Change employee, service, date, and slot.
4. Enter an optional internal reason.
5. Confirm the **Horario anterior / Nuevo horario** summary.
6. Save.

Expected:

- success toast/banner appears;
- the appointments list refreshes without duplicate rows;
- ineligible appointments do not show the action.

## 2. Audit history

1. Open the same appointment’s reschedule surface again.
2. Confirm the history section lists:
   - previous date/time;
   - new date/time;
   - previous/new employee or service when changed;
   - actor display name;
   - optional reason.

## 3. Reminder synchronization

1. Reschedule an appointment from more than 24 hours away to another
   date still more than 24 hours away.
2. Confirm the old reminder row is cancelled and a new one exists.
3. Reschedule another appointment to within 24 hours.
4. Confirm the obsolete reminder is cancelled and no impossible new
   `REMINDER_24H` row exists.

## 4. Reschedule email

1. Create or use an appointment with `clientEmail`.
2. Reschedule it.
3. Run the notification worker / deferred SMTP smoke later.

Expected email copy:

- “Tu turno fue reprogramado …”
- previous/new schedule clarity
- current public cancellation link when available

## 5. Public confirmation compatibility

1. Create a public booking.
2. Reschedule it from the staff flow.
3. Open the confirmation URL with `?ref=<publicReference>`.

Expected:

- current schedule is shown, not the stale original time;
- the same public reference still cancels the updated appointment when
  it remains eligible.
