# Promotions, Coupon Codes, and Redemption Audit

> Source of truth for BarberApp's tenant-scoped coupon rules, immutable pricing snapshots, atomic usage limits, redemption lifecycle, and public/staff booking integration.

## Scope

Implemented in this milestone:

- owner-managed promotion list, detail, create, edit, activate, and deactivate flows
- fixed-amount and percentage discounts
- normalized coupon codes (`trim -> uppercase -> collapse whitespace`)
- all-services or selected-services scope
- public and staff channel eligibility
- total active-usage limits and per-customer active-usage limits
- minimum service-price eligibility
- immutable appointment and notification pricing snapshots
- public booking quotes, staff quotes, and redemption audit history
- atomic reserved / consumed / released lifecycle
- zero-final-price bookings without Mercado Pago

Explicitly deferred:

- promotion stacking
- automatic restoration of consumed usage on cancellation
- customer-facing promotion discovery
- bulk import/export tools

## Core invariants

- every promotion is tenant-scoped by `barbershop_id`
- coupon codes are unique per tenant on `code_normalized`
- all money uses integer cents only
- `finalPriceCents = servicePriceCents - discountCents`
- client-submitted price fields are ignored; the server is authoritative
- one promotion redemption may exist per appointment at most
- notification payloads keep the appointment pricing snapshot taken at scheduling time
- promotions never stack in this milestone

## Discount calculation

### Fixed discount

```text
final = max(servicePriceCents - fixedDiscountCents, 0)
```

### Percentage discount

```text
raw = servicePriceCents * percentageBasisPoints / 10000
roundedDiscount = Math.floor((servicePriceCents * basisPoints + 5000) / 10000)
final = max(servicePriceCents - roundedDiscount, 0)
```

Notes:

- basis points are used instead of floating-point percentages
- rounding is deterministic and integer-only
- discount is clamped so the final price never goes below zero

## Code normalization

Input codes are normalized before lookup and persistence:

```text
trim -> uppercase -> remove internal whitespace runs
```

Examples:

- `" bienvenida 25 " -> "BIENVENIDA25"`
- `"vip_aug" -> "VIP_AUG"`

Accepted characters after normalization:

- letters
- numbers
- `_`
- `-`

Length bounds: `3..32` characters.

## Eligibility model

A promotion is available only when all of these are true:

- not deleted
- active
- current time is within `[startsAt, endsAt)`
- booking channel is allowed (`PUBLIC`, `STAFF`, or both)
- service matches the configured scope
- service price meets `minimumPriceCents` when present
- global active-redemption limit is not exhausted
- per-customer active-redemption limit is not exhausted when configured

For public booking, failures are intentionally collapsed into a generic safe error so internal policy details are not exposed.

## Atomic usage accounting

Two counters are maintained:

- promotion-level `active_redemption_count`
- optional per-customer `promotion_customer_usages.active_redemption_count`

Reservation increments use SQL compare-and-swap updates inside the same transaction that creates the appointment / payment hold. This prevents non-atomic "check then write" races.

Guards:

- no negative counters
- no double-decrement on `RESERVED -> RELEASED`
- no record may be both `CONSUMED` and `RELEASED`
- consumed cancellations do not automatically restore usage
- unpaid / unapproved flows release reserved usage exactly once

## Redemption lifecycle

```text
quote eligible
-> reserve usage
-> create appointment snapshot + promotion_redemption(RESERVED)
-> either
   - payment approved / confirmed booking -> CONSUMED
   - unpaid cancellation / hold expiration / payment rejection / creation failure -> RELEASED
```

### Reserved

Used for:

- unpaid public holds
- any provisional usage that must block double-spend before final confirmation

### Consumed

Used when the booking becomes final and the discount is actually spent.

### Released

Used when the provisional hold must be returned safely.

Supported release reasons:

- `HOLD_EXPIRED`
- `PAYMENT_REJECTED`
- `PAYMENT_CANCELLED`
- `PUBLIC_CANCELLED`
- `PREFERENCE_CREATION_FAILED`

## Appointment and payment snapshots

Appointments now persist:

- `service_price_cents`
- `discount_cents`
- `final_price_cents`

Why:

- later service-price edits must not rewrite booked history
- queued emails and payment review surfaces must display the original commercial truth
- cancellation / reschedule rules need a stable reference for repricing decisions

Deposit calculations use `finalPriceCents`, not the undiscounted service price.

## Public booking integration

Public web supports:

- optional coupon input
- quote / remove
- generic unavailable message
- idempotent replay with normalized promotion code included in the request fingerprint
- discounted deposit and remaining balance disclosure
- zero-price bookings without Mercado Pago checkout creation
- revalidation when the service changes
- revalidation when the customer phone changes after quoting

Privacy rules:

- coupon code is not placed in URLs
- internal eligibility reasons are not exposed on public failures
- public logs must not include raw customer phone/email or provider payloads

## Staff booking integration

Staff booking supports:

- optional promotion code on appointment creation
- server-side quote
- apply / remove without blocking ordinary booking
- final payload carries only the normalized code
- customer-detail prefill and agenda-gap prefill continue to work
- changing service clears the quote
- changing customer phone clears quote-dependent eligibility and asks staff to reapply
- stale quote responses are ignored by request-id guards

## Rescheduling rules

### Same-service reschedule

- preserve existing price snapshot
- preserve the existing redemption row

### Service-changing unpaid reschedule

- re-evaluate the promotion against the new service
- if there is no redemption to preserve, reset to full service price

### Service-changing approved paid reschedule

- repricing is rejected with `PAID_APPOINTMENT_REPRICE_NOT_SUPPORTED`
- this milestone does not silently mutate an approved payment contract

## Cancellation behavior

- unpaid or unapproved flows may release a reserved redemption
- confirmed / consumed promotions are not automatically restored on later cancellation
- there is no coupon stacking or loyalty carry-forward yet

## Notification pricing snapshots

Notification payloads render from stored appointment snapshot data.

That means:

- original price
- discount
- final total
- promotion name when present

stay stable even if the underlying service or promotion changes later.

## Privacy and abuse prevention

- owner redemption history shows safe customer display names only; no phone/email fields
- public quote failures are generic
- per-customer limits require a customer identity anchor; public phone lookups are normalized internally
- usage counters are server-owned and never trusted from the client

## Future reuse

This milestone intentionally lays the groundwork for future loyalty features:

- normalized customer identity anchors
- immutable pricing snapshots
- atomic counters
- safe public failure surfaces

Loyalty is explicitly deferred until this coupon foundation is pushed and physically QA'd.


## Loyalty reward integration

Loyalty now reuses this engine by cloning a configured promotion template into an opaque, customer-bound reward promotion at issuance time. Reward validation still flows through `evaluatePromotion(...)`, and authoritative consumption still flows through `promotion_redemptions`, so there is no second discount engine.
