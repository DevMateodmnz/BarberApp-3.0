# Payment Review Operations

> Source of truth for BarberApp's durable money-exception workflow.

## Goal

Keep the provider/business payment state intact while giving the OWNER a
separate operational queue for exceptions that require human handling.

## Domain split

`booking_payments.status` remains the payment/business state:

- `CREATING`
- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
- `EXPIRED`
- `REFUNDED`
- `ERROR`

Operational review state now lives in `booking_payment_reviews`:

- `OPEN`
- `IN_PROGRESS`
- `RESOLVED`

This means a payment can stay `APPROVED` while also having an open review case.

## Review case reasons

- `APPROVED_AFTER_HOLD_EXPIRY`
- `APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT`
- `AMOUNT_MISMATCH`
- `CURRENCY_MISMATCH`
- `SELLER_MISMATCH`
- `EXTERNAL_REFERENCE_MISMATCH`
- `PREFERENCE_MISMATCH`
- `DUPLICATE_PROVIDER_PAYMENT`
- `PROVIDER_RECONCILIATION_ERROR`
- `OTHER`

## Automatic case creation

BarberApp opens or reopens a logical review case transactionally when:

- approval arrives after the local hold expired;
- an already-approved payment belongs to a cancelled appointment;
- authoritative reconciliation finds amount/currency/seller/reference/preference mismatches;
- the same provider payment is already linked elsewhere;
- reconciliation cannot complete safely.

Repeated provider events do not duplicate the same payment/reason case.

## Append-only review history

`booking_payment_review_actions` stores:

- `OPENED`
- `MARKED_IN_PROGRESS`
- `NOTE_ADDED`
- `RESOLVED`
- `REOPENED`

Notes are bounded to 1000 chars, staff-only, and never store raw provider
payloads, signatures, tokens, email addresses, or phone numbers.

## OWNER workflow

Endpoints:

- `GET /api/v1/barbershops/:barbershopId/payments/reviews/summary`
- `GET /api/v1/barbershops/:barbershopId/payments/reviews`
- `GET /api/v1/barbershops/:barbershopId/payments/reviews/:reviewId`
- `POST /api/v1/barbershops/:barbershopId/payments/reviews/:reviewId/start`
- `POST /api/v1/barbershops/:barbershopId/payments/reviews/:reviewId/notes`
- `POST /api/v1/barbershops/:barbershopId/payments/reviews/:reviewId/resolve`
- `POST /api/v1/barbershops/:barbershopId/payments/reviews/:reviewId/reopen`

Rules:

- OWNER-only mutations
- BARBER gets safe appointment badges only
- CLIENT gets no review access
- `OTHER` resolution requires a note
- manual review actions never call Mercado Pago
- `REFUNDED_EXTERNALLY` records an action performed outside BarberApp

## Concurrency

State transitions use compare-and-swap updates.

Supported transitions:

- `OPEN -> IN_PROGRESS`
- `OPEN -> RESOLVED`
- `IN_PROGRESS -> RESOLVED`
- `RESOLVED -> OPEN`

Conflicts return `PAYMENT_REVIEW_CONFLICT`.

## Safe timeline and provider visibility

Review detail exposes a deterministic local timeline assembled from:

- hold creation;
- preference creation;
- provider event receipt/processing;
- payment reconciliation outcome;
- appointment confirmation/release;
- review open/note/resolve/reopen actions.

OWNER-safe provider event visibility includes:

- received/processing/processed/failed/ignored status;
- attempt count;
- received timestamp;
- processed timestamp;
- last safe error code.

It excludes raw payloads, signatures, request IDs, and secrets.

## External refunds

Automatic Mercado Pago refund APIs remain deferred.

When staff resolve a case as `REFUNDED_EXTERNALLY`, BarberApp records that an
external action already happened. BarberApp does not execute that refund.

## Deferred

Still out of scope:

- automatic refunds;
- settlement reconciliation;
- commissions;
- subscriptions;
- payouts;
- accounting exports.
