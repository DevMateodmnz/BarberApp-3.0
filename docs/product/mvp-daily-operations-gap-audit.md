# MVP Daily Operations — Gap Audit

Audit date: 2026-06-08
Based on codebase inspection through PR-058A (62548ec).

## Purpose

Identify what daily-operations workflows are implemented, partially implemented, or missing for OWNER and BARBER roles. Used to prioritize the next PRs for the MVP milestone.

---

## 1. OWNER Daily Workflow

### 1.1 View Today Summary

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `GET /me/context` + summary endpoints via `summaryStore` |
| Mobile screen | ✅ FULLY_IMPLEMENTED | Home screen shows `DailySummarySection` with revenue, employee breakdown, payment-method breakdown |
| Date navigation | ✅ FULLY_IMPLEMENTED | Yesterday/Today arrows + `isTodayDateString` indicator |
| Pull-to-refresh | ✅ FULLY_IMPLEMENTED | Both summary and records refresh on pull |
| Manual QA | ✅ FULLY_IMPLEMENTED | Covered in `mobile-service-record-creation.md` |

### 1.2 Manage Services

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | CRUD: `POST`, `GET`, `PATCH`, `DELETE` (soft deactivate) |
| Mobile screen | ✅ FULLY_IMPLEMENTED | Hidden route `services.tsx` with create/edit inline form, activate/deactivate toggle, search, filters, counts |
| Form validation | ✅ FULLY_IMPLEMENTED | `validateServiceForm()` pure helper with 14 test cases |
| Manual QA | ✅ FULLY_IMPLEMENTED | `mobile-services-management.md` |

### 1.3 Manage Employees

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `GET /employees`, `POST /employees` (by userId), `DELETE /employees/:id` (soft deactivate), `PATCH /employees/:id/reactivate` |
| Mobile screen | ❌ MISSING | No employee list, add, or deactivate/reactivate UI on mobile |
| Mobile store | ❌ MISSING | `employees.test.ts` exists for API client but no Zustand store for employee management |
| Mobile API helpers | ✅ FULLY_IMPLEMENTED | `fetchEmployees()` exists and is used by `ServiceRecordCreateSection` for employee picker |

**Gap**: OWNER cannot view or manage the employee roster from mobile. Must use API directly or database seed.

### 1.4 Manage Employee-Service Assignments

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `POST /employees/:id/services` (assign), `DELETE /employees/:id/services/:sid` (unassign), `GET /employees/:id/services` (list assigned) |
| Mobile screen | ❌ MISSING | No service assignment screen on mobile |
| Mobile store | ❌ MISSING | `employeeServices.test.ts` tests the API client but there's no Zustand store |
| Mobile API helpers | ✅ FULLY_IMPLEMENTED | `fetchEmployeeServices()` and `fetchMyAssignedServices()` exist |

**Gap**: OWNER cannot assign services to employees from mobile. Services must be assigned via API or seed. This blocks BARBER from seeing services in the creation screen unless assignments were pre-seeded.

### 1.5 Register Service Records

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `POST /service-records` + `GET /service-records` (list barbershop) |
| Mobile screen | ✅ FULLY_IMPLEMENTED | `record-service.tsx` with `ServiceRecordCreateSection` |
| Employee picker | ✅ FULLY_IMPLEMENTED | OWNER selects employee, BARBER uses own context |
| Service picker | ✅ FULLY_IMPLEMENTED | Loads assigned services per employee |
| Price handling | ✅ FULLY_IMPLEMENTED | Auto-fill, custom preservation (PR-055A), price-differs indicator |
| Payment method | ✅ FULLY_IMPLEMENTED | CASH/CARD/TRANSFER/OTHER with formatted labels |
| Client name / notes | ✅ FULLY_IMPLEMENTED | Optional fields with validation |
| Manual QA | ✅ FULLY_IMPLEMENTED | `mobile-service-record-creation.md` |

### 1.6 View Service Records

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `GET /service-records` (barbershop-scoped) |
| Mobile screen | ✅ FULLY_IMPLEMENTED | Home screen "Service Records" card below summary |
| Fields displayed | ✅ FULLY_IMPLEMENTED | Service name, employee name, price, payment method, time, client name, notes |
| Manual QA | ✅ FULLY_IMPLEMENTED | Covered in `mobile-service-record-creation.md` |

### 1.7 Revenue / Payment Breakdown

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | Daily summary includes `byPaymentMethod` and `byEmployee` |
| Mobile summary | ✅ FULLY_IMPLEMENTED | `DailySummarySection` renders breakdowns |
| Manual QA | ✅ FULLY_IMPLEMENTED | Covered in `mobile-service-record-creation.md` |

---

## 2. BARBER Daily Workflow

### 2.1 View Own Context

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `GET /me/context` returns employeeId, barbershopId |
| Mobile | ✅ FULLY_IMPLEMENTED | `useContextStore` loads context; Home screen shows barber-specific summary |

### 2.2 See Assigned Services

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `GET /me/services` returns BARBER's assigned services |
| Mobile | ✅ FULLY_IMPLEMENTED | `fetchMyAssignedServices()` loads services in `ServiceRecordCreateSection` |
| Dependency | ⚠️ BLOCKED by 1.4 | BARBER only sees services if OWNER assigned them (API or seed) — no mobile assignment UI |

### 2.3 Register Performed Services

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `POST /service-records` with BARBER role enforcement (self only) |
| Mobile | ✅ FULLY_IMPLEMENTED | BARBER mode in `ServiceRecordCreateSection`: no employee picker, own services loaded, same price/payment/client/notes flow |

### 2.4 View Own Records / Summary

| Layer | Status | Details |
|-------|--------|---------|
| Backend API | ✅ FULLY_IMPLEMENTED | `GET /employees/:id/service-records` with BARBER self-scoping |
| Mobile | ✅ FULLY_IMPLEMENTED | BARBER sees own records only (dual enforcement: store + backend) |

---

## 3. CLIENT Workflow

| Feature | Status | Details |
|---------|--------|---------|
| Home screen | ✅ PARTIALLY_IMPLEMENTED | Shows "Client dashboard coming soon" message |
| Appointment booking | ❌ MISSING | Backend has appointment endpoints; no mobile CLIENT booking flow |
| Browse services | ❌ MISSING | No service catalog for CLIENT |
| Client appointment history | ❌ MISSING | Backend `listClientAppointments` exists; no mobile UI |

**Assessment**: CLIENT features are intentionally deferred. The product spec lists appointment booking as an MVP feature, but the current focus is OWNER/BARBER daily operations.

---

## 4. Backend Infrastructure

### 4.1 Auth / Authorization

| Feature | Status | Details |
|---------|--------|---------|
| Clerk JWT validation | ✅ FULLY_IMPLEMENTED | `requireAuth` middleware |
| Role-based access | ✅ FULLY_IMPLEMENTED | `requireRole('OWNER', 'BARBER')` with multi-role support |
| Tenant isolation | ✅ FULLY_IMPLEMENTED | `requireBarbershopAccess` + Prisma where clauses |
| Input validation | ✅ FULLY_IMPLEMENTED | Zod schemas via `validateBody` middleware |
| Rate limiting | ✅ FULLY_IMPLEMENTED | Global + per-route rate limits |
| Webhook sync | ✅ FULLY_IMPLEMENTED | Clerk webhook for user create/update/delete |

### 4.2 Backend Test Coverage

| Area | # Tests | Status |
|------|---------|--------|
| DB model tests | Multiple | ✅ `db/models.test.ts` + `db/double-booking.test.ts` |
| Employee integration | Multiple | ✅ `integration/employee.test.ts` |
| Service integration | Multiple | ✅ `integration/service.test.ts` |
| Service record integration | Multiple | ✅ `integration/serviceRecord.test.ts` |
| Working hours integration | Multiple | ✅ `integration/workingHours.test.ts` |
| Security tests | Multiple | ✅ `integration/security.test.ts` |
| Rate limit tests | Multiple | ✅ `integration/rateLimit.test.ts` |
| Webhook tests | Multiple | ✅ `integration/webhook.test.ts` |
| Me context tests | Multiple | ✅ `integration/meContext.test.ts` |

**Assessment**: Backend has solid integration test coverage across all major domains. All current endpoints are tested.

---

## 5. Mobile Infrastructure

### 5.1 Screens / Routes

| Screen | Route | Tab visible? | Status |
|--------|-------|-------------|--------|
| Home | `(tabs)/index` | ✅ Yes | FULLY_IMPLEMENTED |
| Record Service | `(tabs)/record-service` | ❌ `href: null` | FULLY_IMPLEMENTED |
| Services | `(tabs)/services` | ❌ `href: null` | FULLY_IMPLEMENTED |
| Employee mgmt | — | — | ❌ MISSING |
| Service assignment | — | — | ❌ MISSING |
| Working hours | — | — | ❌ MISSING |
| Appointment booking | — | — | ❌ MISSING |

### 5.2 Component Library

| Component | Status | Used by |
|-----------|--------|---------|
| `DailySummarySection` | ✅ FULLY_IMPLEMENTED | Home screen |
| `ServiceRecordCreateSection` | ✅ FULLY_IMPLEMENTED | Record Service screen |

### 5.3 Zustand Stores

| Store | Status | Tests |
|-------|--------|-------|
| `useContextStore` | ✅ | `store.test.ts` (6 tests) |
| `useSummaryStore` | ✅ | `summaryStore.test.ts` (15 tests) |
| `useRecordsStore` | ✅ | `recordsStore.test.ts` (8 tests) |
| `useServicesStore` | ✅ | `servicesStore.test.ts` (10 tests) |
| `useFlashStore` | ✅ | `flashStore.test.ts` (5 tests) |
| Employee store | ❌ MISSING | No Zustand store for employees |
| Employee-services store | ❌ MISSING | No Zustand store for assignments |

### 5.4 Mobile Test Coverage

| Area | # Tests | Files |
|------|---------|-------|
| Format helpers | 63 | `format.test.ts` |
| Service records (API + payload + validation) | 34 | `serviceRecords.test.ts` |
| Service filters | 20 | `serviceFilters.test.ts` |
| Summary store | 15 | `summaryStore.test.ts` |
| Service form validation | 14 | `serviceForm.test.ts` |
| Services store | 10 | `servicesStore.test.ts` |
| Context store | 9 | `context.test.ts` |
| Records store | 8 | `recordsStore.test.ts` |
| API: services | 7 | `services.test.ts` |
| API: summary | 7 | `summary.test.ts` |
| Context API | 9 | `context.test.ts` |
| Flash store | 5 | `flashStore.test.ts` |
| API: employee services | 4 | `employeeServices.test.ts` |
| API: employees | 2 | `employees.test.ts` |
| Placeholder | 2 | `placeholder.test.ts` |
| **Total** | **206** | **15 files** |

**Note**: No component tests — RN/Vitest component-test infrastructure is blocked. All tests are pure helpers, API clients, or isolated store logic.

---

## 6. Manual QA Coverage

| Doc | Covers | Status |
|-----|--------|--------|
| `mobile-services-management.md` | Services CRUD, filters, search, activation | ✅ |
| `mobile-service-record-creation.md` | OWNER/BARBER record creation, price intent, validation, role restrictions | ✅ |
| Employee management | — | ❌ MISSING |
| Service assignment | — | ❌ MISSING |

---

## 7. Security / Tenant Boundaries

| Boundary | Enforcement | Status |
|----------|------------|--------|
| Auth required on all routes | `requireAuth` middleware | ✅ |
| Role-based access | `requireRole(...)` on every route | ✅ |
| Tenant isolation | `requireBarbershopAccess` + Prisma `where.barbershopId` | ✅ |
| BARBER self-scoping | Backend checks `employee.userId === userId` | ✅ |
| Input validation | Zod schemas on all mutations | ✅ |
| Soft deletes | `deletedAt` on Employee, Service, Barbershop | ✅ |
| No hardcoded IDs | All IDs from route params or auth context | ✅ |

**Assessment**: Security posture is solid. Defense-in-depth with middleware + service-layer enforcement.

---

## 8. Known Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| No component tests (RN/Vitest) | UI regressions can only be caught manually | Manual QA checklists + pure helper test coverage |
| No mobile employee management | OWNER must use API/database to manage employees | Next PR candidate |
| No mobile service assignment | BARBER can't see services unless pre-assigned | Next PR candidate |
| No performedAt date-time picker | All records use current server time | Acceptable for MVP; `performedAt` sent by backend |
| No edit/delete service records | Mistakes can't be corrected on mobile | API-level edit/delete exists but no mobile UI |
| No offline queue | Records require active connection | Acceptable for MVP |
| No CLIENT features | Appointment booking not available | Deferred post-MVP |
| No multi-service cart | One record per submission | Acceptable for MVP |
| Filter/search not persisted | Resets on app restart | Low impact; Zustand persistence can be added later |

---

## 9. Top 5 Next PR Candidates

Ranked by MVP value for daily barbershop operations:

### #1 — Employee management screen (mobile)

**What**: New hidden screen in `(tabs)/` showing employee list with activate/deactivate toggle.
**Why**: OWNER needs to manage their employee roster from mobile. Backend is fully implemented; only mobile UI is missing.
**Effort**: Small-medium (1 screen, 1 Zustand store, ~10 tests)
**Dependencies**: None
**MVP impact**: HIGH — unlocks employee lifecycle management without API/DB access.

### #2 — Employee add flow (mobile)

**What**: Form to add an employee by email/userId on the employee management screen.
**Why**: OWNER needs to onboard new barbers. Backend `POST /employees` is implemented.
**Effort**: Small (1 form, reuses `validateServiceForm` pattern)
**Dependencies**: #1 (employee list screen as parent)
**MVP impact**: HIGH — completes the employee onboarding loop.

### #3 — Service assignment screen (mobile)

**What**: On an employee detail or the services screen, allow OWNER to assign/unassign services to/from employees.
**Why**: Without this, BARBER can only see services that were assigned via API/seed. This is the critical link between services management and barber record creation.
**Effort**: Medium (reuses existing service picker pattern, 1 Zustand store)
**Dependencies**: #1 (need employee context to assign to)
**MVP impact**: HIGH — unlocks BARBER record creation in real-world setup.

### #4 — Working hours management (mobile)

**What**: Screen to view/update barbershop working hours (opening/closing per day).
**Why**: Backend `GET`/`PUT /working-hours` is implemented. Useful for scheduling but not blocking daily record creation.
**Effort**: Small (1 screen, read/write from existing API)
**Dependencies**: None
**MVP impact**: MEDIUM — nice to have, not blocking core ops.

### #5 — Service record detail / delete (mobile)

**What**: Tap a service record on the Home screen to see full details or delete (soft).
**Why**: Mistakes happen — OWNER should be able to correct a wrongly-entered record. Backend has soft-delete infrastructure.
**Effort**: Small (detail modal + delete confirmation)
**Dependencies**: None
**MVP impact**: MEDIUM — improves data quality, not blocking core flow.

---

## 10. Recommended Next PR

**PR-060A: Employee management screen (mobile)**

This is the highest-value next step because:
1. Backend is fully implemented and tested
2. It unblocks employee lifecycle management without API/DB access
3. It's a natural prerequisite for service assignment (#3)
4. It's a small vertical slice (1 screen, 1 store, ~10 tests)
5. It closes the most visible operational gap for OWNERs

After PR-060A, PR-061A (employee add) and PR-062A (service assignment) complete the MVP daily-operations loop: OWNER sets up services → adds employees → assigns services → BARBER records performed work → both view daily summary.

---

## Appendix: Backend Endpoint Inventory

All endpoints in `apps/api/src/routes/barbershops.ts` (base: `/api/v1/barbershops`):

| Method | Path | Role | Status |
|--------|------|------|--------|
| GET | `/:id/employees` | OWNER | ✅ |
| POST | `/:id/employees` | OWNER | ✅ |
| DELETE | `/:id/employees/:eid` | OWNER | ✅ (soft) |
| PATCH | `/:id/employees/:eid/reactivate` | OWNER | ✅ |
| POST | `/:id/employees/:eid/services` | OWNER | ✅ |
| GET | `/:id/employees/:eid/services` | OWNER | ✅ |
| DELETE | `/:id/employees/:eid/services/:sid` | OWNER | ✅ |
| GET | `/:id/me/services` | BARBER | ✅ |
| GET | `/:id/employees/:eid/appointments` | OWNER, BARBER | ✅ |
| GET | `/:id/working-hours` | OWNER | ✅ |
| PUT | `/:id/working-hours` | OWNER | ✅ |
| POST | `/:id/services` | OWNER | ✅ |
| GET | `/:id/services` | OWNER | ✅ |
| PATCH | `/:id/services/:sid` | OWNER | ✅ |
| DELETE | `/:id/services/:sid` | OWNER | ✅ (soft) |
| POST | `/:id/service-records` | OWNER, BARBER | ✅ |
| GET | `/:id/service-records` | OWNER | ✅ |
| GET | `/:id/employees/:eid/service-records` | OWNER, BARBER | ✅ |

Additional routes:
- `apps/api/src/routes/me.ts`: `GET /me/context` (all roles) ✅
- `apps/api/src/routes/appointments.ts`: CRUD for appointments ✅
- `apps/api/src/routes/webhooks.ts`: Clerk webhook handler ✅

**All 21 barbershop endpoints are implemented and tested. Mobile covers 6 of 21.** The remaining 15 are the gap for mobile development.
