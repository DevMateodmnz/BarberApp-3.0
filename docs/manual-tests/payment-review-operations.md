# Payment Review Operations Manual Test Plan

> Deferred manual QA checklist for the financial review milestone.

## OWNER checks

- [ ] Open **Pagos y señas** and confirm the **Revisiones de pago** summary shows Abiertas / En revisión / Resueltas recientemente.
- [ ] Filter the list by Abiertas, En revisión, and Resueltas.
- [ ] Open a review detail and verify customer name, service, appointment date/time, payment state, review reason, review status, and timeline.
- [ ] Start a review and confirm the status moves to En revisión.
- [ ] Add a note and confirm it appears in the append-only history.
- [ ] Resolve with **Reintegrado externamente** and confirm the warning makes clear BarberApp did not execute the refund.
- [ ] Resolve with **Otro** and confirm a note is required.
- [ ] Reopen a resolved review and confirm the resolution clears while history remains.
- [ ] Confirm conflicts show deterministic feedback when the same review is changed from another session.

## BARBER checks

- [ ] Open an appointment tied to an open payment review.
- [ ] Confirm the badge is safe-only (`Seña pagada`, `Seña pendiente`, or `Revisión de pago necesaria`).
- [ ] Confirm BARBER cannot see internal review notes, provider-event detail, or resolution controls.

## Public-web checks

- [ ] Visit a booking confirmation page for a review-required payment.
- [ ] Confirm the page says `Pago en revisión` and `La barbería debe revisar el pago antes de confirmar el turno.`
- [ ] Confirm no internal reason, provider ID, or staff note is shown.

## Explicitly deferred

- [ ] automatic Mercado Pago refunds
- [ ] settlement reconciliation
- [ ] commissions / marketplace fees
- [ ] production credential activation
