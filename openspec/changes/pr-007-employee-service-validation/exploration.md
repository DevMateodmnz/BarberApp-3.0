## Exploration: Employee-Service Validation at Booking (PR-007)

### Current State

The system has a full many-to-many relationship between employees and services via the `EmployeeService` junction table (`apps/api/prisma/schema.prisma:152-168`). Each employee can offer multiple services, and each service can be performed by multiple employees. The constraint `@@unique([employeeId, serviceId])` prevents duplicate assignments at the DB level.

However, the appointment service layer (`apps/api/src/services/appointmentService.ts`) does **not** check this junction table when creating or updating appointments. It validates:
1. **Service belongs to barbershop** (line 175) — `validateServiceBelongsToBarbershop()`, lines 86-103
2. **Employee belongs to barbershop + is active** (line 176) — `validateEmployeeBelongsToBarbershop()`, lines 108-129
3. **No time conflict** (line 187) — `hasTimeConflict()`, lines 140-158
4. **DB-level exclusion constraint** catches double-booking races on concurrent insert

There is **zero** reference to `EmployeeService` anywhere in `appointmentService.ts`. A client can book any employee for any service as long as both belong to the same barbershop — even if that employee was never assigned to perform that service.

The gap is explicitly documented in `docs/SECURITY.md:144`:
> "The service layer validates employee and service belong to the barbershop, but does NOT check that the employee is assigned to perform the specific service (EmployeeService junction). This should be added."

### Affected Areas

- `apps/api/src/services/appointmentService.ts:168-223` — `createAppointment()`: needs employee-service compatibility check added after the existing tenant validation calls (line 176)
- `apps/api/src/services/appointmentService.ts:315-389` — `updateAppointment()`: does NOT need the check because `UpdateAppointmentSchema` (`apps/api/src/schemas/appointment.ts:16-21`) only accepts `startAt` and `notes` — it cannot change `employeeId` or `serviceId`
- `apps/api/src/schemas/appointment.ts:6-14` — `CreateAppointmentSchema`: already accepts `employeeId` and `serviceId`, no schema change needed
- `apps/api/src/routes/appointments.ts:39-54` — POST route: no change needed, validation happens in service layer
- `apps/api/src/lib/errors.ts` — existing `BadRequestError` (400) is the appropriate error class; no new error class needed
- `apps/api/tests/integration/security.test.ts:124-131` — fixture data already has deliberate gap (employeeA2 NOT linked to serviceA2) that can be exploited for a new test
- `apps/api/prisma/schema.prisma:152-168` — EmployeeService model exists, `@@unique([employeeId, serviceId])` is present; no migration needed
- `docs/SECURITY.md:144` — explicitly lists this as remaining risk #5; should be updated after fix

### Approaches

1. **Single inline Prisma query in `createAppointment()`** — Add a `prisma.employeeService.findUnique({ where: { employeeId_serviceId: { employeeId, serviceId } } })` check after line 176, throw `BadRequestError` if null.
   - Pros: Minimal code (4-5 lines), no new function, uses existing unique constraint for fast indexed lookup, no migration needed, follows existing pattern of inline validation
   - Cons: Slightly less reusable; if another function needs this check later, it would need duplication
   - Effort: Low

2. **Reusable validation function** — Extract a `validateEmployeeOffersService(employeeId, serviceId)` function similar to existing `validateServiceBelongsToBarbershop()`, call it from `createAppointment()`.
   - Pros: Consistent with existing validation function pattern (lines 86-129), reusable if needed elsewhere, clean separation
   - Cons: Slightly more code, marginally more indirection
   - Effort: Low

3. **DB-level foreign-key-like enforcement** — Add a composite foreign key from `Appointment(employeeId, serviceId)` → `EmployeeService(employeeId, serviceId)` via Prisma relation or PostgreSQL constraint.
   - Pros: Would prevent the gap at the database level, defense-in-depth
   - Cons: Requires migration, changes the Prisma schema, adds complexity, could break if an employee is later unlinked from a service but historical appointments should remain; over-engineered for this use case
   - Effort: Medium

### Recommendation

**Approach 2** — a reusable `validateEmployeeOffersService()` function.

Rationale:
- Follows the established pattern: the service already has `validateServiceBelongsToBarbershop()` and `validateEmployeeBelongsToBarbershop()` as private async functions. A `validateEmployeeOffersService()` is the natural third tenant-integrity check.
- The check is a single `prisma.employeeService.findUnique()` call using the existing `@@unique([employeeId, serviceId])` compound key — lightning fast, indexed.
- No migration needed. The junction table already exists with the unique constraint.
- Error type: `BadRequestError` (400), consistent with the other tenant validation failures (lines 99, 121, 127).
- Only needed in `createAppointment()`, not `updateAppointment()`, since update cannot change employeeId or serviceId.

Placement in `createAppointment()`:
```
Line 175: await validateServiceBelongsToBarbershop(serviceId, barbershopId);
Line 176: await validateEmployeeBelongsToBarbershop(employeeId, barbershopId);
→ NEW:  await validateEmployeeOffersService(employeeId, serviceId);
Line 178: // 2. Calculate endAt from service duration
```

Test fixture exploit (already set up in `security.test.ts:124-131`):
- Employee A1 offers: serviceA1, serviceA2
- Employee A2 offers: serviceA1 **only** (NOT serviceA2)
- A test booking employeeA2 + serviceA2 should be rejected with 400
- All existing tests use valid employee-service pairs and will continue passing

### Risks

- **Very low risk**: The change is a pure addition — no existing code path is modified, only a new guard clause is inserted. All existing tests use employee-service pairs that exist in the junction table and will pass unchanged.
- **No data migration needed**: The `EmployeeService` junction table and its unique constraint already exist.
- **No schema change**: Schema and migration are untouched.

### Ready for Proposal

Yes — the gap is confirmed, the fix is trivial (one Prisma query, one error throw), the test data already has an exploitable gap, and no migration is needed. The orchestrator can proceed to proposal.
