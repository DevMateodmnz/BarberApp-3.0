# Proposal: Employee-Service Validation at Booking

## Intent

Clients can currently book any barbershop employee for any barbershop service — even when the employee was never assigned to perform that service. The `EmployeeService` junction table (`apps/api/prisma/schema.prisma:152-168`) defines which employees offer which services, but `createAppointment()` never checks it. This is a tenant-integrity bypass documented at `docs/SECURITY.md:144`.

## Scope

### In Scope
- Add `validateEmployeeOffersService(employeeId, serviceId)` function in `appointmentService.ts`
- Call it from `createAppointment()` after existing tenant validation calls (line 176)
- Throw `BadRequestError('Employee does not offer this service')` when the employee is not linked to the service
- Add security test: booking employeeA2 + serviceA2 (deliberately unlinked in fixtures) → 400
- Add positive test: booking employeeA1 + serviceA1 → 201
- Update `docs/SECURITY.md:144` to mark the gap as resolved

### Out of Scope
- `updateAppointment()` — schema only allows changing `startAt` and `notes`, cannot change employeeId/serviceId
- DB-level enforcement (composite FK) — over-engineered; app-level check is sufficient with existing DB unique constraint
- Schema or migration changes — not needed; the junction table and unique constraint already exist

## Capabilities

### New Capabilities
- `employee-service-validation`: validates during appointment creation that the selected employee is assigned to perform the selected service via the `EmployeeService` junction table

### Modified Capabilities
- None — no existing specs to modify

## Approach

Add a reusable private async function mirroring the existing pattern of `validateServiceBelongsToBarbershop()` (lines 86-103) and `validateEmployeeBelongsToBarbershop()` (lines 108-129):

```
prisma.employeeService.findUnique({
  where: { employeeId_serviceId: { employeeId, serviceId } }
})
```

Uses the existing `@@unique([employeeId, serviceId])` compound key — indexed, fast. If null, throw `BadRequestError`. Single caller: inserted after line 176 in `createAppointment()`, before the time-conflict check.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/services/appointmentService.ts` | Modified | Add ~12 lines: function + call in `createAppointment()` |
| `apps/api/tests/integration/security.test.ts` | Modified | Add ~2 tests exploiting the existing fixture gap |
| `docs/SECURITY.md` | Modified | Update line 144 to mark resolved |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing tests break | Low | All existing test fixtures use valid employee-service pairs; no data change needed |
| Performance regression | Low | Single indexed lookup on compound unique key |

## Rollback Plan

Revert the commit: remove the function definition and its call from `createAppointment()`, restore `docs/SECURITY.md` line. No migration, no schema change, no data cleanup needed.

## Dependencies

- PR-006 (DB double-booking constraint) — completes without conflict

## Success Criteria

- [ ] `validateEmployeeOffersService()` exists and follows existing validator pattern
- [ ] Booking with unlinked employee-service pair returns 400 `BadRequestError`
- [ ] Booking with valid employee-service pair returns 201
- [ ] All 71 existing tests continue to pass
- [ ] `docs/SECURITY.md:144` updated to show gap resolved
- [ ] No schema or migration changes introduced
