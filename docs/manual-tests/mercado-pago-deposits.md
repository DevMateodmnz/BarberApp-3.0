# Mercado Pago Deposits Manual Test Plan

> Deferred manual QA checklist for the deposit milestone. This file documents
> what still needs a later human/sandbox pass; it does not block this batch.

## Prerequisites

- Mercado Pago sandbox seller account connected through OAuth
- Mercado Pago sandbox buyer/test user
- shared local DB on `5432` or isolated validation stack on `5433`
- public web + API + webhook worker + expiration worker running locally

## Owner/operator checks

- [ ] Connect Mercado Pago from mobile OWNER settings
- [ ] Confirm connection status changes to `Conectado`
- [ ] Enable fixed deposit policy and save
- [ ] Enable percentage deposit policy and save
- [ ] Verify invalid connection cannot enable deposits
- [ ] Disconnect and verify policy becomes disabled for future paid public bookings

## Public booking deposit checks

- [ ] Public service page shows service total, deposit, remaining balance, and hold time
- [ ] Submit once and confirm only one pending appointment/payment exists
- [ ] Retry same submission after browser refresh and confirm idempotent recovery
- [ ] Return page never auto-confirms from query params alone
- [ ] Approved payment confirms the appointment
- [ ] Rejected/cancelled payment releases the slot
- [ ] Expired hold becomes bookable again

## Operational review checks

- [ ] OWNER sees review-required payments
- [ ] Approved-on-cancelled appointment shows refund-review state
- [ ] Late approval after expiry stays cancelled and appears in review queue
- [ ] BARBER sees safe payment indicators but no credentials/settings

## Explicitly deferred from this milestone

- [ ] automatic Mercado Pago refunds
- [ ] commissions / marketplace fee
- [ ] settlement reconciliation reports
- [ ] production credential activation
