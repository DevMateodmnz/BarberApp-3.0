# Public Booking Architecture

> Public booking now supports two modes: legacy immediate confirmation and
> deposit-backed reservation holds. This document covers the shared invariants.

## Core invariants

- public booking remains anonymous; no client account is required
- public reference remains the bearer credential for confirmation/cancellation
- idempotency key + request fingerprint prevent duplicate bookings on retries
- canonical availability uses employee-specific schedules
- authoritative appointment/payment state comes from the API, not browser hints

## Two booking paths

### 1. Policy disabled

```text
availability -> submit -> CONFIRMED appointment -> confirmation page
```

### 2. Policy enabled

```text
availability -> submit -> PENDING appointment hold -> Checkout Pro ->
authoritative payment reconciliation -> confirmed or released
```

## Public API surface

Catalog:

- `GET /api/v1/public/barbershops/:slug`
- `GET /api/v1/public/barbershops/:slug/services`
- `GET /api/v1/public/barbershops/:slug/barbers`
- `GET /api/v1/public/barbershops/:slug/booking-config`
- `GET /api/v1/public/barbershops/:slug/availability`

Booking/payment:

- `POST /api/v1/public/barbershops/:slug/appointments`
- `GET /api/v1/public/barbershops/:slug/appointments/:reference`
- `POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel`
- `GET /api/v1/public/barbershops/:slug/bookings/:reference/payment`

## UI states

The public web renders friendly states instead of raw enums:

- Esperando pago
- Pago en revisión
- Turno confirmado
- Pago rechazado
- Reserva vencida

## Confirmation page behavior

The return pages under `/barberias/:slug/pago/*` are display shells only.
They must fetch the authoritative payment status from BarberApp before showing
final state.

## Browser persistence

The browser keeps:

- pending booking attempt (for safe idempotent retries)
- last booking confirmation snapshot

The authoritative API may refresh or replace the browser snapshot.

## Cancellation behavior

- public cancellation still works with the same public reference
- unpaid holds are released without refund work
- approved deposits surface refund review copy instead of promising an automatic refund


## Review-required customer copy

When a payment needs staff review, public-web shows only:

```text
Pago en revisión
La barbería debe revisar el pago antes de confirmar el turno.
```

Internal causes such as seller mismatch, amount mismatch, duplicate payment,
or staff notes never reach the customer surface.
