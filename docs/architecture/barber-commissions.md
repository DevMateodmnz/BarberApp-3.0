# Barber commissions and liquidations

## Decision

Barber commissions are a tenant-owned financial ledger. They are not derived
from the barber's current percentage at read time and do not depend on Mercado
Pago.

- `Barbershop.defaultCommissionBasisPoints` is the shop fallback (0–10,000).
- `EmployeeCommissionPolicy` is an optional per-barber override. Only an OWNER
  can change it, and only for an active employee in the same shop.
- A transition to `COMPLETED` creates one `CommissionEntry` in the same database
  transaction as the appointment transition. The entry snapshots
  `finalPriceCents`, currency, the effective basis-point rate, the calculated
  commission, barber, shop, appointment, and completion instant.
- Calculation uses integer cents and basis points only:
  `floor((grossCents * basisPoints + 5000) / 10000)`. This is round-half-up to
  the nearest cent; persisted money and percentages never use binary floats.
- `finalPriceCents` is authoritative because appointments already snapshot one
  service's name, list price, discount, final price, duration, and currency.
  Cash and external-payment appointments accrue exactly like Mercado Pago
  appointments.

## Historical behavior and corrections

The migration does **not** backfill existing completed appointments. Applying a
new current rate to old work would create inaccurate history. Accrual is
prospective: it starts when an appointment transitions to `COMPLETED` after the
migration.

Current appointment rules make `COMPLETED`, `CANCELLED`, and `NO_SHOW` terminal,
and rescheduling/repricing is limited to future confirmed appointments. There is
therefore no supported post-completion edit that needs to mutate an accrual.
Generic appointment routes cannot bypass this invariant.

The ledger reserves an explicit `REVERSAL` type and one-to-one `reversalOf`
relationship for a future controlled correction workflow. Such a workflow must
append a compensating entry; it must never delete an accrual or rewrite a paid
liquidation. No correction UI/API is exposed until a real appointment correction
lifecycle exists.

## Liquidation lifecycle

A liquidation belongs to exactly one shop and one barber.

1. **Preview** reads at most 500 eligible entries for an inclusive local-date
   range using the shop timezone. Eligible entries have no liquidation.
2. **Create** recomputes entries and totals on the server, creates an `OPEN`
   liquidation, then claims every entry in a serializable transaction. A
   compare-on-update count and database constraints prevent double claims.
3. A shop-scoped idempotency key makes retries return the original liquidation;
   reusing the key for another barber or range returns a conflict.
4. **Pay** changes `OPEN` to `PAID`, recording actor and timestamp. Retrying pay
   is idempotent. Paid rows and their entry membership are immutable.
5. **Void** is allowed only for `OPEN`; it records actor, timestamp, and reason,
   and releases its entries to the unsettled pool. `PAID` cannot be voided.

`VOIDED` liquidations remain visible as audit history. Totals are snapshots and
the API never accepts client totals.

## Authorization and API

All routes are under `/api/v1/barbershops/:barbershopId/commissions` and first
apply authentication plus barbershop access checks.

| Endpoint | Role | Purpose |
| --- | --- | --- |
| `GET/PUT /settings` | OWNER | Read/update shop default and employee overrides |
| `GET /overview` | OWNER | Barber + local-date-range summary and paged entries |
| `GET /me` | BARBER | Same contract, forced to authenticated employee |
| `GET /liquidations/preview` | OWNER | Eligible unsettled entries and server totals |
| `POST /liquidations` | OWNER | Idempotent transactional creation |
| `GET /liquidations` | OWNER/BARBER | History; BARBER is forced to self |
| `GET /liquidations/:id` | OWNER/BARBER | Detail; BARBER is forced to self |
| `POST /liquidations/:id/pay` | OWNER | Idempotently mark paid |
| `POST /liquidations/:id/void` | OWNER | Void OPEN and release entries |

OWNER queries may select only employees belonging to that shop. BARBER cannot
pass an employee ID to broaden self-service scope and cannot mutate settings or
liquidations. Cross-tenant probes are rejected without returning financial data.

## Deliberate exclusions

Payroll, salaries, taxes, invoicing, tips, attendance, bank transfers,
automatic Mercado Pago payouts, platform fees, per-service rates, and accounting
integrations are out of scope. No new environment variable is required.
