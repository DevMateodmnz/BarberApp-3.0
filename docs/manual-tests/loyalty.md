# Loyalty Manual QA

## Goal

Verify the visit-based loyalty flow added on Thursday, July 16, 2026.

## Preconditions

- `npm run qa:physical:status` reports the current runtime `READY`
- the phone badge matches the harness runtime fingerprint and short HEAD
- `npm run qa:physical:device` reports `DEVICE_READY`
- `npm run qa:physical:ready` reports `QA_READY`
- `npm run qa:physical:arm -- loyalty-program-save` succeeds and captures the
  timestamped pre-action snapshot
- OWNER account and BARBER account available
- loyalty template promotion created
- customer exists in the target barbershop

Do not treat old PID notes, Metro listening, a historical device IP, a visible
Expo screen, or a success toast as
authoritative. The runtime must prove current PIDs, listeners, working
directories, API URL/identity, shared database target, Metro process, current
readiness timestamp, matching app HEAD, successful handshake, and recent
heartbeat. Database snapshots remain authoritative for persisted product state.

## OWNER program setup

1. Open **Manage → Promotions**.
2. Open the loyalty block.
3. Enable the program.
4. Set visits required to `2`.
5. Select a reward promotion template.
6. Optionally set reward validity days.
7. Without pressing Save, have the verifier arm the checkpoint:
   `npm run qa:physical:arm -- loyalty-program-save`.
8. Follow only the one concise human action printed by the arm command: leave
   the numeric keyboard open and tap **Save loyalty program** exactly
   once. The same tap must reach the button; dismissing the keyboard must not
   require a second tap.
9. Confirm the button visibly enters its loading state. Success must appear
   only after the API response, and the unsaved-state indicator must clear only
   after the authoritative returned values are applied.
10. Run:
   `npm run qa:physical:evidence -- mobile-action loyalty-program-save`
11. Require `press_received`, `mutation_started`, a correlated successful API
    request, and `authoritative_state_applied`. A value still visible in the
    input is not evidence that Save ran.
12. Capture a post-action loyalty snapshot and verify the authoritative
   `visitsRequired` and `updatedAt` changed exactly once.

If validation or the request fails, require a visible inline error, no success
state, the entered values to remain available for correction, and a safe trace
classification. Do not infer a request from Metro silence unless the current
runtime has both mobile and API tracing enabled.

The prior Checkpoint A attempt on July 24, 2026 remains invalid: evidence was
`PRESS_NOT_OBSERVED`, no mobile event or API request existed, and the database
stayed at threshold `5`. It occurred before device identity/heartbeat proof and
must not be credited. Historical Checkpoints C–H also remain invalid.
Re-execute them only after a newly armed OWNER setup action is classified
`AUTHORITATIVE_SUCCESS`; never retroactively credit old visual states or quote
previews.

## Stamp earning

1. Create a staff appointment for an existing customer.
2. Move it to `IN_PROGRESS`.
3. Complete it.
4. Open the customer profile.
5. Confirm the loyalty summary shows `1 / 2` stamps and `0` available rewards.
6. Repeat with a second eligible completed appointment.
7. Confirm the customer profile now shows `0 / 2` stamps and `1` available reward.

## Staff redemption

1. Open the same customer in staff appointment creation.
2. Confirm the loyalty panel shows current stamps, available reward count, and the active reward code/expiry.
3. Apply the reward from the loyalty panel shortcut (or manually use the same code from the customer profile).
4. Confirm the quoted discount matches the template reward semantics.
5. Save the appointment.
6. Re-open the customer profile.
7. Confirm the reward is now marked redeemed and available rewards return to `0`.

## Customer binding

1. Try the same reward code for a different customer.
2. Confirm the quote fails safely and does not reveal another customer's reward details.

## Public booking redemption

1. Start a public booking for the same customer phone.
2. Enter the reward code.
3. Confirm the quote preview succeeds. A **quote preview** only computes price
   and eligibility; it creates no appointment and redeems nothing.
4. Submit the booking. **Appointment creation** is authoritative only when the
   API persists the appointment and returns a booking reference.
5. Confirm the authoritative booking confirmation appears with that reference.
6. Confirm the appointment exists and the reward is persisted as redeemed for
   that appointment. **Reward redemption** is a persisted reward transition,
   not a successful quote.
7. Use a fresh available reward and repeat the quote with another phone number.
8. Confirm the public response is a generic unavailable error and no appointment or redemption is created.

**Appointment completion** is a separate staff lifecycle transition. Only a
successful persisted completion can earn a stamp and potentially trigger
**reward issuance**. A preview, creation, or in-progress appointment must not be
counted as completion or issuance.

## Ledger

1. Re-open **Manage → Promotions**.
2. Inspect the recent loyalty ledger block.
3. Confirm it shows stamp-earned and reward-issued/redeemed entries in reverse chronological order.

## Regression spot-checks

1. Create a normal appointment without a reward code.
2. Confirm booking still succeeds.
3. Apply a normal non-loyalty promotion.
4. Confirm coupon quoting still works.
