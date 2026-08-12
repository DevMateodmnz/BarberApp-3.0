# Customer Directory and Visit History

> BarberApp now has a first-class customer directory scoped to each
> barbershop. This document is the source of truth for customer
> identity, visit-history rules, tenant enforcement, and the migration
> that backfills customers from historical appointments.

## Quick path

1. Treat the `customers` row as the **current directory identity** for a
   `(barbershop, normalized phone)` pair.
2. Treat appointment `client*` fields as **immutable booking snapshots**.
3. Link appointments to customers with the composite
   `(customer_id, barbershop_id)` foreign key so cross-tenant links are
   impossible at the database level.
4. Never expose or search customer phone numbers through query strings;
   phone lookup/search stays body-based where required.

## What changed

| Topic | Decision |
| --- | --- |
| Identity key | One customer per `barbershop_id + phone_normalized` |
| Tenant safety | Appointments reference customers through `(customer_id, barbershop_id)` |
| History model | Customer detail aggregates upcoming + past appointments without mutating appointment snapshots |
| Access | `OWNER` and `BARBER` can read/update the directory; cross-tenant probes return 404-style hiding |
| Phone edits | Explicitly deferred; no customer merge or phone reassignment flow in this milestone |

## Identity model

`customers` is a directory table, not a replacement for appointment
snapshots.

- `customers.name`, `phone`, `email`, and `internal_notes` store the
  **current best-known directory profile**.
- `appointments.client_name`, `client_phone`, and
  `client_phone_normalized` store the **historical booking snapshot**
  that existed when that appointment was created.
- `appointments.customer_id` links the appointment to the current
  customer row when the appointment belongs to a known customer.

This separation is intentional:

- editing a customer later must not rewrite historical appointment
  snapshots;
- appointment history remains auditable;
- staff can create a new appointment from a customer profile while still
  changing the visible booking snapshot if needed.

## Tenant enforcement

The core invariant is:

> An appointment can reference only a customer that belongs to the same
> barbershop.

That rule is enforced in two places:

1. **Service layer checks** in `customerService`, `appointmentService`,
   and the barbershop routes hide cross-tenant access with not-found
   semantics.
2. **Database constraint** via
   `appointments_customer_id_barbershop_id_fkey`, which references
   `customers(id, barbershop_id)`.

The DB-level check matters because it closes the last integrity gap if a
future code path forgets a service-layer guard.

## Lifecycle fields and visit history

Customer activity is derived from appointment time, not request time.

- `first_seen_at` is the earliest linked appointment start.
- `last_seen_at` is the latest linked appointment start.
- `completedCount`, `cancelledCount`, `noShowCount`, and
  `upcomingCount` are aggregated from linked appointments.
- customer detail splits appointments into:
  - **Upcoming**: future `PENDING` / `CONFIRMED` rows
  - **Recent history**: past appointments, ordered newest-first

Updating `last_seen_at` from the appointment's `startAt` avoids clock
skew and preserves a truthful visit timeline during backfill and during
future edits/retries.

## Create-appointment flow from customer detail

The mobile customer detail screen can open appointment creation with:

- `prefillCustomerId`
- `prefillCustomerName`
- `prefillCustomerPhone`

When `customerId` is present:

- the staff appointment payload preserves the existing customer link;
- the visible booking snapshot (`clientName`, `clientPhone`) may still
  be edited for that one appointment;
- the backend keeps the original customer identity unless staff
  intentionally choose another customer flow in a future milestone.

This is the main reason the API accepts optional `customerId` on staff
appointment creation.

## Search, sorting, and privacy

Directory list/search supports:

- default list endpoint for pagination + sort;
- body-based search endpoint for name/phone search;
- sort by `recent`, `name`, and `no_shows`.

Privacy rules:

- phone-based lookup/search must not place customer phone data in URL
  query strings;
- the API response does not echo back unnecessary search input;
- cross-tenant existence stays hidden with 404-style behavior.

## Migration and backfill

Migration: `apps/api/prisma/migrations/20260715143000_add_customer_domain`

The migration:

1. creates `customers`;
2. adds nullable `appointments.customer_id`;
3. adds directory/search indexes;
4. backfills one customer per valid E.164
   `(barbershop_id, client_phone_normalized)` from non-deleted
   appointments;
5. links matching appointments to the new customers;
6. adds the composite appointment/customer foreign key.

### Preconditions

- only valid normalized E.164 phones participate in the backfill;
- malformed phone snapshots stay as appointment-only history and do not
  generate customer identities;
- `preflight.sql` must return zero rows before production rollout.

### Existing partial migration repair

An earlier local-only partial migration
`20260714210000_add_customer_domain` could leave a DB in a mixed state
with:

- `customers` already created,
- a simple `appointments.customer_id -> customers.id` foreign key,
- and no composite tenant constraint.

Repair for such DBs is:

1. add `customers_id_barbershop_id_key`;
2. add `appointments_customer_id_barbershop_id_idx`;
3. replace the old simple FK with the composite FK;
4. mark `20260715143000_add_customer_domain` as applied.

## BARBER access rationale

`BARBER` access is deliberate.

Barbers need customer history to:

- recognize repeat no-show risk;
- confirm who is returning today;
- create a new appointment from an existing customer profile without
  asking for all data again.

They do **not** receive wider business-administration powers from this
feature; access remains scoped to their barbershop only.

## Explicitly deferred

- customer merge flow
- customer phone mutation flow
- cross-customer deduplication beyond normalized phone
- customer-facing accounts
- marketing CRM / promotions / loyalty logic

Those need separate UX and data-governance decisions. This milestone
keeps the identity model intentionally strict and simple.

## Verification checklist

- [ ] Cross-tenant appointment/customer links fail at the DB level
- [ ] Directory search works by name and normalized-phone digits
- [ ] `Create appointment` from customer detail preserves `customerId`
- [ ] Editing customer notes/email does not rewrite past appointment snapshots
- [ ] Migration preflight returns zero rows before rollout
