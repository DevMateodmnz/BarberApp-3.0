# Employee Availability

Employee availability is now resolved per employee rather than inferred only from the barbershop-wide schedule. This closes the product gap where public booking, staff booking, rescheduling, and the daily Agenda could treat a barber as available merely because the shop itself was open.

## Scope

This milestone adds:

- explicit employee schedule mode;
- employee weekly working intervals;
- employee date exceptions for full-day time off or special hours;
- one canonical effective-schedule resolver used by all booking surfaces;
- conflict reporting for existing appointments that fall outside a newly saved employee schedule.

It does **not** add:

- attendance / clock-in;
- payroll or commissions;
- leave approvals;
- recurring appointments;
- automatic repair of existing out-of-hours appointments.

## Inheritance model

Each employee now has a persisted `scheduleMode`:

- `INHERIT_BARBERSHOP`
- `CUSTOM`

Default is `INHERIT_BARBERSHOP`, which preserves pre-migration behavior for every existing employee.

### `INHERIT_BARBERSHOP`

The employee's weekly base schedule is the barbershop weekly schedule, still narrowed by:

1. barbershop date exceptions;
2. employee inactivity;
3. optional employee date exceptions.

No fake employee weekly rows are created just to represent inheritance.

### `CUSTOM`

The employee's base schedule comes from explicit employee weekly intervals.

Those intervals are validated so they never expand availability beyond the barbershop's own effective hours.

Current scope remains **one interval per employee per weekday**, matching the existing barbershop weekly-hours capability. Split shifts are deferred and documented rather than implied.

## Data model

### Employee weekly schedule

`EmployeeWorkingInterval` stores:

- `barbershopId`
- `employeeId`
- `dayOfWeek`
- `openTime`
- `closeTime`
- timestamps

Constraints and indexes enforce:

- tenant-safe employee/barbershop ownership;
- weekday validity;
- `openTime < closeTime`;
- one logical weekly interval per employee/day in the current product scope.

### Employee exceptions

`EmployeeScheduleException` stores one logical exception per employee + local date.

Types:

- `FULL_DAY_OFF`
- `CUSTOM_HOURS`

Optional staff-only `reason` is stored for operational context but must never be exposed publicly.

`EmployeeScheduleExceptionInterval` stores the intervals for `CUSTOM_HOURS` exceptions. `FULL_DAY_OFF` intentionally carries no intervals.

## Canonical effective resolver

`resolveEmployeeEffectiveScheduleForDate(...)` is the authoritative schedule domain.

Inputs:

1. barbershop weekly hours;
2. barbershop date exception for the local date;
3. employee active status;
4. employee schedule mode;
5. employee weekly intervals when custom;
6. employee exception for the local date;
7. barbershop timezone.

Outputs include:

- effective open intervals;
- derived closed intervals;
- source metadata for staff UI;
- staff-safe reason metadata for invalid bookings.

Core invariant:

```text
employee effective intervals ⊆ barbershop effective intervals
```

The implementation uses shared interval normalization / intersection helpers instead of per-surface branching.

## Weekly schedule and exception semantics

- `CUSTOM` with no weekly intervals means the employee is not working.
- Employee special hours may narrow or replace the employee's weekly hours for a date.
- Barbershop closures always win over employee custom hours.
- Employee custom hours outside the barbershop schedule are rejected at write time.
- Full-day time off produces no effective intervals for that local date.

## Existing appointments and conflict behavior

Changing a schedule does **not** mutate or hide future appointments.

After a schedule write, the API detects future non-deleted appointments outside the new effective schedule and returns a conflict summary with:

- `appointmentId`
- `startAt`
- `endAt`
- `customerDisplayName`
- `serviceName`
- `reasonCode`

Current conflict reasons include:

- `EMPLOYEE_NOT_WORKING`
- `OUTSIDE_CUSTOM_HOURS`
- `EMPLOYEE_TIME_OFF`
- `BARBERSHOP_CLOSED`

The mobile UI surfaces these as attention items. Notification and lifecycle behavior stays intact until staff resolves the conflict manually.

## Booking-surface integration

The same employee-effective resolver now powers:

- public availability;
- crafted public booking validation;
- staff appointment creation;
- appointment rescheduling;
- daily schedule board working intervals and available gaps.

There is no parallel public-only or staff-only schedule interpretation.

## Authorization and privacy

### OWNER

- read every employee schedule;
- update weekly schedule mode / intervals;
- create, update, delete employee exceptions;
- view conflict summaries.

### BARBER

- read only their own schedule;
- read upcoming exceptions affecting them;
- cannot modify schedules in this milestone;
- should not receive private exception reasons for other employees.

### CLIENT / public

Public booking receives only operational slot availability. It must not receive:

- schedule mode;
- time-off reason;
- staff notes;
- conflict details;
- inactive employees.

Cross-tenant probes stay hidden behind `404`.

## Timezone behavior

Every employee exception is keyed by **barbershop local date**, not server-local date.

The resolver and schedule preview use the same barbershop timezone helpers as the daily schedule board and public booking flows so a saved day off applies to the intended local business day.

## Query-efficiency strategy

Daily board and schedule responses avoid N+1 resolution by batching:

- visible employees;
- employee weekly intervals;
- employee exceptions for the selected date;
- barbershop weekly schedule;
- barbershop date exception;
- appointments used for conflict / gap derivation.

Public availability remains bounded because it resolves a single employee/date at a time.

## Deferred work

Explicitly deferred:

- split shifts / multiple weekly intervals per employee per day;
- bulk date-range leave management UX;
- leave approval workflows;
- automatic bulk rescheduling of conflicts;
- attendance and payroll.

## Manual QA to run later

Deferred manual QA should verify:

- OWNER can switch inherit/custom and save;
- OWNER can add full-day time off and special hours;
- BARBER can view but not edit their schedule;
- public booking removes invalid slots without leaking reason;
- rescheduling and Agenda reflect employee time off;
- existing out-of-hours appointments remain visible with attention indicators.
