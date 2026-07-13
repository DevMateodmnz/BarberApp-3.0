# Proposal: Public Booking MVP

## Intent

Define the first anonymous public booking surface for BarberApp so a customer can open a shareable barbershop URL, browse active services, choose an eligible barber, see real availability, submit a guest appointment, and receive an immediate confirmation that lands in the existing staff appointment system.

This change is **design only**. It does **not** implement Prisma changes, public API routes, or the public web workspace.

## Current Repo Evidence

| Area | Evidence | Relevance |
|------|----------|-----------|
| Existing apps | `apps/api`, `apps/mobile`, `packages/shared` | No public web workspace exists yet |
| Appointment domain | `apps/api/prisma/schema.prisma` `Appointment` model | Already supports guest bookings via nullable `clientId` plus `clientName`, `clientPhone`, and service snapshots |
| Staff booking invariants | `apps/api/src/services/appointmentService.ts` | Existing create/availability flows already enforce employee/service eligibility, business hours, snapshot creation, and DB-backed overlap protection |
| Timezone utilities | `apps/api/src/lib/dateUtils.ts`, `apps/api/src/lib/businessHours.ts` | Existing code already treats booking dates in the barbershop timezone |
| Availability endpoint | `GET /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments/availability` in `apps/api/src/routes/barbershops.ts` | Real availability logic exists but is authenticated/staff-scoped and lacks public policy controls |
| Error envelope | `apps/api/src/middleware/errorHandler.ts` | Existing API returns `{ success, data }` or `{ success: false, error }` envelopes |
| Rate limiting | `apps/api/src/middleware/rateLimit.ts`, `apps/api/src/app.ts` | Current limiter is in-memory and only mounted globally on `/api/v1/appointments`, insufficient for horizontally scaled public traffic |
| User context | `apps/api/src/services/meService.ts` | Current authenticated context does not expose a public-shop concept or timezone to anonymous users |

## Scope

### In Scope
- Public barbershop discovery by stable slug
- Anonymous service catalogue for active services only
- Anonymous barber selection limited to active eligible barbers
- Public availability for a selected service + barber + local date using production data
- Anonymous appointment creation into the existing `Appointment` domain
- Public booking consent, phone normalization, booking reference, and durable idempotency design
- Schedule-exception model design for closed dates and per-date opening overrides
- Dedicated public web workspace selection and rollout plan
- Test strategy, security invariants, and implementation slices

### Out of Scope
- Implementing the Prisma schema, migrations, API routes, or web app
- Replacing the internal `Appointment` domain terminology
- Customer Clerk auth, CLIENT account creation, or customer history
- Public cancellation, rescheduling, notifications, payments, deposits, waitlists, reviews, or marketplace discovery
- Self-service owner onboarding or multi-location support

## Capabilities

### New Capabilities
- `public-booking`: anonymous public booking for a single-location barbershop using the real appointment domain and production availability

### Modified Capabilities
None in this batch. Existing `mobile` and authenticated appointment capabilities remain unchanged; the public contract is additive.

## Locked Product Decisions

### Customer authentication
- Public booking is accountless.
- Customers do not authenticate with Clerk.
- Public bookings do **not** auto-create `User` / `CLIENT` rows.
- Public guest appointments continue to use `clientId = null`.

### Required customer data
- Required: full name, phone number, explicit consent acceptance.
- Optional: short note.
- Excluded: email, password, account/profile, booking history.
- Public create request contract uses `serviceId`, `barberId`, `startAt`, `clientName`, `clientPhone`, `consentAccepted`, `consentVersion`, and optional `notes`.
- Obsolete public-create aliases `localDate`, `localStartTime`, `customerName`, `customerPhone`, and `note` are not accepted in MVP.
- Validation targets: `clientName <= 120`, canonical E.164-compatible phone stored in `Appointment.clientPhone`, `notes <= 500`.

### Phone handling
- MVP launch targets Argentina.
- Accepted input: canonical E.164-compatible strings such as `+543811234567`.
- Storage target: trimmed canonical E.164-compatible string in `Appointment.clientPhone`.
- Invalid/unparseable input fails with `400` validation error.
- Staff UI should display a locally formatted view derived from the normalized number, with raw normalized fallback if formatting fails.

### Public slug
- Add a nullable, unique, lowercase canonical slug to `Barbershop`.
- Slugs are URL-safe, stable, case-insensitive by normalization, and must reject reserved values.
- Existing shops are backfilled manually for the pilot; slug editing is deferred.
- Inactive or missing shops fail closed.

### Location model
- One `Barbershop` equals one bookable location.
- No speculative location abstraction is introduced.

### Services and barbers
- Only active services are public.
- Only active employees in the resolved barbershop with an active `EmployeeService` link to the selected service are public.
- Public barber DTOs expose display name only; no email, Clerk IDs, or private profile fields.

### Availability policy
- Public availability uses production data and barbershop-local time.
- It must enforce weekly hours, date-specific exceptions, service duration, employee-service eligibility, active state, blocking appointments, overlap boundaries, minimum notice, maximum horizon, and slot interval.
- Initial defaults: minimum notice `60 minutes`, horizon `30 calendar days`, slot interval `30 minutes`, authoritative timezone = `Barbershop.timezone`.
- Availability responses return authoritative UTC `startAt` / `endAt` values for each slot while preserving `localDate` as the query concept for reading availability.
- These values live behind a domain-policy boundary, not scattered through route handlers.

### Schedule exceptions
- Weekly hours alone are insufficient.
- The MVP needs tenant-scoped date-specific exceptions supporting either a fully closed date or one-or-more custom opening intervals for a single local date.
- No recurring holiday engine or external calendar integration.

### Appointment creation
- Public booking writes into the existing `Appointment` table.
- Public creation submits the selected UTC `startAt` returned by availability; the API derives the barbershop-local booking date from `startAt` plus the authoritative shop timezone.
- `startAt` must be a strict ISO-8601 UTC timestamp, align exactly to a valid slot boundary, and remain untrusted until all server-side invariants are revalidated.
- Server-side code derives authoritative `barbershopId`, `employeeId`, `serviceId`, `endAt`, `status`, and all snapshots.
- Browser-provided price, duration, end time, status, or tenant fields are ignored/rejected.
- Public implementation must reuse or extract the existing appointment invariants from `apps/api/src/services/appointmentService.ts`.
- Successful public bookings are immediately confirmed.

### Concurrency, idempotency, and confirmation
- Availability is advisory; final creation transaction is authoritative.
- Existing DB overlap protection remains the final integrity safeguard.
- Booking POST requires `Idempotency-Key`; replaying the same key+payload returns the same success result, while reusing the key with a different payload returns deterministic conflict.
- Each successful booking gets an opaque, non-sequential public reference for confirmation/support.

### Privacy, abuse, and onboarding
- Consent is explicit and persisted with acceptance timestamp and consent-copy version.
- No extra per-booking IP/user-agent persistence in MVP beyond operational logs; data minimization wins.
- Public rate limiting must use a production-safe shared-store abstraction; current in-memory limiter remains acceptable only for local/dev.
- Initial pilot onboarding is manual: real Clerk owner, real barbershop, unique slug, timezone, services, employees, assignments, weekly hours, and exceptions configured by an admin/founder.

### Terminology
- Spanish staff tab label: `Agenda`.
- Technical domain: `Appointment` / appointments.
- Customer-facing action copy: natural phrases like `Reservar turno`.

## Proposed Public API Surface

| Capability | Method | Path | Notes |
|-----------|--------|------|-------|
| Public shop lookup | `GET` | `/api/v1/public/barbershops/:slug` | Returns public barbershop profile only if active + slug-enabled |
| Public service catalogue | `GET` | `/api/v1/public/barbershops/:slug/services` | Returns active services only |
| Public eligible barbers | `GET` | `/api/v1/public/barbershops/:slug/barbers?serviceId=...` | Returns active eligible barbers scoped to the selected service |
| Public availability | `GET` | `/api/v1/public/barbershops/:slug/barbers/:barberId/availability?serviceId=...&localDate=YYYY-MM-DD` | Returns real open slots with authoritative UTC `startAt` / `endAt` while `localDate` remains the availability-read query |
| Public booking create | `POST` | `/api/v1/public/barbershops/:slug/appointments` | Requires `Idempotency-Key`; accepts the selected UTC `startAt`; derives authoritative `endAt`; creates guest appointment in the real domain |

The public surface keeps the existing API envelope, remains anonymous, and fails closed on missing/inactive/private resources.

## Data-Model Direction

### Likely schema additions
- `Barbershop.publicSlug String? @unique` (stored lowercase canonical slug)
- `Appointment.publicReference String? @unique`
- `Appointment.publicConsentAcceptedAt DateTime?`
- `Appointment.publicConsentVersion String?`
- `PublicBookingIdempotency` record keyed by `(barbershopId, operation, idempotencyKey)`
- `BarbershopScheduleException` + `BarbershopScheduleExceptionInterval` to override weekly hours per local date

### Explicitly avoided in MVP
- Separate public-only reservation table
- Multi-location abstraction
- Public customer/account profile tables
- Speculative external calendar sync models

## Dedicated Public Web Architecture Decision

Select a dedicated **Next.js** workspace at `apps/public-web` (package `@barberapp/public-web`).

Why this is the narrowest suitable choice for this repo:
- The repo already uses React + TypeScript, so the team keeps the same component language.
- Public booking needs slug-based deep links, reliable direct-load handling, and future SEO/metadata support that a public SPA would have to rebuild manually.
- Anonymous public pages should fail closed even on direct URL loads; server-routed pages simplify that.
- Expo Web is explicitly rejected for MVP because the current Expo app is staff-authenticated, mobile-shell oriented, and not an appropriate anonymous public surface.

## Risks

| Risk | Why it matters | Mitigation in this change |
|------|----------------|---------------------------|
| Public write abuse | Anonymous booking can be scripted | Specify separate rate-limit classes + shared-store requirement + idempotency |
| Timezone/date bugs | Public UX is local-date driven | Reuse barbershop-timezone utilities and require DST-sensitive tests |
| Slot races | Availability can go stale | Keep DB overlap protection authoritative and require recoverable 409 handling |
| Privacy leakage | Anonymous APIs are enumerable if careless | Fail closed on inactive/missing shops, minimize DTOs, keep IDs opaque and slug-scoped |
| Scope creep | Public web + API + schema is large | Break implementation into chained vertical slices with a pilot-first rollout |

## Success Criteria

- [ ] Proposal, design, tasks, and capability spec exist under `openspec/changes/add-public-booking-mvp/`
- [ ] Every locked product decision is captured explicitly
- [ ] Public/private API boundaries are concrete
- [ ] Data-model changes are designed, not implemented
- [ ] Shared appointment invariants, concurrency, idempotency, and schedule exceptions are mandatory in the future implementation
- [ ] Dedicated public web architecture is selected and justified
- [ ] Non-goals and rollout order are explicit
- [ ] Validation passes without changing production feature code outside `openspec/`
