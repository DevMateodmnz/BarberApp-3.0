# Design: Public Booking MVP

## Technical Approach

Add a new anonymous booking surface that reuses the existing appointment domain instead of creating a parallel reservation system. The future implementation should introduce a public API namespace, a dedicated public web workspace, and a small set of schema additions (slug, schedule exceptions, booking reference, consent, idempotency) while extracting shared booking invariants from the current authenticated appointment service.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---------|--------|-------------------------|-----------|
| Public API namespace | `/api/v1/public/...` | Reusing authenticated `/appointments`; mixing routes under `/barbershops` | Makes anonymity explicit, isolates rate limits, and avoids accidentally widening existing auth contracts |
| Web stack | Next.js app at `apps/public-web` | React/Vite SPA; Expo Web | Best fit for slug deep links, fail-closed direct loads, share previews, and future SEO while staying in React/TS |
| Public barbershop identity | `Barbershop.publicSlug` stored lowercase | Expose internal barbershop IDs; separate slug table | Smallest durable location identity without leaking sequential IDs |
| Schedule exceptions | `BarbershopScheduleException` + child interval rows | Single open/close override; JSON blob | Supports closed dates and split intervals with clear validation and queryability |
| Idempotency | Dedicated `PublicBookingIdempotency` table + required `Idempotency-Key` header | Slot-only dedupe; client-only retries | Public writes need durable replay behavior across crashes/retries and must detect payload mismatch |
| Consent persistence | `Appointment.publicConsentAcceptedAt` + `publicConsentVersion` | Separate consent audit table | Minimal durable audit on the same record that already stores the booking snapshots |
| Phone storage | Store only normalized E.164-compatible phone in `Appointment.clientPhone` | Raw input only; raw + normalized copies | Minimizes duplicated PII while keeping one staff-visible contact field |
| Public identifiers for service/barber | Keep existing opaque CUID-backed IDs in DTOs, scoped by slug | New public IDs for service/employee | Safe enough for MVP because IDs are non-sequential and only valid within the resolved slug context; defers extra schema surface |
| Public policy boundary | Introduce a dedicated booking policy module/service | Hardcode constants in route handlers | Min notice, horizon, and slot interval must be reusable and later configurable per shop |

## Data Flow

```text
Public web page (/barberias/[slug])
  → GET public shop + services
  → GET eligible barbers for selected service
  → GET availability for slug + barber + service + localDate
  → POST public booking with Idempotency-Key
      → resolve slug to active barbershop
      → re-validate service + barber eligibility
      → apply policy (notice/horizon/slot interval)
      → apply weekly hours + schedule exception precedence
      → validate requested UTC startAt against the derived local date + valid slot boundary
      → derive authoritative endAt from the service duration
      → create real Appointment with snapshots + consent + reference
      → persist idempotency result
  → success page shows safe confirmation DTO
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `openspec/changes/add-public-booking-mvp/proposal.md` | Create | Product decision lock and scope |
| `openspec/changes/add-public-booking-mvp/specs/public-booking/spec.md` | Create | Testable public-booking requirements |
| `openspec/changes/add-public-booking-mvp/design.md` | Create | Technical approach, contracts, rollout |
| `openspec/changes/add-public-booking-mvp/tasks.md` | Create | Ordered implementation roadmap |
| `apps/api/src/routes/publicBarbershops.ts` | Future create | Anonymous public routes |
| `apps/api/src/services/publicBookingService.ts` | Future create | Public booking orchestration + idempotency |
| `apps/api/src/services/appointmentService.ts` | Future modify | Extract/share invariant helpers instead of duplicating public-only logic |
| `apps/api/src/lib/publicBookingPolicy.ts` | Future create | Notice/horizon/slot policy boundary |
| `apps/api/src/schemas/publicBooking.ts` | Future create | Public DTO validation |
| `apps/public-web/*` | Future create | Dedicated anonymous booking UI |

## Interfaces / Contracts

```ts
GET /api/v1/public/barbershops/:slug
→ { success: true, data: { slug, name, timezone, address?, phone?, bookingEnabled } }

GET /api/v1/public/barbershops/:slug/services
→ { success: true, data: Array<{ serviceId, name, description?, durationMinutes, priceCents, currency }> }

GET /api/v1/public/barbershops/:slug/barbers?serviceId=svc_opaque
→ { success: true, data: Array<{ barberId, displayName }> }

GET /api/v1/public/barbershops/:slug/barbers/:barberId/availability?serviceId=...&localDate=YYYY-MM-DD
→ { success: true, data: { localDate, timezone, slotIntervalMinutes, serviceDurationMinutes, slots[] } }

POST /api/v1/public/barbershops/:slug/appointments
Headers: Idempotency-Key: <uuid-or-token>
Body: {
  serviceId: string;
  barberId: string;
  startAt: string;         // strict ISO-8601 UTC instant selected from availability
  clientName: string;
  clientPhone: string;
  consentAccepted: true;
  consentVersion: string;
  notes?: string;
}
→ 201 { success: true, data: ConfirmationDto }
→ 200 same body on safe replay
→ 409 on stale slot or idempotency mismatch/in-progress duplicate
```

Availability returns authoritative UTC `startAt` / `endAt` values for each slot, while public creation submits the chosen UTC `startAt`. The API derives authoritative `endAt`, and any local confirmation formatting uses the barbershop timezone.

`ConfirmationDto` should include only: `bookingReference`, `barbershopName`, `serviceName`, `barberName`, `localDate`, `localStartTime`, `timezone`, `clientPhoneDisplay`, `startAt`, `endAt`, and `status`.

### Idempotency Policy

- **Source**: the public web client generates a cryptographically random key per submit attempt and sends it in the `Idempotency-Key` header.
- **Recommended format**: UUID v4 or equivalent opaque token matching a conservative ASCII pattern such as `[A-Za-z0-9_-]{8,128}`.
- **Maximum length**: `128` characters.
- **Scope**: `(resolved barbershopId, operation = public-booking-create, idempotencyKey)`.
- **Fingerprint**: SHA-256 of the canonicalized booking payload fields after trimming/normalization: resolved `barbershopId`, `serviceId`, `barberId`, normalized UTC `startAt`, normalized `clientName`, canonical `clientPhone`, normalized nullable `notes`, and accepted `consentVersion`.
- **Replay behavior**: same key + same fingerprint returns the original success DTO.
- **In-progress duplicate**: deterministic `409` conflict with a duplicate/in-progress code.
- **Key reuse with different payload**: deterministic `409` conflict.
- **Retention**: keep successful records for at least `48 hours`; expired rows may be cleaned independently of appointments.
- **Cleanup**: background cleanup or scheduled delete by `expiresAt`; cleanup MUST NOT cascade to `Appointment`.

## API Contract Details

| Endpoint | Auth | Params | Success | Errors | Deliberately omitted |
|----------|------|--------|---------|--------|----------------------|
| `GET /api/v1/public/barbershops/:slug` | anonymous | `slug` path | `200` public shop DTO | `404`, `429`, `500` | owner IDs, internal barbershop ID, private notes |
| `GET /api/v1/public/barbershops/:slug/services` | anonymous | `slug` path | `200` service list | `404`, `429`, `500` | inactive services, raw Prisma rows |
| `GET /api/v1/public/barbershops/:slug/barbers?serviceId=...` | anonymous | `slug`, `serviceId` | `200` eligible barber list | `400`, `404`, `429`, `500` | employee email, user IDs, inactive/unassigned barbers |
| `GET /api/v1/public/barbershops/:slug/barbers/:barberId/availability?...` | anonymous | `slug`, `barberId`, `serviceId`, `localDate` | `200` availability DTO with UTC `startAt` / `endAt` per slot | `400`, `404`, `429`, `500` | blocking appointment details, private schedule notes |
| `POST /api/v1/public/barbershops/:slug/appointments` | anonymous + `Idempotency-Key` | `slug` path + booking body | `201` create, `200` replay | `400`, `404`, `409`, `429`, `500` | raw appointment row, tenant records, internal DB IDs in confirmation |

Public validation semantics:
- `400`: malformed slug input, invalid `startAt` / phone / consent, out-of-policy booking window, or slot-boundary mismatch
- `404`: unavailable public resource (missing/inactive shop, hidden service/barber within slug scope)
- `409`: stale slot, idempotency mismatch, in-progress duplicate
- `429`: public rate limit exceeded
- `500`: unexpected failure through the standard error envelope

## Proposed Data-Model Changes

| Concern | Choice | Why this choice | Rejected alternative |
|---------|--------|-----------------|----------------------|
| Barbershop slug | `Barbershop.publicSlug String? @unique`, stored lowercase | Smallest pilot-friendly public identity, nullable for controlled backfill | separate slug table adds indirection without MVP value |
| Schedule exceptions | `BarbershopScheduleException` + child interval rows keyed by local date | Represents full closure or multiple override intervals clearly | single open/close columns cannot represent split shifts; JSON blob hides validation/query logic |
| Public booking reference | nullable immutable `Appointment.publicReference` unique index | Confirmation/support identifier stays next to the booking record | separate reference table adds a second lookup hop without clear benefit |
| Idempotency | `PublicBookingIdempotency` scoped by barbershop + operation + key | Durable replay and mismatch detection across retries/crashes | slot-only dedupe fails on same-customer retries and does not protect network retries |
| Consent | `Appointment.publicConsentAcceptedAt` + `publicConsentVersion` | Minimal audit with the booking itself | separate consent log table is heavier than MVP needs |
| Phone | keep only normalized phone in `Appointment.clientPhone` | Minimizes duplicated PII while preserving staff contact visibility | storing raw + normalized doubles PII without clear first-MVP value |

### Data Model Details

| Model / field | Nullability / default | Uniqueness / indexes | Tenant relationship | Migration impact | Rollback concern |
|---------------|-----------------------|----------------------|--------------------|------------------|------------------|
| `Barbershop.publicSlug` | nullable; no default; stored lowercase | unique index on non-null values | one slug per barbershop | controlled backfill for existing shops; reserved-slug validation in app layer | removing slug disables public entry points unless redirects are planned |
| `Appointment.publicReference` | nullable for legacy/staff rows; no default | unique index | lives on existing appointment row | backfill not required for legacy rows | dropping field should not affect already-created appointments except support/reference lookup |
| `Appointment.publicConsentAcceptedAt` | nullable for legacy/staff rows | ordinary index optional only if audit queries need it | same tenant as appointment | no backfill required | safe to drop without corrupting bookings, but consent audit would be lost |
| `Appointment.publicConsentVersion` | nullable for legacy/staff rows | no uniqueness; optional index not needed initially | same tenant as appointment | no backfill required | safe to drop, but legal/support traceability shrinks |
| `BarbershopScheduleException.localDate` | required; local calendar date; no default | unique per `(barbershopId, localDate)` | barbershop-scoped | new table, no legacy backfill required | removing exceptions reverts affected dates to weekly hours |
| `BarbershopScheduleException.isClosed` | required; default `false` | indexed via parent key only | barbershop-scoped | new table | if removed, override semantics disappear |
| `BarbershopScheduleExceptionInterval` rows | required `openTime`, `closeTime`, `position`; no defaults beyond timestamps if added | unique `(scheduleExceptionId, position)`; index on parent FK | child of a barbershop-scoped exception | new table; validate ascending non-overlapping intervals | deleting interval rows changes public availability for that date |
| `PublicBookingIdempotency.idempotencyKey` | required; max length 128; no default | unique within `(barbershopId, operation, idempotencyKey)`; index on `expiresAt` | barbershop-scoped | new table plus cleanup job/process | careless cleanup must never delete the appointment itself |
| `PublicBookingIdempotency.requestFingerprint` | required | indexed only via composite lookup | barbershop-scoped | new table | loss prevents deterministic mismatch detection for old keys |
| `PublicBookingIdempotency.appointmentId` | nullable until success | index on appointment FK | points to tenant-owned appointment | new table | deleting idempotency rows must not delete appointments |

## Testing Strategy

| Layer | What to Test | Approach |
|------|---------------|----------|
| Domain/unit | slug normalization, phone normalization, UTC `startAt` validation, slot-boundary alignment, schedule exception precedence, notice/horizon, idempotency fingerprinting, consent rules | Pure helper and service tests |
| API/integration | anonymous route access, fail-closed resources, eligibility, availability, stale-slot conflict, replay behavior, safe DTOs, rate-limit envelopes | Vitest + Supertest against real app/error envelope |
| DB | uniqueness/index behavior for slug, booking reference, idempotency keys; exception-model constraints | Real PostgreSQL tests where needed |
| Web | loading, empty, missing shop, form validation, accessibility, stale-slot conflict, replay/retry | component/unit tests first |
| E2E | public customer flow ending in staff-visible appointment | future browser test after web app exists |

## Abuse Protection Classes

| Class | Applies to | Initial target policy | Production note |
|------|-------------|-----------------------|-----------------|
| `public_catalog_read` | shop lookup, services, barber list | `60 req/min` per IP + slug | shared store required in production |
| `public_availability_read` | availability endpoint | `30 req/min` per IP + slug + barber | shared store required in production |
| `public_booking_write` | booking create endpoint | `5 req / 15 min` per IP + slug, plus idempotency key | strictest class; shared store required in production |

## Migration / Rollout

1. Add schema support for slug, exceptions, reference, consent, and idempotency.
2. Implement public read routes behind a pilot-ready feature toggle/config.
3. Implement public write route with idempotency and shared invariants.
4. Add the dedicated public web app and connect it to the public API.
5. Provision exactly one pilot barbershop manually.
6. Share the public URL privately, monitor abuse/errors, then widen rollout.

Rollback principle: public routes/web can be disabled independently; staff/mobile booking continues to use the same appointment domain.

## Open Questions

- [ ] Final pilot rate-limit thresholds should be tuned with real traffic data, though separate read/availability/write classes are locked now.
- [ ] The exact public path prefix should stay `/barberias/[slug]` unless deployment constraints later require an equivalent localized route.
