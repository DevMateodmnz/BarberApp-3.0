# Manual QA — appointment email reminders

Run only the new notification flows for this milestone.

## A — Staff appointment with email

1. Open a customer detail with an email saved.
2. Tap **Create appointment**.
3. Confirm name, phone, and email are prefilled.
4. Create an appointment more than 24 hours in the future.
5. Confirm the appointments list shows reminder status text.
6. Confirm the notification API returns confirmation + reminder summaries.

## B — Local email capture with Mailpit

1. Start Mailpit with `docker compose up -d mailpit`.
2. Open `http://localhost:8025`.
3. Create a future appointment with email.
4. Run the worker once.
5. Confirm the booking-confirmation email appears.
6. Verify the message shows barbershop, service, barber, local date/time, and no internal IDs.
7. Verify both text and HTML bodies render correctly.

## C — Reminder worker idempotency

1. Seed or create a due reminder notification.
2. Run `npm run notifications:worker --workspace @barberapp/api -- --once`.
3. Confirm exactly one reminder email appears.
4. Run the worker again.
5. Confirm no duplicate reminder is delivered.

## D — Public cancellation cancels pending reminders

1. Create a public booking with email more than 24 hours in the future.
2. Confirm reminder rows exist and are `PENDING`.
3. Cancel through the real public confirmation flow.
4. Confirm reminder rows become `CANCELLED`.
5. Run the worker once.
6. Confirm no reminder email is delivered after cancellation.
