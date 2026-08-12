# Deposit Payments and Reservation Holds

> Source of truth for BarberApp's tenant-scoped Mercado Pago deposit flow,
> temporary reservation holds, direct signed webhook processing, expiration races,
> and financial review operations.

## Scope

This milestone adds:

- barbershop-scoped deposit policy
- barbershop-scoped Mercado Pago OAuth connection
- encrypted access/refresh token storage
- public booking slot holds tied to `Appointment.status = PENDING`
- Mercado Pago Checkout Pro preference creation
- signed webhook inbox + worker reconciliation
- hold expiration worker
- owner/mobile payment visibility

Explicitly deferred:

- automatic refunds
- marketplace commissions / `marketplace_fee`
- settlements and reconciliation reports
- subscriptions or recurring billing
- other providers
- customer accounts

## Multi-tenant merchant architecture

BarberApp is a multi-tenant platform. Each barbershop connects **its own**
Mercado Pago seller account through OAuth. BarberApp never routes deposits for
multiple shops through one shared seller token.

```text
BarberApp platform
  -> Barbershop A OAuth connection -> seller token A -> seller A receives deposit
  -> Barbershop B OAuth connection -> seller token B -> seller B receives deposit
```

Why:

- tenant ownership must match the receiving merchant
- seller mismatches must be detectable during authoritative reconciliation
- future commission support must be layered on top of connected sellers, not by
  sharing credentials

## Deposit policy

Model: `BarbershopDepositPolicy`

Supported modes:

- `DISABLED`
- `FIXED`
- `PERCENTAGE`

Rules:

- integer cents only
- `ARS` only in this milestone
- hold duration bounded to `5..30` minutes
- fixed amount must be `> 0`
- percentage uses basis points (`2500 = 25%`)
- deposit cannot exceed the booked service price snapshot
- policy affects **public** bookings only
- staff-created appointments never require an online deposit
- policy edits never rewrite historical payment snapshots

Rounding rule for percentage deposits:

- compute with integers
- `Math.round(servicePriceCents * basisPoints / 10000)`
- clamp to `servicePriceCents`

## Connection and credential storage

Model: `BarbershopPaymentConnection`

Secrets are stored encrypted with `PAYMENT_CREDENTIAL_ENCRYPTION_KEY` using
AES-256-GCM authenticated encryption.

Stored audit fields include:

- connection status
- seller id
- public key presence
- token expiry
- refresh timestamps
- revocation/error state

Never exposed through API:

- access token
- refresh token
- client secret
- PKCE verifier

Disconnect behavior:

```text
disconnect connection
-> revoke local usability of encrypted credentials
-> mark connection disconnected/revoked
-> disable deposit policy for future public paid bookings
-> keep historical payment rows intact
```

## OAuth + PKCE flow

Entry points:

- `POST /api/v1/barbershops/:barbershopId/payments/mercado-pago/connect`
- `GET /api/v1/payments/mercado-pago/oauth/callback`
- `DELETE /api/v1/barbershops/:barbershopId/payments/connection`

Flow:

1. OWNER starts connection from mobile.
2. API creates durable `PaymentOAuthState` with hashed state + encrypted PKCE verifier.
3. Mobile opens the Mercado Pago authorization URL in the system browser.
4. Callback exchanges the code server-side.
5. Seller-scoped tokens are encrypted and stored.
6. Callback renders a safe completion page; mobile refreshes connection status.

Security properties:

- single-use state
- short TTL
- callback cannot switch tenants
- reused/expired state rejected
- no code/token logging

## Public booking lifecycle with deposits

### Policy disabled

Public booking preserves the legacy flow:

```text
slot selected -> appointment created CONFIRMED -> notifications scheduled
```

### Policy enabled

Public booking becomes a hold-first saga:

```text
slot selected
-> create appointment PENDING
-> set payment_hold_expires_at
-> create BookingPayment(CREATING)
-> create Checkout Pro preference
-> update BookingPayment(PENDING)
-> redirect customer to Mercado Pago
-> confirm only after authoritative approval
```

This is a **reservation hold**, not a card authorization hold.

## Booking payment model

Model: `BookingPayment`

Important fields:

- `externalReference` (opaque, unique)
- `providerPreferenceId`
- `providerPaymentId`
- `amountCents`
- `policyModeSnapshot`
- `policyValueSnapshot`
- `expiresAt`
- review timestamps / reason codes

Statuses:

- `CREATING`
- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
- `EXPIRED`
- `REFUNDED`
- `REVIEW_REQUIRED` (legacy compatibility only)
- `ERROR`

Operational review is no longer represented by overwriting the payment status.
New review state lives in `booking_payment_reviews` + `booking_payment_review_actions`.

## Checkout Pro preference lifecycle

The preference is created with the connected seller token for the appointment's
barbershop. Return URLs are UX-only hints.

Authority order:

1. signed webhook accepted
2. API fetches Mercado Pago payment details by payment id
3. API validates seller, amount, currency, and external reference
4. only then may the appointment become confirmed

Browser query parameters such as `status=approved` are never trusted for
confirmation.

## Signed webhook inbox

Webhook endpoint:

- `POST /api/v1/webhooks/mercado-pago`

Validation uses the official Mercado Pago `x-signature` + `x-request-id` contract together with `data.id` from the direct API request URL. BarberApp rejects malformed, duplicate, oversized, or encoded signature inputs before inserting an event into `PaymentWebhookEvent`.

Direct notification URL generation now points Checkout Pro to the API endpoint itself:

- `POST /api/v1/webhooks/mercado-pago`
- local default: `http://localhost:3000/api/v1/webhooks/mercado-pago`
- production: configure `PAYMENT_WEBHOOK_PUBLIC_URL` explicitly

The webhook inbox is append-only and idempotent by provider event key.

## Authoritative reconciliation

Worker command:

```bash
npm run payments:webhooks --workspace @barberapp/api -- --once
```

For each claimed inbox row:

1. fetch provider payment details using the connected seller token
2. verify seller identity, external reference, currency, and amount
3. map provider status to local terminal/pending state
4. commit appointment/payment transition atomically

### Approval

```text
BookingPayment -> APPROVED
Appointment PENDING -> CONFIRMED
payment_confirmed_at set
booking confirmation + reminder scheduling happen once
```

### Rejected / cancelled / expired provider payment

```text
BookingPayment -> terminal non-approved state
Appointment PENDING -> CANCELLED (system/public release path)
slot becomes bookable again
no confirmation email
```

## Expiration worker and race handling

Worker command:

```bash
npm run payments:expire-holds --workspace @barberapp/api -- --once
```

The expiration worker finds due unpaid holds and atomically:

- marks payment `EXPIRED`
- cancels the pending appointment
- clears the hold
- cancels unsent notifications

Race rule:

```text
either approval wins and confirms the appointment
or expiration wins and releases the slot
never both
```

Conditional writes and authoritative rechecks keep the outcome deterministic.

## Late approval after hold expiry

If Mercado Pago reports approval after the local hold already expired, BarberApp
must not silently confirm the old slot.

Outcome:

```text
BookingPayment.status = APPROVED
BookingPaymentReview(OPEN, APPROVED_AFTER_HOLD_EXPIRY) created/reopened
Appointment stays cancelled/released
```

This preserves money visibility without reoccupying the slot.

## Cancellation and refund review

- unpaid pending booking cancellation releases the hold and marks the payment cancelled
- approved deposits are preserved on appointment cancellation
- approved deposits on cancelled appointments become `REVIEW_REQUIRED`
- automatic refund API calls are **not** part of this milestone

Public copy explicitly says the refund is not processed automatically and the
barbershop will review the payment.

## Notifications boundary

Before approval:

- no booking confirmation email
- no 24h reminder

After approval:

- existing booking confirmation scheduling runs once
- existing reminder scheduling remains compatible

## Manual QA still deferred

Deferred for a later batch:

- Mercado Pago sandbox browser/device pass with real sandbox accounts
- end-to-end owner reconnect/disconnect smoke on device
- late-approval operator handling with manual backoffice review steps
- refund-review operational playbook validation


## Sandbox readiness

Run:

```bash
npm run payments:sandbox-readiness --workspace @barberapp/api
```

The command validates local configuration shape, URL policy, encryption-key shape,
direct webhook routing, required migrations, and payment table presence without
printing secrets or making a provider call by default.

## Promotions interaction

Deposits are calculated from the immutable appointment `final_price_cents` snapshot.

Implications:

- discounts reduce the deposit amount when deposit policy is enabled
- zero-final-price public bookings skip Mercado Pago entirely
- approved paid bookings are not silently repriced during service-changing reschedules
- payment review, owner surfaces, and webhook reconciliation all read the frozen discounted amount rather than recomputing from current service or promotion rules
