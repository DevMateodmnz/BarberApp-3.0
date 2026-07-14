# Competitive Product Roadmap

> Factual comparison, deliberate differentiation, and the ordered next
> milestones for BarberApp. We are not chasing any single competitor
> feature by feature. We are building a foundation that is genuinely
> useful for real barbershops on day one, then layering reminders,
> deposits, and operator tools as the product earns them.

## How to read this document

- **Reference product** is used in place of naming the alternative
  product directly. The reference is a different Argentine booking
  product with overlapping surface area (public booking, dashboard,
  customer accounts, business search, promotions, Premium,
  Mercado Pago, commissions, platform admin).
- Categories are written as **factual observations** of our
  product, not a marketing comparison. Where the reference
  advertises a feature that we do not yet ship, we call that out
  neutrally.
- "Differentiation" describes what we will *deliberately* do
  differently, not what we will copy.
- The ordered list under [Roadmap](#roadmap) is the plan we will
  execute across upcoming phases. Items are not commitments; they
  are the current best ordering given what we have learned so far.

## Strategic priority order

We use this order to evaluate new work. The list is a
**principle**, not a release plan — features ship when they have
durable foundations, not because they are next on the list.

1. **Customer retention and no-show prevention**
2. **Public booking reliability and conversion**
3. **Customer directory and visit history**
4. **Appointment confirmations and reminders**
5. **Deposits and Mercado Pago**
6. **Promotions and loyalty**
7. **Platform administration and scalable tenant onboarding**
8. **Marketplace, search, and reviews** — only after multiple real
   businesses exist

We do **not** jump to payments, marketplace, or platform-admin
features simply because the reference product advertises them.
Those features become valuable only after the underlying
reliability story is real.

## Comparison categories

| Area | BarberApp today | Reference product | What we are doing differently |
| --- | --- | --- | --- |
| Online booking | Anonymous, idempotent, consent-recorded public booking via slug | Online booking with customer accounts required in some flows | Keep anonymous public booking; record consent + reference; allow self-cancel by reference |
| Business dashboard | OWNER + BARBER scoped, role-aware, with tenant integrity checks at service layer | Operator dashboards | Stay role-aware; never leak cross-tenant data; 404 instead of 403 on cross-tenant probes |
| Customer accounts | Deferred by design until the customer-facing flow is justified | Customer accounts from day one | We do not build CLIENT accounts until a feature requires them. Pre-emptively adding auth/UX surface is paid for later by everyone |
| Business search | Out of scope until multiple real shops exist | Marketplace search | We will not build a marketplace or reviews layer until at least 3–5 real businesses are active |
| Promotions | Out of scope until CRM is real | Promotions and discount codes | Defer until reminders + deposits + loyalty are real |
| Premium subscription | Out of scope | Premium tier for shops | We will not add a paid tier for shops until the baseline product is operationally excellent |
| Mercado Pago | Out of scope; no production credentials yet | Mercado Pago deposits and full payments | Plan to add after no-show prevention lands; never ship payments without a published runbook and rate-limit testing |
| Platform commissions | Out of scope; one-business-per-OWNER is the current unit | Commission and transfer model | We will not introduce a commission model until we have multi-tenant operations we can charge for |
| Platform admin | Out of scope | Platform administrator dashboard | Defer |
| Reliability and lifecycle tracking | Strong: DB-level double-booking constraint + transition state machine + idempotency | Less explicit lifecycle visibility per the reference's public surface | This is our differentiator. We record every transition, every cancel, every no-show, and we surface it to staff before they commit a new booking |

## Phase 1 milestone (this commit)

> **feat(appointments): add no-show prevention lifecycle and customer
> insights**

This is the smallest coherent vertical slice that:

- immediately helps a real barbershop (Nice Barber, the pilot);
- is built on durable primitives (timestamps, normalized phone,
  service-layer state machine, additive schema);
- does not require production third-party credentials;
- is the foundation for future reminders, deposits, and CRM.

### What ships

- `started_at`, `confirmed_at`, `completed_at`, `cancelled_at`,
  `no_show_at` timestamp columns on `appointments` (all nullable;
  purely additive migration).
- `cancelled_by_role` column recording the actor's role on every
  cancellation. Public booking cancellation uses `CLIENT` to
  represent the anonymous guest; this is documented in code.
- `cancel_reason` column (VARCHAR 500) on the same row.
- `client_phone_normalized` column (E.164) with a composite
  index on `(barbershop_id, client_phone_normalized)`. Public
  booking input is already E.164, so public rows are matched
  automatically. Staff-created rows normalize opportunistically
  and legacy staff rows remain NULL.
- `DELETE /api/v1/appointments/:id` now accepts an optional
  `{ reason }` body. The reason is trimmed, clamped to 500 chars,
  and stored as NULL when empty.
- New endpoint
  `GET /api/v1/barbershops/:barbershopId/customers/lookup?phone=E164`
  (OWNER + BARBER scoped) that returns visit counts, no-show
  counts, cancelled count, completed count, last visit timestamp,
  last no-show timestamp, and a paginated recent-appointments
  list. The endpoint hides cross-tenant existence by returning
  404 instead of 403.
- New public endpoint
  `POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel`
  that lets the customer cancel their own anonymous booking by
  reference and optional reason.
- Mobile: debounced (400ms) phone lookup on the appointment
  creation screen. When the typed phone matches a customer with
  prior no-shows, a small warning banner is rendered above the
  form, in Spanish, with the count and the date of the most
  recent no-show.
- Public-web: the confirmation page now offers a "Cancelar mi
  reserva" button with an optional reason field. Success state
  echoes the cancelled reference and the recorded reason.

### Why this milestone wins against the alternatives

- **vs adding customer accounts** — Accounts add an auth surface,
  password reset, session management, and a separate mobile flow
  before we can prove the underlying lifecycle story. We can
  answer "is this person a no-show?" from the existing
  appointment rows without any client identity.
- **vs adding Mercado Pago** — Payments need credentials,
  runbooks, a real production environment, and rate-limit
  testing. They do not help staff avoid a no-show; they help
  staff recover from one. That is the next phase, not this one.
- **vs building a marketplace** — Search and reviews are a
  product surface that is *only* useful when there are multiple
  real businesses. Building it now would be building on top of
  the pilot alone.
- **vs adding push / WhatsApp reminders** — Reminders are
  high-leverage but they depend on lifecycle timestamps being
  reliable. We have just added the timestamps; reminders are a
  natural next milestone that uses this exact foundation.

### What is explicitly deferred

| Deferred to next milestone | Why |
| --- | --- |
| Reminder jobs (email/WhatsApp/push) | Needs lifecycle timestamps to be reliable, plus notification channel choices and credentials |
| Public booking confirmation email | Same as reminders, plus email credentials |
| Payments (deposit, full, refund) | Needs a separate production cutover, credentials, and a published runbook |
| Promotions, loyalty, deposits-as-discount | All depend on the payment + reminder stack |
| Platform admin / multi-tenant operations | Premature until pilot data tells us what operators actually need |
| Marketplace, search, reviews | Premature until multiple real businesses exist |
| Customer accounts (CLIENT mobile) | Premature until a feature actually needs them |

## Ordered next milestones

> These are the *current best* ordering, not a promise. Each
> milestone should be re-evaluated after the previous one lands
> in production.

1. **Reminders + customer-facing email** — uses lifecycle
   timestamps added in this milestone. Single mailer, no
   credentials needed for development. WhatsApp / SMS require
   external accounts and are out of scope.
2. **Repeat-customer aggregation surfaces in the mobile
   appointments list** — extend the same lookup used here to
   the day-view. Mark appointments where the customer has a
   recent no-show. Same data source, no new schema.
3. **Public confirmation email** — once the mailer is wired.
4. **Deposit flow via Mercado Pago** — full production cutover
   with runbook. Payment creates a `pending` reservation that
   holds the slot until the webhook confirms the deposit; on
   timeout the slot is released.
5. **Promotions and loyalty** — only after the payment stack is
   real.
6. **Platform administration** — when multi-tenant operations
   become a real product problem, not a theoretical one.
7. **Marketplace, search, and reviews** — only after multiple
   real businesses exist.

## Warning against feature-by-feature copying

The reference product is useful as a *gap source* — it tells us
what commercial flows exist in the market. It is **not** a spec
to copy from. Differences that look like gaps in our product
today are often deliberate decisions to ship only what a real
barbershop needs. We re-evaluate each gap as it comes up, with
this principle in mind:

> We earn the right to add a feature by first proving the
> underlying foundation is real. A feature built on a shaky
> foundation produces operational debt that falls on the
> barbershop, not on us.

## Measurable success criteria for Phase 1

The Phase 1 milestone is successful if, for at least one real
barbershop running the new code on its own data:

- every appointment has a complete lifecycle trail (confirmedAt,
  startedAt, completedAt or cancelledAt + cancelReason, or
  noShowAt) that matches the actual operational events;
- staff can look up a customer's no-show count in under 1 second
  after entering an E.164 phone;
- the customer-facing cancel-by-reference flow reaches a
  `CANCELLED` state with the recorded reason when the customer
  chooses to use it, and a 409 when the booking is already
  terminal;
- no regression in any of the 1222 automated tests; manual QA on
  the public cancel flow matches the documented happy path.

## Success criteria for the *roadmap*, not the milestone

The roadmap succeeds when the next milestone is not "we need
to add customer accounts so we can show a no-show count" — when
the next milestone is "we can remind customers by email because
the lifecycle is reliable and the mailer is wired."
