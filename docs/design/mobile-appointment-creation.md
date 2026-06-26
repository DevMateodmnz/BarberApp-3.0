# Mobile Appointment Creation

Audit date: 2026-06-25  
Branch: `feat/mobile-appointment-creation`  
Baseline: `main` = `origin/main` = `2a8d60825c718723df8af27b1ac9945c7981ec95`

## Product scope

Goal: let authenticated OWNER and BARBER users create appointments from mobile.

This batch is **design only**. No runtime behavior changed.

## Current-state audit

### Product/spec mismatch

The current product docs still describe appointment creation as a CLIENT flow and list OWNER/BARBER creation as `N/A` (`docs/PRODUCT_SPEC.md`, `docs/SECURITY_MODEL.md`, `docs/ARCHITECTURE.md`).

The merged mobile MVP now treats Appointments as an OWNER/BARBER operational surface, so the appointment-create feature must **supersede that narrow contract** without breaking future CLIENT booking work.

### Existing mobile behavior

- OWNER and BARBER can open the Appointments tab.
- OWNER sees shop appointments and can filter by employee.
- BARBER sees only their own appointments.
- OWNER and BARBER can change status through allowed transitions.
- CLIENT is blocked from the mobile Appointments tab.
- There is **no mobile appointment-create route, form, or CTA**.

## Database readiness

### Current appointment model

Source: `apps/api/prisma/schema.prisma`

| Field | Type | Required | Notes |
|------|------|----------|------|
| `id` | `String` | yes | primary key |
| `barbershopId` | `String` | yes | FK to `Barbershop` |
| `employeeId` | `String` | yes | FK to `Employee` |
| `clientId` | `String` | yes | FK to `User` |
| `serviceId` | `String` | yes | FK to `Service` |
| `startAt` | `DateTime` | yes | UTC timestamp |
| `endAt` | `DateTime` | yes | UTC timestamp |
| `status` | `AppointmentStatus` | yes | default `PENDING` |
| `notes` | `String?` | no | optional |
| `createdAt` | `DateTime` | yes | audit |
| `updatedAt` | `DateTime` | yes | audit |
| `deletedAt` | `DateTime?` | no | currently unused for booking flow |

### Current indexes and constraints

- BTREE indexes:
  - `appointments_barbershop_id_idx`
  - `appointments_employee_id_idx`
  - `appointments_client_id_idx`
  - `appointments_start_at_idx`
  - `appointments_barbershop_id_employee_id_start_at_idx`
  - `appointments_employee_id_start_at_status_idx`
- FKs are `ON DELETE RESTRICT` for `barbershop`, `employee`, `client`, and `service`.
- PostgreSQL GiST exclusion constraint `no_double_booking` prevents overlap per employee for active statuses using `[)` bounds.

### Migrations that changed appointments

- `20260526022559_init` — creates `appointments`
- `20260531_add_double_booking_constraint` — first exclusion constraint attempt
- `20260531_add_in_progress_status` — adds `IN_PROGRESS`
- `20260604_add_db_double_booking_constraint` — final idempotent `no_double_booking` constraint with `[)` bounds and `IN_PROGRESS`

### Explicit audit answers

1. **Can the current schema represent the intended form without migration?**  
   **No.** The form requires staff-created appointments with `clientName` and optional `clientPhone`, but the schema requires `clientId` and has no appointment-level client snapshot fields.
2. **Which desired fields are unsupported?**  
   `clientName`, `clientPhone`, appointment-level price snapshot, appointment-level duration snapshot, appointment-level service-name snapshot, and optional client-account linkage.
3. **Is appointment price snapshotted or derived dynamically?**  
   **Derived dynamically** from the related `service` row.
4. **Is service duration snapshotted or derived dynamically?**  
   **Derived dynamically** from the related `service` row.
5. **What happens if a service changes after an appointment is created?**  
   Reads of the appointment include the current `service` relation, so price/duration/name reflect the **updated service**, not the booking-time values.
6. **What happens if an employee or service is deactivated afterward?**  
   Existing appointments remain valid historical rows; new bookings are rejected by service-layer validation.
7. **Is double-booking prevented at database level, service level, or both?**  
   **Both.** App-layer `hasTimeConflict()` plus DB exclusion constraint.
8. **Are adjacent appointments allowed?**  
   **Yes.** The DB constraint uses `[)` bounds; back-to-back appointments are valid.
9. **How are cancelled appointments treated by overlap protection?**  
   `CANCELLED`, `COMPLETED`, and `NO_SHOW` do **not** block new bookings.
10. **Are historical appointments preserved safely?**  
   **Yes, partially.** Rows survive employee/service deactivation and service soft-delete, but business facts like price and duration are **not frozen**.

### Database conclusion

Current schema is **not ready unchanged**. To support the intended OWNER/BARBER workflow safely, the appointment domain should migrate to a booking snapshot model.

### Recommended schema direction

Keep future CLIENT-account support, but add staff-booking compatibility:

- make `clientId` optional
- add `clientName` (required for staff-created appointments)
- add `clientPhone` (optional)
- keep `notes`
- add snapshot fields:
  - `serviceName`
  - `serviceDurationMinutes`
  - `servicePriceCents`
  - `serviceCurrency`
- preserve `serviceId` and `employeeId` relations for reporting/history

That gives one appointment model that supports:
- staff-created walk-in / phone bookings
- future client-account bookings
- historical accuracy after service edits

## API readiness

### Current appointment endpoints

| Method | Route | Roles | Current use | Readiness for mobile create |
|------|------|------|------|------|
| `POST` | `/api/v1/appointments` | `CLIENT` | client booking | not reusable |
| `GET` | `/api/v1/appointments` | all auth roles | role-scoped listing | reusable for list only |
| `GET` | `/api/v1/appointments/:id` | all auth roles | single read | reusable |
| `PUT` | `/api/v1/appointments/:id` | OWNER, BARBER | reschedule time/notes | reusable later |
| `PUT` | `/api/v1/appointments/:id/status` | OWNER, BARBER | status transition | reusable |
| `DELETE` | `/api/v1/appointments/:id` | CLIENT, OWNER | cancel | reusable |
| `GET` | `/api/v1/barbershops/:barbershopId/employees/:employeeId/appointments` | OWNER, BARBER | employee-scoped list | reusable with hardening |

### Current validation/behavior

Source files:
- `apps/api/src/routes/appointments.ts`
- `apps/api/src/services/appointmentService.ts`
- `apps/api/src/schemas/appointment.ts`
- `apps/api/src/lib/businessHours.ts`

Current create contract:

```ts
{
  barbershopId: string;
  employeeId: string;
  serviceId: string;
  startAt: string; // ISO 8601 datetime
  notes?: string;
}
```

Current create behavior:
- route-level access: `CLIENT` only
- validates employee/service belong to barbershop
- validates employee-service assignment
- derives `endAt` from current service duration
- validates business hours in barbershop timezone
- blocks overlap in app layer and DB layer
- creates appointment with `clientId = authenticated user`
- defaults status to `PENDING`

### Explicit appointment-create audit answers

- **OWNER selecting another employee**: not supported; route returns `403`
- **BARBER attempting to select another employee**: not supported; route returns `403`
- **missing employee**: `404 NOT_FOUND`
- **inactive employee**: `400 BAD_REQUEST` with message containing `not active`
- **missing service**: `404 NOT_FOUND`
- **inactive service**: `400 BAD_REQUEST` with message `Service is not available`
- **service not assigned to employee**: `400 BAD_REQUEST`
- **employee closed that day / barbershop closed that day**: `400 BAD_REQUEST`
- **start before opening**: `400 BAD_REQUEST`
- **end after closing**: `400 BAD_REQUEST`
- **exact closing boundary**: allowed when `endAt === closeTime`
- **overnight / cross-day appointment**: rejected with `400 BAD_REQUEST`
- **past appointments**: currently **not explicitly blocked**
- **same-start collision**: `409 CONFLICT`
- **partial overlap**: `409 CONFLICT`
- **containing overlap**: blocked by same overlap logic / DB constraint
- **adjacent appointment**: allowed
- **cancelled appointment overlap**: allowed
- **concurrent creation race**: atomic DB constraint prevents double success
- **tenant mismatch**: blocked by barbershop/employee/service validation
- **unauthorized barbershop access**: middleware/service isolation blocks it
- **malformed date/time**: only ISO datetime is validated today; no business-local `date` + `time` contract exists
- **DST / host-timezone leakage**: create path uses UTC ISO input and server-side timezone conversion correctly, but the contract is not ideal for mobile local-date/local-time UX

### Stable error-code audit

Current API only returns broad codes:
- `VALIDATION_ERROR`
- `BAD_REQUEST`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`

That is not enough for clean localized mobile handling of appointment-create failures.

### API readiness classification

**NEEDS CONTRACT REDESIGN**

Reasons:
1. current create route is CLIENT-only
2. current create payload cannot represent staff-entered client identity
3. no stable appointment-create error taxonomy exists
4. current contract uses ISO datetime instead of business-local date/time input
5. barber-safe employee derivation is not modeled for staff booking

### Recommended API contract

Keep existing future-facing client route unchanged:
- `POST /api/v1/appointments` remains the client/self-booking contract

Add a new staff route:
- `POST /api/v1/barbershops/:barbershopId/appointments`

Recommended request shape:

```ts
{
  employeeId?: string;          // OWNER required, ignored/forbidden for BARBER
  serviceId: string;
  localDate: string;            // YYYY-MM-DD in barbershop timezone
  localStartTime: string;       // HH:mm in barbershop timezone
  clientName: string;
  clientPhone?: string;
  notes?: string;
}
```

Server rules:
- OWNER may choose any active eligible employee in the same barbershop
- BARBER employee scope is derived from auth context, never trusted from UI
- service must be active and assigned to the effective employee
- `localDate` + `localStartTime` must be converted to UTC using `barbershop.timezone`
- past appointments must be rejected
- `endAt` is derived from **snapshotted** duration
- `serviceName`, `serviceDurationMinutes`, `servicePriceCents`, `serviceCurrency` are copied from the service row at creation time

### Small supporting API hardening

1. Extend `GET /api/v1/me/context` with `barbershopTimezone`
2. Allow `GET /api/v1/barbershops/:barbershopId/working-hours` for BARBER read access (keep PUT owner-only)
3. Add optional `?date=YYYY-MM-DD` filter to `GET /api/v1/barbershops/:barbershopId/employees/:employeeId/appointments`
4. Add appointment-create-specific stable error codes

### Required stable error codes

Use specific codes while preserving current HTTP status classes:

- `EMPLOYEE_REQUIRED`
- `EMPLOYEE_NOT_FOUND`
- `EMPLOYEE_INACTIVE`
- `FORBIDDEN_EMPLOYEE_SCOPE`
- `SERVICE_NOT_FOUND`
- `SERVICE_INACTIVE`
- `SERVICE_NOT_ASSIGNED`
- `INVALID_LOCAL_DATE`
- `INVALID_LOCAL_TIME`
- `INVALID_APPOINTMENT_TIME`
- `PAST_APPOINTMENT_NOT_ALLOWED`
- `BARBERSHOP_CLOSED`
- `OUTSIDE_WORKING_HOURS`
- `APPOINTMENT_CONFLICT`

## Mobile readiness

### Current architecture

Relevant files:
- `apps/mobile/app/(tabs)/appointments.tsx`
- `apps/mobile/src/components/AppointmentsScreenView.tsx`
- `apps/mobile/src/lib/appointments.ts`
- `apps/mobile/src/lib/appointmentsStore.ts`
- `apps/mobile/src/lib/employees.ts`
- `apps/mobile/src/lib/employeesStore.ts`
- `apps/mobile/src/lib/employeeServices.ts`
- `apps/mobile/src/lib/store.ts`
- `apps/mobile/src/lib/format.ts`
- `apps/mobile/src/i18n/errors.ts`

### What already exists

- authenticated role context via `useContextStore`
- appointment list loading + refresh via `useAppointmentsStore`
- OWNER employee list loading via `useEmployeesStore`
- employee-assigned service loading via `fetchEmployeeServices()`
- barber-assigned service loading via `fetchMyAssignedServices()`
- keyboard-aware `Screen` and `AppTextInput` primitives
- route hiding pattern inside `(tabs)` with `href: null`
- localized status labels, action labels, and six-locale runtime

### What is missing

- no create route / create screen
- no create appointment API client
- no create appointment draft/store
- no slot computation helper
- no localized appointment-create error mapping
- no client phone field in types/domain
- no barbershop timezone in mobile context
- no trustworthy date-scoped appointment query for slot derivation

### Important current mobile risk

`apps/mobile/app/(tabs)/appointments.tsx` filters appointments with:

```ts
appointments.filter((a) => a.startAt.startsWith(selectedDate))
```

That is UTC-string prefix filtering, not barbershop-local date filtering. It is acceptable for the current audit baseline, but appointment creation should not build new logic on top of that assumption.

### Recommended route architecture

Add a hidden route in the tabs group:
- `apps/mobile/app/(tabs)/appointment-create.tsx`

Why this route shape:
- matches the existing hidden management-route pattern
- preserves the Appointments tab as the entry list
- avoids modal complexity and state loss during keyboard-heavy entry
- allows `router.push('/(tabs)/appointment-create?date=YYYY-MM-DD')`

## Data required by the form

### OWNER needs

| Need | Current source | Status | Recommendation |
|------|------|------|------|
| active employees | `GET /barbershops/:id/employees` | partial | reuse and filter `isActive` client-side in v1 |
| active services for selected employee | `GET /barbershops/:id/employees/:employeeId/services` | ready | reuse |
| working hours | `GET /barbershops/:id/working-hours` | owner-only | reuse for OWNER; expand read access for BARBER |
| existing appointments for selected employee/date | employee appointments endpoint | partial | add `?date=` server filter |
| barbershop context | `GET /me/context` | partial | add `barbershopTimezone` |

### BARBER needs

| Need | Current source | Status | Recommendation |
|------|------|------|------|
| authenticated employee identity | `GET /me/context` | ready | reuse |
| assigned active services | `GET /barbershops/:id/me/services` | ready | reuse |
| working hours | none for barber | missing | allow BARBER read access to GET working-hours |
| existing barber appointments for selected date | employee appointments endpoint | partial | add `?date=` server filter |
| barbershop context | `GET /me/context` | partial | add `barbershopTimezone` |

### Smallest safe missing contracts

1. **`barbershopTimezone` in `/me/context`**  
   Needed for business-local date/time display and slot math.
2. **BARBER read access to working hours**  
   Needed for the same slot derivation rules OWNER sees.
3. **`date=YYYY-MM-DD` query on employee appointment list**  
   Needed to compute same-day slot availability without loading unrelated appointments.
4. **new staff-create appointment route**  
   Needed because current client-only route is the wrong domain contract.

## Time-selection decision

### Options compared

| Option | Pros | Cons | MVP verdict |
|------|------|------|------|
| A. Free-form `HH:mm` input | lowest backend dependency | highest typing burden, easy invalid input, poor barber-shop UX | reject |
| B. Fixed interval picker | simple UI | ignores real conflicts unless heavily filtered | reject |
| C. Derived available-slot picker | best usability, low typing, shows realistic options | needs working hours + selected-day appointments + duration | **select** |
| D. Hybrid manual time + validation | flexible | more UI complexity, more keyboard work, still needs fallback rules | defer |

### Selected approach

**C. Derived available-slot picker with server-authoritative submission**

### Rationale

- Barber shops work faster with tapable slots than typed times.
- The client can derive *candidate* slots from working hours, service duration, and existing same-day appointments.
- The server still performs the authoritative final validation, so the UI never promises exclusivity.
- This matches the user’s operational goal better than manual input.

### First-version rules

- slot interval: **30 minutes**
- interval configurability: **no** in v1; hard-coded constant in mobile + tested API assumptions
- service duration effect: slot validity is based on whether `[start, start + duration)` fits within hours and avoids active overlaps
- lunch breaks / split hours: **not supported by current model** because each day has one open/close range only
- unavailable dates: show date as selected but display localized `closed` or `no slots` state when applicable
- past times on today: hidden from slot list
- concurrent conflict on submit: show localized conflict error and recompute slots for the same date

## Final workflow

### OWNER flow

Appointments list  
→ tap **New appointment**  
→ hidden route `appointment-create` seeded with the list’s selected date  
→ choose employee  
→ choose assigned active service  
→ choose date  
→ choose available time slot  
→ enter client name  
→ optionally enter phone  
→ optionally enter notes  
→ review summary  
→ submit  
→ success flash  
→ pop back to Appointments list on the same selected date  
→ refresh list

### BARBER flow

Appointments list  
→ tap **New appointment**  
→ hidden route `appointment-create` seeded with the list’s selected date  
→ employee is implicit from auth context  
→ choose one of own assigned active services  
→ choose date  
→ choose available time slot  
→ enter client name  
→ optionally enter phone  
→ optionally enter notes  
→ review summary  
→ submit  
→ success flash  
→ pop back to Appointments list on the same selected date  
→ refresh list

### Field order and contract

| Field | OWNER | BARBER | Required | Source | Reset behavior | Validation |
|------|------|------|------|------|------|------|
| employee | visible | hidden | yes for OWNER | active employees | resets service/time on change | active, same tenant |
| service | visible | visible | yes | assigned active services | resets time on change | assigned to effective employee |
| date | visible | visible | yes | route param default + local selector | resets time on change | not in past |
| start time | visible | visible | yes | derived slot chips | cleared when employee/service/date changes | must remain valid at submit |
| duration | read-only | read-only | computed | selected service snapshot | recompute on service/time change | none |
| end time | read-only | read-only | computed | start + duration | recompute on service/time change | none |
| price | read-only | read-only | computed | selected service snapshot | recompute on service change | none |
| client name | visible | visible | yes | typed input | preserved until submit/cancel | non-empty, trimmed |
| client phone | visible | visible | optional | typed input | preserved until submit/cancel | normalized, length-bounded |
| notes | visible | visible | optional | typed input | preserved until submit/cancel | max length |

### Defaults

- `date` defaults to the Appointments list selected date; if absent, use business-local today
- OWNER employee defaults to none selected
- BARBER employee defaults to authenticated employee
- service defaults to none selected
- time defaults to none selected
- client text fields default empty

### Submission behavior

- submit button disabled while request is in flight
- duplicate taps blocked
- back action with dirty form shows localized unsaved-change confirmation
- success returns to the list and refreshes appointments for the selected date
- conflict failure keeps the form open, clears only the selected time, reloads same-day slots, and shows a localized conflict banner

## Error contract for localized mobile handling

### Mapping rule

Mobile should map by `error.code` first, not by translated message text.

### Required mappings

- `EMPLOYEE_REQUIRED` → owner must choose a barber
- `EMPLOYEE_NOT_FOUND` / `EMPLOYEE_INACTIVE` → selected barber unavailable
- `FORBIDDEN_EMPLOYEE_SCOPE` → barber tried to create outside own scope
- `SERVICE_NOT_FOUND` / `SERVICE_INACTIVE` → selected service unavailable
- `SERVICE_NOT_ASSIGNED` → service no longer assigned to that barber
- `INVALID_LOCAL_DATE` / `INVALID_LOCAL_TIME` / `INVALID_APPOINTMENT_TIME` → invalid scheduling input
- `PAST_APPOINTMENT_NOT_ALLOWED` → appointment must be in the future
- `BARBERSHOP_CLOSED` / `OUTSIDE_WORKING_HOURS` → closed-hours failure
- `APPOINTMENT_CONFLICT` → another booking took the slot first
- fallback → existing `errors.unknownApi`

## Localization requirements

### New key groups

Add a new `appointments.create` subtree in all six locales for:
- screen title / CTA
- employee/service/date/time labels
- slot states (`available`, `selected`, `no slots`, `closed day`)
- client name / phone / notes labels + placeholders
- duration / end time / price summary
- validation messages
- submit / submitting / success
- conflict / working-hours / inactive / assignment failures
- unsaved changes confirmation
- accessibility labels for slot chips and the submit button

### Six-locale implications

- German and French need short CTA variants for narrow buttons (`Neuer Termin`, `Nouveau RDV` or equivalent concise copy)
- Simplified Chinese should avoid long compound helper text inside button labels
- no translated text must be sent back as API enum or identifier values
- date and time display must use locale formatters while preserving **barbershop timezone semantics**

## Responsive and keyboard requirements

- use `Screen scrollable keyboardAware`
- keep submit button inside scroll flow, not fixed over the keyboard
- use existing `AppTextInput` focus scrolling behavior
- slot chips must wrap cleanly on narrow widths
- summary block must tolerate long service names and multi-line translations
- owner employee/service selectors should wrap like the existing service-record buttons
- avoid modal-over-modal flows

## Security model

- API is the authorization boundary
- OWNER may create only inside owned barbershops
- BARBER employee scope must be derived from authenticated employee context, not trusted from body data
- service eligibility is revalidated server-side even if the mobile list hid invalid options
- tenant isolation stays enforced by route middleware + service-layer checks
- slot availability shown by mobile is advisory; final collision check stays server-side and DB-backed

## Implementation phases

### Batch 1 — API/domain hardening

Commit subject: `feat(api): add staff appointment creation contract`

Scope:
- appointment schema migration for client/service snapshots
- new staff create route
- stable error codes
- `barbershopTimezone` in `/me/context`
- BARBER read access for working hours
- `date=` filter on employee appointment listing

Gate:
- targeted API integration + DB tests green

### Batch 2 — Mobile appointment-create domain

Commit subject: `feat(mobile): add appointment creation domain helpers`

Scope:
- mobile types
- create appointment API client
- slot derivation helper
- create-route state helpers
- localized error mapping

Gate:
- mobile unit tests for payload, slots, and error mapping green

### Batch 3 — Mobile route and form

Commit subject: `feat(mobile): add appointment create screen`

Scope:
- hidden route `appointment-create`
- OWNER/BARBER form UI
- keyboard-safe summary and slot picker
- all six locales updated

Gate:
- mobile component/store/unit coverage green

### Batch 4 — Appointments list integration

Commit subject: `feat(mobile): connect appointment create flow to appointments list`

Scope:
- `New appointment` CTA
- selected-date handoff
- success flash + refresh + return behavior

Gate:
- owner/barber integration tests green

### Batch 5 — QA and release prep

Commit subject: `docs(qa): validate appointment creation flow`

Scope:
- manual QA evidence
- regression notes
- release branch prep later

Gate:
- local validation + physical QA pass

## Test matrix

### API

- OWNER valid creation
- BARBER valid self-scoped creation
- BARBER forged employee scope rejected
- tenant isolation
- inactive employee
- inactive service
- unassigned service
- closed day / before open / after close
- exact closing boundary
- past date/time rejection
- same-start / partial / containing overlap
- adjacent appointment allowed
- cancelled/completed/no-show overlap allowed
- concurrent request race
- malformed `localDate` / `localStartTime`
- timezone determinism from barbershop timezone
- stable error-code assertions

### Mobile

- OWNER field visibility
- BARBER field visibility
- employee → service dependency reset
- selected date default from list
- slot derivation
- summary recomputation
- duplicate submit prevention
- conflict recovery keeps context
- localized known-error mapping
- unknown-error fallback
- all six locale renders
- no translated identifiers in API payload
- keyboard-aware scroll behavior

### Physical QA

- OWNER create happy path
- BARBER create happy path
- conflict race recovery
- outside-hours rejection
- Spanish regression
- German overflow stress
- Chinese rendering
- keyboard + back-navigation behavior

## Risks

1. **Domain migration risk**: `clientId` required today, but staff booking needs guest-style client identity.
2. **Historical accuracy risk**: without snapshots, service edits rewrite appointment meaning.
3. **Timezone risk**: current mobile selected-date logic is device-local/UTC-prefix based, not barbershop-local.
4. **Working-hours shape risk**: split shifts/lunch breaks are not representable yet.
5. **Spec drift risk**: legacy docs still say only CLIENT can create appointments.

## Deferred enhancements

- native calendar picker or richer multi-week date picker
- split-shift / break-aware working hours
- appointment editing / rescheduling flow
- cancellation confirmation redesign
- client history and saved contacts
- notifications / reminders
- public/client booking experience

## Decision

**APPOINTMENT CREATION DESIGN READY — IMPLEMENTATION NEXT**

Interpretation:
- the feature is **not** a simple mobile form on top of the current API
- the implementation should start with an API/domain batch, then the mobile flow
- no further product clarification is required to start that work unless the team wants a different client-identity model than the recommended optional-`clientId` snapshot design
