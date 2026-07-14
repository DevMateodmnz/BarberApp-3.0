# Manual QA — Appointment lifecycle and customer insights

> Manual verification for the Phase 1 lifecycle and repeat-customer
> features. Run after a fresh build on the target device/emulator.
> These flows are also covered by automated tests; this guide is
> for cases where you need a human in the loop.

## Prerequisites

- Local API on `:3000` (`npm run dev --workspace @barberapp/api`)
- Local mobile app on Expo
- Local public-web on `:3001` (`npm run dev --workspace @barberapp/public-web`)
- Two seeded barbershops with a real `publicSlug` so the
  confirmation page renders. The QA bootstrap
  (`npm run qa:bootstrap --workspace @barberapp/api`) creates one
  for Nice Barber.

## A. Repeat-customer warning on staff appointment creation

### Goal

Confirm the staff appointment-creation screen shows a small
neutral warning banner when the typed phone matches a customer
with **prior no-shows**. A repeat customer with no no-shows
must not be treated as risky.

### Steps

1. Sign in as OWNER of shop A.
2. Open the **Appointments** tab → **+ Nuevo turno**.
3. Pick an employee and a service, pick a date and a slot.
4. In the **Cliente** section, type a phone that has zero history
   in this barbershop (e.g. `+5493815559999`).
5. Wait 500ms. Verify **no banner** appears.
6. Type a phone that has only `COMPLETED` history in the same
   barbershop. Verify **no banner** appears (a loyal customer
   is not risky).
7. Type a phone that has only `CANCELLED` history. Verify
   **no banner** appears.
8. Type a phone that has exactly one prior `NO_SHOW` row. Wait
   500ms. Verify the neutral banner appears. Spanish copy:
   - Title: `Historial del cliente`
   - Body: `Este cliente registra 1 inasistencia anterior. La
     última fue el <date>.`
9. Type a phone that has three prior `NO_SHOW` rows. Verify the
   body uses plural form: `Este cliente registra 3 inasistencias
   anteriores. La última fue el <date>.`
10. Type a phone whose `NO_SHOW` rows have a NULL `noShowAt`
    timestamp (legacy data). Verify the body uses the generic
    form without a date: `Este cliente registra 2 inasistencias
    anteriores.`
11. Edit the phone to a different number. The banner should
    disappear after the debounce window.

### Pass criteria

- Banner appears within 600ms of typing a known no-show phone.
- Banner disappears when the phone changes to a non-matching
  number.
- Banner does not appear for non-E.164 partial input.
- Banner does not appear for cross-tenant phones (the lookup
  endpoint returns a zeroed-out payload, not an error).
- Banner is NOT shown when the customer only has completed or
  cancelled visits — only when `noShowCount > 0`.
- Banner has `accessibilityRole="alert"` for screen readers.
- Copy uses neutral wording; no "reincidente", "recidivo", or
  stigmatizing labels.

## B. Cancel-with-reason from the staff appointments list

### Goal

Confirm the `DELETE /api/v1/appointments/:id` endpoint records
the actor, timestamp, and reason when the OWNER cancels.

### Steps

1. Sign in as OWNER.
2. Create a CONFIRMED appointment for the future.
3. Open the **Appointments** tab and locate it.
4. Tap the **Cancelar** action. (For this milestone the mobile
   cancel UI does not yet prompt for a reason — that modal is
   deferred. The reason is recorded as `NULL`.)
5. Verify the appointment disappears from the day list and the
   next data load does not bring it back.
6. Open the database and confirm the row:
   - `status = 'CANCELLED'`
   - `cancelled_at` is recent
   - `cancelled_by_role = 'OWNER'`
   - `cancel_reason IS NULL`

### Pass criteria

- The cancel action succeeds.
- The row in the database has the four expected fields.
- The appointment is not selectable for any further transition.

> When the mobile cancel-with-reason modal lands (a later
> milestone), repeat this check with a non-empty reason to
> confirm the column is populated.

## C. Public cancel by reference

### Goal

Confirm the anonymous public cancel flow works end-to-end and
the future-start cutoff prevents a customer from retroactively
cancelling a missed appointment.

### Steps

1. Open the public booking page for a published barbershop and
   submit a CONFIRMED booking.
2. On the confirmation page, copy the `Referencia` (it starts
   with `pb_` and is now 23 characters long: 3-char prefix +
   20 base32 chars).
3. Click **Cancelar mi reserva**.
4. Verify a small modal appears with an optional "Motivo" field
   and two buttons: "Sí, cancelar reserva" and "Volver".
5. Type a reason (or leave it blank), click **Sí, cancelar
   reserva**.
6. Verify the page transitions to a success state showing
   "Tu reserva fue cancelada", the reference, and the reason if
   you provided one.
7. Open the database and confirm:
   - `status = 'CANCELLED'`
   - `cancelled_at` is recent
   - `cancelled_by_role IS NULL` (anonymous actor)
   - `cancellation_source = 'PUBLIC_BOOKING'`
   - `cancel_reason` matches what you typed (NULL if blank)

### Pass criteria for the happy path

- The modal renders correctly on small (≤360px) and large
  (≥768px) viewports.
- Typing in the reason field does not let you exceed 500
  characters.
- The success state does not show the original confirmation
  details.
- The database row is updated atomically with
  `cancellation_source = 'PUBLIC_BOOKING'` and
  `cancelled_by_role = NULL`.

### Pass criteria for the future-start cutoff

1. Create a CONFIRMED booking whose `startAt` is 1 hour in the
   future. Confirm the public cancel succeeds (already covered
   above).
2. Create a CONFIRMED booking whose `startAt` is 1 minute in
   the past. Open the cancel flow. Verify the cancel request
   returns `409 PUBLIC_BOOKING_CANCELLATION_CLOSED` and the row
   stays in `CONFIRMED`.
3. Create a CONFIRMED booking whose `startAt` is exactly now.
   The public cancel should also return
   `409 PUBLIC_BOOKING_CANCELLATION_CLOSED` (boundary is closed).
4. The success-state UI must NOT show for any closed-window
   cancel.

### Pass criteria for idempotency

1. After a successful cancel, refresh the confirmation page.
2. Click **Cancelar mi reserva** again. The cancel attempt
   should return `409 PUBLIC_BOOKING_ALREADY_TERMINAL` with a
   stable message; the success state should render with the
   original reference and reason.

## D. Cross-tenant hiding on customer lookup

### Goal

Confirm the lookup endpoint never returns data from a different
barbershop and never reveals that the foreign barbershop exists.
Confirm the new POST contract hides the phone from URLs.

### Steps

1. Sign in as OWNER of shop A.
2. Create three `NO_SHOW` appointments for the same phone
   `+5493815551111` in shop A.
3. Sign in as OWNER of shop B.
4. In shop B, manually insert one `NO_SHOW` row for the same
   phone using the database directly (this is the only way to
   pre-load the fixture).
5. As OWNER of shop A, navigate to the appointments list and
   open the appointment creation screen. Type the phone. Wait
   for the lookup.
6. Verify the banner shows `3 inasistencias` (shop A only).
7. As OWNER of shop B, do the same. Verify the banner shows
   `1 inasistencia`.
8. Open the browser dev tools. Verify the lookup network call
   is `POST .../customers/lookup` (not `GET ...?phone=...`) and
   the phone is in the request body, not the URL.
9. Verify the response body does NOT include the phone number
   in any field.

### Pass criteria

- The lookup is strictly per-tenant. Shop A never sees shop B's
  row and vice versa.
- The lookup endpoint returns 404 (not 403) if an OWNER probes
  a barbershop they do not own.
- The mobile UI gracefully treats 404 as "no history" (zeroed
  counts, no banner).
- The HTTP method is `POST` (not `GET`) and the phone is in the
  request body, never the URL or a query string.
- The response body does not include the phone number.

## E. Terminal-state immutability

### Goal

Confirm terminal-state appointments cannot be re-transitioned,
and that the `cancellation_source` enum is stamped correctly for
each actor.

### Steps

1. As OWNER, find a `CANCELLED` appointment.
2. Try to transition it to `CONFIRMED` (or any other status)
   using a direct API call.
3. Verify the response is `400` with a `BAD_REQUEST` error
   message mentioning "terminal".
4. Repeat for `COMPLETED` and `NO_SHOW`.

### Pass criteria

- All three terminal states reject any transition with the
  expected error.

### Cancellation source audit

For each cancellation path, confirm the row in the database:

| Path | `cancelled_by_role` | `cancellation_source` |
| --- | --- | --- |
| OWNER cancels a CONFIRMED appointment | `OWNER` | `STAFF` |
| BARBER cancels a CONFIRMED appointment | `BARBER` | `STAFF` |
| CLIENT (authenticated) self-cancels a future appointment | `CLIENT` | `AUTHENTICATED_CLIENT` |
| Anonymous public cancel-by-reference | `NULL` | `PUBLIC_BOOKING` |
| Automated no-show sweep (future) | `NULL` | `SYSTEM` |

## F. Regression sanity

### Goal

Confirm the lifecycle changes did not regress existing flows.

### Steps

1. Create a new appointment as OWNER via the staff flow.
2. Transition it through `PENDING → CONFIRMED → IN_PROGRESS →
   COMPLETED`. Verify each transition stamps the matching
   timestamp and the row is queryable.
3. Create a new public booking. Verify it lands in `CONFIRMED`
   and the `client_phone_normalized` is populated.
4. List appointments as OWNER, BARBER, and CLIENT (where
   applicable). Verify the new fields appear in the JSON
   response (`cancelledAt`, `cancelledByRole`, `cancelReason`,
   `clientPhoneNormalized`).
5. Run the public availability flow end to end. Verify the
   new schema does not break the GiST exclusion constraint.

### Pass criteria

- The full appointment workflow is unchanged from the staff's
  point of view.
- All 1222 automated tests pass.
- The public availability check still rejects overlapping
  bookings for active statuses.
