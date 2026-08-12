# Operational Daily Schedule Board

The Operational Daily Schedule Board adds a bounded day-view agenda to the existing mobile appointments area. It is an operator tool for running the current day, not an analytics dashboard.

## Quick path

1. Call `GET /api/v1/barbershops/:barbershopId/schedule/day?date=YYYY-MM-DD&employeeId?`.
2. Render either the OWNER all-employees summary or one employee timeline in the mobile Agenda mode.
3. Reuse existing create, detail, lifecycle, cancel, and reschedule flows from each agenda item.

## API contract

| Topic | Decision |
| --- | --- |
| Route | `GET /api/v1/barbershops/:barbershopId/schedule/day` |
| Query | `date` required, `employeeId` optional |
| Envelope | Standard API envelope: `{ success: true, data }` |
| Roles | `OWNER`, `BARBER`; `CLIENT` forbidden |
| Tenant hiding | Cross-tenant access returns `404` for this endpoint |
| Date semantics | The query date is interpreted in the barbershop timezone |
| Scope | One bounded local day only |
| PII | No customer notes, Clerk IDs, full notification payloads, public booking references, or private provider details |

Each employee payload includes:

- employee identity (`id`, `name`, `isCurrentUser`)
- schedule mode and working-day availability state
- working-day intervals and derived closed intervals
- status summary and `minimumBookableDuration`
- operational `availableGaps`
- appointment summaries with server-derived capability flags and outside-hours indicators

Each appointment summary is intentionally compact:

- `id`, `employeeId`, `employeeName`
- `serviceId`, `serviceName`
- `startAt`, `endAt`, `localStartTime`, `localEndTime`
- `status`, `clientDisplayName`, `customerId`
- `isReturningCustomer`, `completedVisitCount`
- `noShowCount`, `hasPreviousNoShows`
- cheap notification failure summary only
- `canReschedule`, `canStart`, `canComplete`, `canMarkNoShow`, `canCancel`

## Timezone and day boundaries

All day math uses the barbershop timezone from the persisted barbershop record.

- The API converts the local `YYYY-MM-DD` into an exact UTC range with `getUtcRangeForLocalDate(...)`.
- Display labels use the same timezone-aware helpers.
- `currentTime` is returned only when the requested local date equals the barbershop's local "today".
- Invalid dates are rejected by schema validation before domain work starts.
- The implementation is DST-safe because the local-day → UTC conversion does not assume server-local time.

## Working-window derivation

The board now reuses the same **employee-effective** schedule inputs as the rest of availability:

1. barbershop weekly working hours
2. barbershop schedule exceptions
3. employee schedule mode (`INHERIT_BARBERSHOP` or `CUSTOM`)
4. employee weekly custom intervals
5. employee date exceptions (`FULL_DAY_OFF`, `CUSTOM_HOURS`)
6. employee active status

`resolveEmployeeEffectiveScheduleForDate(...)` is now the canonical schedule source. The board does not persist its own daily snapshot.

Closed intervals shown in the timeline are derived from gaps between effective schedule intervals, including employee-specific time off and special-hours narrowing. Existing appointments that no longer fit the current schedule remain visible and are marked with an attention indicator instead of being hidden.

## Blocking statuses

Slot blocking is canonicalized in `apps/api/src/lib/appointmentBlocking.ts`.

Blocking statuses:

- `PENDING`
- `CONFIRMED`
- `IN_PROGRESS`

Non-blocking statuses:

- `COMPLETED`
- `CANCELLED`
- `NO_SHOW`

The board, appointment services, and availability logic should all reuse this helper instead of forking status rules.

## Gap semantics

An available gap is an operational window, not a guaranteed service-specific booking slot.

Gap calculation uses:

1. effective working intervals
2. derived closures / schedule exceptions
3. blocking appointments
4. current time when the viewed date is today
5. the employee's shortest active assigned service duration

Rules:

- gaps never overlap appointments
- gaps stay inside working intervals
- past-only gaps for today are omitted
- partially past gaps for today are clipped forward to the next 30-minute slot boundary
- gaps smaller than the employee's shortest active assigned service are not shown as actionable
- the board does not invent a final slot until appointment creation rechecks availability after a service is chosen

## Role visibility

| Role | Visibility |
| --- | --- |
| OWNER | May see all active employees or filter to one employee, including who is working / off / on time off |
| BARBER | Restricted to their own employee schedule only |
| CLIENT | Forbidden |

The schedule-board route enforces BARBER scope in the service layer so the endpoint can hide cross-tenant access with `404` without relying on the broader tenant middleware. Private employee-exception reasons are not exposed through the board.

## Query efficiency strategy

The day endpoint is bounded and avoids N+1 queries by batching:

- one grouped appointment query for the day
- one employee-service query for minimum durations
- one grouped notification-failure query by `appointmentId`
- one grouped appointment aggregation by `customerId` + `status`

No separate per-appointment customer-history lookup is performed.

## Mobile design decision

The mobile appointments area now has two modes:

- `Lista`
- `Agenda`

Agenda is phone-first:

- shared date navigation
- OWNER employee chips
- OWNER "All" summary cards instead of compressed columns
- employee chips/status badges for working, off, custom hours, and time off
- BARBER default self agenda
- chronological rows for current time, closures, gaps, and appointments
- attention labels for appointments that sit outside the employee's current effective schedule

The existing list mode remains intact.

## Current-time behavior

When viewing the barbershop's local today, the API returns `currentTime` and the mobile timeline renders a visible current-time row.

When viewing another date, no current-time row is rendered.

Automatic scroll-to-now is deferred; the current implementation favors a stable, readable list over aggressive time-driven repositioning.

## Deferred decisions

Explicitly deferred from this milestone:

- multi-column tablet / desktop calendar layout
- drag-and-drop scheduling
- automatic aggressive polling
- persisted schedule-board snapshots
- public schedule-board access

## Checklist

- [x] One-day bounded API contract
- [x] Timezone-safe local-day calculation
- [x] Shared blocking-status helper
- [x] Gap-to-create prefill flow
- [x] Canonical detail / reschedule integration
- [x] OWNER/BARBER role scoping
- [x] No extra migration required

## Dependency update

The board originally shipped on top of barbershop-wide hours only. It now depends on the employee-availability domain so Agenda, public booking, staff booking, and rescheduling all agree on who is actually working that day.

## Next step

With employee-specific availability now implemented, the next product milestone can safely be deposit policy and Mercado Pago reservation holds.
