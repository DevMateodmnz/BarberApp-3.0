# Loyalty Manual QA

## Goal

Verify the visit-based loyalty flow added on Thursday, July 16, 2026.

## Preconditions

- API and mobile app running against a local environment
- OWNER account and BARBER account available
- loyalty template promotion created
- customer exists in the target barbershop

## OWNER program setup

1. Open **Manage → Promotions**.
2. Open the loyalty block.
3. Enable the program.
4. Set visits required to `2`.
5. Select a reward promotion template.
6. Optionally set reward validity days.
7. Save.
8. Confirm the success message appears and the page reloads with the saved values.

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
3. Confirm the quote succeeds.
4. Repeat with another phone number.
5. Confirm the public response is a generic unavailable error.

## Ledger

1. Re-open **Manage → Promotions**.
2. Inspect the recent loyalty ledger block.
3. Confirm it shows stamp-earned and reward-issued/redeemed entries in reverse chronological order.

## Regression spot-checks

1. Create a normal appointment without a reward code.
2. Confirm booking still succeeds.
3. Apply a normal non-loyalty promotion.
4. Confirm coupon quoting still works.
