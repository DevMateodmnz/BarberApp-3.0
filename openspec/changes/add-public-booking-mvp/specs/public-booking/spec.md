# public-booking Specification

## Purpose

Define an anonymous public booking capability for a single-location barbershop that reuses the real `Appointment` domain, computes real availability, minimizes PII, and preserves all existing staff booking guarantees.

## Requirements

### Requirement: Public barbershop identity and fail-closed resolution

The system MUST resolve a public booking page by a stable, lowercase, URL-safe `Barbershop.publicSlug` instead of exposing the internal barbershop ID. Missing, inactive, deleted, or slug-less shops MUST fail closed and MUST NOT reveal whether a private tenant exists.

#### Scenario: Active shop resolves by slug
- GIVEN an active barbershop with canonical slug `mateo-barber`
- WHEN an anonymous client requests the public shop endpoint for `mateo-barber`
- THEN the response MUST return only the shop’s public booking DTO

#### Scenario: Missing or inactive slug fails closed
- GIVEN a nonexistent slug or a barbershop that is inactive/deleted
- WHEN an anonymous client requests the public shop endpoint
- THEN the response MUST be `404` with the standard error envelope
- AND the response MUST NOT disclose whether the underlying tenant once existed

### Requirement: Public catalogue only exposes active services

The system MUST expose only active services for the resolved barbershop. Each public service DTO MUST include `serviceId`, `name`, optional public description, `durationMinutes`, `priceCents`, and `currency`.

#### Scenario: Inactive service is omitted
- GIVEN a service that belongs to the barbershop but is inactive or soft-deleted
- WHEN the public catalogue is requested
- THEN that service MUST NOT appear in the response

### Requirement: Public barber list is service-eligible and privacy-safe

The system MUST return only active employees who belong to the resolved barbershop and have an active `EmployeeService` assignment for the selected service. Public barber DTOs MUST expose only an opaque `barberId` and a display name.

#### Scenario: Unassigned barber is hidden
- GIVEN an active employee without an assignment to the selected service
- WHEN barbers are listed for that service
- THEN that employee MUST NOT be returned

#### Scenario: Private fields stay hidden
- GIVEN an eligible barber
- WHEN the public barber DTO is returned
- THEN it MUST NOT contain email, `userId`, `clerkUserId`, or other private staff data

### Requirement: Public availability uses production scheduling rules

The system MUST compute availability from production data using the resolved barbershop timezone, service duration, blocking appointment statuses, weekly working hours, active state, and the slot interval policy.

#### Scenario: Slot list respects blocking appointments
- GIVEN a blocking appointment that overlaps a candidate slot
- WHEN public availability is requested for that barber/service/date
- THEN the overlapping slot MUST NOT be returned

#### Scenario: Cancelled appointment does not block availability
- GIVEN an overlapping appointment with status `CANCELLED`
- WHEN availability is requested
- THEN the overlapping slot MAY still be returned

### Requirement: Schedule exceptions override weekly hours

The system MUST support date-specific schedule exceptions for a barbershop. An exact-date closure MUST return zero slots. A date-specific opening override MUST replace weekly hours for that date.

#### Scenario: Closed exception wins over weekly hours
- GIVEN weekly hours show the shop open on a date
- AND a schedule exception marks that exact local date as closed
- WHEN availability is requested for that date
- THEN the slot list MUST be empty

#### Scenario: Override intervals replace weekly hours
- GIVEN weekly hours are `09:00-18:00`
- AND a schedule exception defines intervals `10:00-13:00` and `15:00-18:00`
- WHEN availability is requested for that date
- THEN slots MUST be generated only within the override intervals

### Requirement: Public policy boundary enforces notice, horizon, and interval

The system MUST enforce a public booking policy boundary for minimum notice, booking horizon, and slot-start interval. The initial defaults SHALL be `60 minutes`, `30 calendar days`, and `30 minutes`.

#### Scenario: Past or too-soon slot is rejected server-side
- GIVEN a public request for a slot earlier than the minimum notice window
- WHEN the availability or booking request is evaluated
- THEN the system MUST reject that slot even if the browser attempted to submit it

#### Scenario: Excessive horizon is rejected server-side
- GIVEN a requested local date beyond the maximum booking horizon
- WHEN public availability or booking is requested
- THEN the system MUST reject the request with a validation error

### Requirement: Public booking input uses UTC startAt and consent-gated customer fields

The public booking create contract MUST accept `serviceId`, `barberId`, `startAt`, `clientName`, `clientPhone`, `consentAccepted`, `consentVersion`, and optional `notes`. The create contract MUST NOT accept the obsolete aliases `localDate`, `localStartTime`, `customerName`, `customerPhone`, or `note`. Consent acceptance MUST be required before any customer PII is persisted.

#### Scenario: Consent missing blocks persistence
- GIVEN a create request with `consentAccepted = false`
- WHEN the booking endpoint is called
- THEN the response MUST reject the request
- AND no appointment or idempotency success record MUST be created

#### Scenario: Availability-selected UTC startAt is authoritative input
- GIVEN the public availability endpoint returned UTC `startAt` / `endAt` values for a slot
- WHEN the browser submits the public create request
- THEN the browser MUST submit the selected UTC `startAt`
- AND the API MUST derive the authoritative `endAt` from the service duration
- AND any local confirmation formatting MUST use the authoritative barbershop timezone

#### Scenario: Obsolete local-time aliases are rejected
- GIVEN a create request that submits `localDate`, `localStartTime`, `customerName`, `customerPhone`, or `note`
- WHEN the booking endpoint validates the payload
- THEN the response MUST be a `400` validation error

#### Scenario: Invalid phone fails validation
- GIVEN a phone input that is not a canonical E.164-compatible phone number for the MVP’s accepted Argentina format
- WHEN the create request is validated
- THEN the response MUST be a `400` validation error

#### Scenario: startAt must align to a valid slot boundary
- GIVEN a create request whose `startAt` is inside working hours but does not exactly match a valid slot-start boundary
- WHEN the booking endpoint validates the requested instant
- THEN the response MUST be a `400` validation error

### Requirement: Public phone storage is normalized and minimal

The system MUST normalize accepted public phones to a canonical E.164-compatible `+54...` representation before writing `Appointment.clientPhone`. The original raw input MUST NOT be stored in the booking record.

#### Scenario: Staff sees formatted normalized phone
- GIVEN a public booking succeeds with a valid normalized phone
- WHEN staff later read the appointment through existing authenticated surfaces
- THEN the appointment MUST contain the normalized phone snapshot needed for consistent display

### Requirement: Public booking reuses the real appointment domain

The system MUST create public bookings in the existing `Appointment` table with `clientId = null` and MUST reuse or extract the same authoritative invariants already applied by authenticated appointment creation: service eligibility, employee eligibility, authoritative timezone conversion, business-hours checks, slot-boundary validation, overlap checking, and service snapshot creation.

#### Scenario: Authoritative fields are server-derived
- GIVEN a public booking request containing customer-entered data only
- WHEN the server creates the appointment
- THEN `barbershopId`, `employeeId`, `serviceId`, `startAt`, `endAt`, `status`, and service snapshots MUST be derived server-side
- AND browser-supplied price, duration, end time, status, or tenant fields MUST be ignored or rejected

#### Scenario: Public appointment is visible to staff immediately
- GIVEN a public booking succeeds
- WHEN an OWNER or BARBER loads the existing authenticated appointment views
- THEN the newly created appointment MUST appear without any data-copy step into a separate table

#### Scenario: Successful public bookings are immediately confirmed
- GIVEN a valid anonymous booking request that passes all server-side checks
- WHEN the appointment is persisted
- THEN the stored appointment status MUST be `CONFIRMED`
- AND no additional staff-approval step is required in MVP

### Requirement: Public booking creation is concurrency-safe

The final creation transaction MUST be authoritative. A previously displayed slot MUST be allowed to become unavailable before submission, and overlapping appointments MUST never be persisted.

#### Scenario: Stale slot returns recoverable conflict
- GIVEN two anonymous users select the same displayed slot
- WHEN the first booking commits successfully and the second submits afterward
- THEN the second response MUST be `409`
- AND the second booking MUST NOT be persisted

### Requirement: Public booking writes are durably idempotent

The public create endpoint MUST require an `Idempotency-Key` scoped to the resolved barbershop and the create-booking operation. The system MUST persist a payload fingerprint and the final successful response for safe replay.

#### Scenario: Safe replay returns the original success result
- GIVEN a booking request that already succeeded for key `K`
- WHEN the same request is retried with the same key and identical payload
- THEN the endpoint MUST return the same confirmation DTO without creating another appointment

#### Scenario: Same key with different payload fails deterministically
- GIVEN key `K` was already used for a different create payload
- WHEN a second request reuses key `K` with any differing field
- THEN the endpoint MUST return `409` and MUST NOT create another appointment

#### Scenario: In-progress duplicate is rejected predictably
- GIVEN key `K` is already being processed for the same barbershop operation
- WHEN another request arrives before the first finishes
- THEN the endpoint MUST return a deterministic duplicate/in-progress conflict response

### Requirement: Successful public bookings receive an opaque reference

Every successful public booking MUST receive a unique, unpredictable, non-sequential `bookingReference` suitable for display, copy, and support follow-up. The public reference MUST NOT equal the internal appointment ID.

#### Scenario: Confirmation DTO is safe and sufficient
- GIVEN a successful public booking
- WHEN the response is returned
- THEN it MUST include only `bookingReference`, `barbershopName`, `serviceName`, `barberName`, `localDate`, `localStartTime`, `timezone`, `startAt`, `endAt`, formatted customer phone, and appointment status

### Requirement: Public errors and DTOs minimize private-data leakage

Anonymous users MUST access only the public endpoints. Public responses and error cases MUST NOT expose private tenant records, hidden staff records, or raw Prisma objects.

#### Scenario: Private IDs are never returned blindly
- GIVEN a public request for catalogue, barbers, availability, or confirmation
- WHEN the response is serialized
- THEN it MUST exclude internal tenant records and unsafe nested model data

### Requirement: Public abuse protection is class-based and production-safe

The system MUST define separate rate-limit classes for public shop/catalogue reads, public availability reads, and public booking writes. Booking writes MUST be the strictest class. Production deployment MUST use a shared rate-limit store or equivalent horizontally safe mechanism.

#### Scenario: Write bursts are rate-limited independently from reads
- GIVEN repeated anonymous booking-create attempts from the same actor identity
- WHEN the write limit is exceeded
- THEN the response MUST be `429` with the standard error envelope
- AND normal catalogue reads MUST remain governed by their own class, not blocked by the booking-write counters

### Requirement: Existing authenticated behavior does not regress

Public booking MUST be additive. Existing OWNER/BARBER/mobile appointment behavior and existing DB overlap protection MUST remain active.

#### Scenario: Authenticated booking still follows current rules
- GIVEN an OWNER or BARBER uses the existing authenticated booking flows
- WHEN the public MVP is later implemented
- THEN those flows MUST continue to enforce their current role and tenant guarantees without regression

### Requirement: Dedicated public web flow is anonymous, accessible, and fail-closed

The system MUST provide a dedicated public web flow for `/barberias/[slug]` that allows anonymous customers to complete service, barber, date, slot, and customer-data steps without loading the staff mobile shell. The confirmation page MUST render from the immediate booking response and MUST NOT require public lookup by booking reference alone in MVP.

#### Scenario: Missing shop fails closed on direct page load
- GIVEN an anonymous user opens a nonexistent or inactive slug directly in the public web app
- WHEN the page loads
- THEN the app MUST show a safe missing-shop state
- AND it MUST NOT expose private identifiers or internal error details

#### Scenario: Confirmation page does not imply future reference lookup
- GIVEN a public booking succeeds
- WHEN the browser navigates to the confirmation view
- THEN the confirmation content MUST come from the successful submission response
- AND reloading the page MUST be allowed to fall back to a safe support message instead of a public reference-lookup API

## Non-Goals

- CLIENT account creation or customer Clerk authentication
- Customer booking history
- “Any available barber”
- Public cancellation or rescheduling
- Notifications, payments, deposits, subscriptions, waitlists, or reviews
- Multi-location businesses
- Marketplace discovery or public employee schedule browsing beyond available slots
- External holiday-calendar or Google Calendar integration
- Self-service owner signup
- Loyalty programs, recurring appointments, advanced analytics, or marketplace-style discovery
