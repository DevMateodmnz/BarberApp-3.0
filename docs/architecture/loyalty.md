# Loyalty Rewards

> Source of truth for BarberApp's tenant-scoped, visit-based loyalty program that issues customer-bound rewards through the existing promotions and redemption engine.

## Scope

Implemented in this milestone:

- one loyalty program per barbershop
- OWNER-configurable visit threshold (`2..20`)
- optional reward validity window in days
- one eligible completed appointment = one stamp
- atomic, idempotent stamp earning on `IN_PROGRESS -> COMPLETED`
- cached customer loyalty summary backed by an immutable ledger
- customer-bound, opaque, single-use reward codes
- reward issuance backed by cloned promotions that reuse the existing discount engine
- staff/OWNER loyalty reads, OWNER configuration, OWNER ledger inspection, and OWNER admin stamp adjustments
- mobile OWNER loyalty controls inside the promotions surface
- customer profile loyalty summary for staff operations

Explicitly deferred:

- spend-based points
- reward stacking
- anonymous loyalty lookup by phone
- customer accounts
- outbound loyalty notifications
- cross-shop loyalty
- automatic reward restoration after later cancellation

## Core invariants

- loyalty is scoped by `barbershop_id`
- only `COMPLETED` appointments earn stamps
- one appointment may earn at most one stamp
- stamp earning is database-enforced idempotent through `loyalty_ledger_events(source_appointment_id, event_type)`
- rewards are bound to one customer and one barbershop
- rewards reuse `promotions`, `promotion_services`, `promotion_redemptions`, and pricing snapshots
- reward codes are opaque, non-enumerable, and single-use
- all money remains integer cents only

## Data model

### `barbershop_loyalty_programs`

One row per barbershop:

- `is_enabled`
- `visits_required`
- `reward_promotion_id` (template promotion chosen by OWNER)
- `reward_validity_days`
- create/update audit user/timestamps

The template promotion is never redeemed directly as a loyalty reward. Instead, it defines the reward semantics that are cloned into issued customer reward promotions.

### `customer_loyalty_summaries`

Cached operational summary per customer:

- `current_stamp_count`
- `lifetime_eligible_visits`
- `available_reward_count`
- `last_earned_at`

This is a transactional cache, not the source of truth. The ledger remains canonical.

### `loyalty_rewards`

One row per issued reward:

- bound customer / barbershop / loyalty program
- generated promotion id
- optional source appointment id
- status (`AVAILABLE`, `REDEEMED`, `EXPIRED`, `REVOKED`)
- issued / expires / redeemed / revoked timestamps
- optional redemption appointment id

### `loyalty_ledger_events`

Immutable audit trail:

- `STAMP_EARNED`
- `REWARD_ISSUED`
- `REWARD_REDEEMED`
- `REWARD_EXPIRED`
- `REWARD_REVOKED`
- `ADMIN_ADJUSTMENT`

Each row stores customer, shop, optional program, optional reward, optional source appointment, actor, reason, deltas, metadata, and timestamp.

## Eligibility

An appointment earns one stamp only when all of these are true:

- appointment authoritatively transitions to `COMPLETED`
- loyalty program exists and is enabled
- appointment belongs to the same barbershop as the program
- appointment is linked to a first-class customer record
- no prior `STAMP_EARNED` ledger event exists for that appointment

`PENDING`, `CONFIRMED`, `IN_PROGRESS`, `CANCELLED`, and `NO_SHOW` do not earn loyalty.

## Completion integration

Loyalty earning runs inside the authoritative appointment transition transaction.

Flow:

```text
compare-and-swap appointment status
-> stamp lifecycle timestamp
-> cancel reminder notification if needed
-> create STAMP_EARNED ledger row (skip on duplicate)
-> update customer loyalty summary
-> issue one reward for each completed threshold
-> return updated appointment
```

This keeps loyalty aligned with the same race-safe completion path already used by the appointment lifecycle.

## Reward issuance

When `current_stamp_count + earned_delta >= visits_required`:

```text
consume threshold-sized stamps
-> clone the configured reward template promotion
-> generate opaque reward code
-> create loyalty_rewards row
-> create REWARD_ISSUED ledger event
-> increment available_reward_count
```

Remainders are preserved in `current_stamp_count`.

## Reward promotion reuse

Issued rewards reuse the existing promotion engine by cloning the configured template promotion into a customer-specific promotion row.

Cloned fields:

- discount type and value
- service scope and selected services
- minimum price
- public/staff channel flags

Issued reward overrides:

- opaque generated code
- single active redemption limit
- single-customer binding through `loyalty_rewards`
- issue/expiry window derived from loyalty policy

## Validation and redemption

Promotion evaluation now adds a loyalty-specific guard when the promotion belongs to a loyalty reward:

- customer identity is required
- customer id must match the intended reward owner
- reward status must still be `AVAILABLE`
- expired rewards are lazily marked expired with a ledger event before failing

The staff customer-lookup response now also returns the matched `customerId` plus a bounded loyalty summary so the appointment-create flow can safely show stamp progress and offer available reward shortcuts without exposing another customer's reward state.

Authoritative redemption keeps the existing promotion lifecycle:

```text
quote
-> reserve or consume promotion redemption via existing booking flow
-> on authoritative consumption mark loyalty reward REDEEMED
-> decrement available_reward_count
-> write REWARD_REDEEMED ledger event
```

Previewing does not consume the reward. Failed booking creation does not consume the reward.

## Discount and deposit order

The canonical order remains unchanged:

```text
service base price
-> promotion / loyalty reward discount
-> final service price snapshot
-> deposit policy preview or hold against final price
```

Negative totals are clamped to zero by the existing promotion calculation.

## Policy changes

- disabling the loyalty program stops future earning only
- existing stamps remain in the summary
- existing issued rewards remain available until redeemed, expired, or revoked
- changing the threshold is forward-looking; current summary state is preserved, config changes alone do not issue rewards, and a lower threshold can produce multiple rewards on the next qualifying earning/admin-adjustment write if the carried stamp balance exceeds the new target

## Privacy and authorization

- no anonymous loyalty lookup endpoint exists
- no phone numbers are placed in GET query parameters for loyalty reads
- OWNER configures programs and can inspect the ledger
- OWNER and BARBER can read a scoped customer loyalty summary
- BARBER cannot configure the loyalty program or make admin adjustments
- cross-tenant access follows the repository's normal hidden-not-found behavior

## Expiration and rollback notes

Reward expiration is lazily materialized: reads/evaluations expire stale `AVAILABLE` rewards and append `REWARD_EXPIRED` events.

Migration rollback is not lossless once new loyalty rows exist. Rolling back the schema would require destructive data handling for loyalty tables and issued reward history.
