# Manual QA — Promotions and Coupons

## Goal

Validate the complete coupon vertical slice across OWNER mobile, staff booking, public web, pricing snapshots, and redemption lifecycle.

## Preconditions

- local API running with the promotions migration applied
- mobile signed in as OWNER
- at least two active services
- one published public-booking shop
- Mercado Pago sandbox remains optional; include both deposit and zero-price cases

## OWNER mobile promotion management

1. Open **Manage -> Promotions**.
2. Confirm summary metrics render.
3. Pull to refresh; verify list refreshes without duplicating rows.
4. Verify filter chips:
   - All
   - Active
   - Upcoming
   - Expired
   - Inactive
5. Create a fixed discount promotion scoped to all services.
6. Create a percentage promotion scoped to selected services only.
7. Configure:
   - public-only
   - staff-only
   - both channels
   - total limit
   - per-customer limit
   - minimum price
8. Open detail for each promotion.
9. Verify detail shows:
   - code
   - discount type
   - validity window
   - scope
   - channel controls
   - immutable-after-use hint
10. Deactivate and reactivate a promotion.
11. After first redemption exists, verify editing remains limited to future-facing fields only.
12. Verify redemption history shows no phone numbers or email addresses.

## Staff appointment creation coupon flow

1. Open **Appointments -> New** as OWNER.
2. Start an ordinary booking with no code; confirm submission still works.
3. Enter a valid coupon and tap **Apply**.
4. Verify quoted values show:
   - original price
   - discount
   - final price
5. Change the service; verify the quote clears.
6. Reapply the coupon on the new service.
7. Change the customer phone; verify the quote clears and asks to reapply.
8. Confirm customer-detail prefill still fills name/phone/email.
9. Confirm agenda-gap prefill still keeps the chosen date/time.
10. Create the appointment and verify the final booking used the discounted total.

## Public web coupon flow

1. Open the public booking page.
2. Create a normal booking with no coupon.
3. Repeat with a valid coupon.
4. Verify quote shows:
   - original price
   - discount
   - final total
   - discounted deposit / remaining balance when deposit policy is enabled
5. Change the service; verify the quote is cleared and must be reapplied.
6. Change the phone after quoting; verify the quote is cleared and reapply copy appears.
7. Try an invalid / expired / wrong-service code; verify only the generic unavailable message is shown.
8. Confirm the coupon code does not appear in the page URL.
9. Create a 100% discount booking; verify CTA changes to free confirmation and no Mercado Pago step is required.
10. Retry the same booking submission after a network interruption; verify idempotent recovery does not create duplicates.

## Lifecycle and accounting checks

1. Book a discounted public appointment with deposit pending.
2. Verify redemption starts as `RESERVED`.
3. Cancel before approval or let the hold expire.
4. Verify redemption becomes `RELEASED` exactly once and counters do not go negative.
5. Create another discounted booking and fully confirm it.
6. Verify redemption becomes `CONSUMED`.
7. Cancel the confirmed booking.
8. Verify consumed usage is not automatically restored.
9. Reschedule the booking to the same service; verify pricing and redemption remain unchanged.
10. Attempt a paid repricing reschedule to a different service; verify the API rejects it safely.

## Snapshot verification

For at least one discounted appointment, inspect owner/staff-visible detail surfaces and confirm:

- service price snapshot is preserved
- discount snapshot is preserved
- final price snapshot is preserved
- notification copy matches the same snapshot

## Expected log/privacy checks

While running QA, confirm no raw logs expose:

- customer emails
- customer phone numbers in promotion audit endpoints
- coupon codes in URLs
- Mercado Pago checkout URLs in screenshots or shared notes
