# BarberApp v3.0 — Roadmap

## Overview

Implementation roadmap for BarberApp v3.0, following Spec-Driven Development with mandatory TDD and QA validation at each phase.

## Phase Structure

Each phase follows this cadence:
1. **Plan**: Create/expand SDD specs
2. **Implement**: TDD with tests first
3. **Validate**: Run full test suite
4. **QA Report**: Document results, get sign-off

---

## Phase 1: Foundation (Current)

**Goal**: Create clean project structure with documentation and test infrastructure.

### Deliverables

- [x] Folder structure `BarberApp-3.0/`
- [x] Documentation:
  - [x] RESTART_PLAN.md
  - [x] PRODUCT_SPEC.md
  - [x] ARCHITECTURE.md
  - [x] SECURITY_MODEL.md
  - [x] QA_STRATEGY.md
  - [x] ROADMAP.md
  - [x] AI_HANDOFF.md
- [x] Test infrastructure (Vitest)
- [x] Basic CI validation script

### Definition of Done

- New folder exists at `/home/mateo/Documents/coding/BarberApp-3.0/`
- All docs created and accurate
- `npm test` runs without errors
- No hardcoded values in code
- QA report generated

### Status: **IN PROGRESS**

---

## Phase 2: Database & ORM

**Goal**: Prisma schema with migrations and seed data.

### Deliverables

- [x] Prisma schema (`schema.prisma`)
- [x] Migrations for all models
- [x] Seed script with realistic data
- [x] Database tests:
  - [x] Model creation
  - [x] Foreign key constraints
  - [x] Index existence
  - [x] Soft delete behavior
  - [x] Tenant isolation

### SDD Artifacts

- [x] `spec/database.md` - Database design (integrated in ARCHITECTURE.md)
- [x] `spec/models.md` - Model specifications (in schema.prisma)

### Commands

```bash
cd apps/api
npx prisma migrate dev
npx prisma db seed
npm run test:db
```

### Dependencies

- Phase 1 complete

**Status: ✅ COMPLETE**

---

## Phase 3: API Foundation

**Goal**: Core API endpoints with authentication and authorization.

### Deliverables

### Authentication

- [ ] Clerk webhook handler
- [ ] User sync to database
- [ ] Auth middleware
- [ ] GET /api/v1/auth/me

### Barbershops CRUD

- [ ] POST /api/v1/barbershops (owner)
- [ ] GET /api/v1/barbershops (list owned)
- [ ] GET /api/v1/barbershops/:id
- [ ] PUT /api/v1/barbershops/:id
- [ ] DELETE /api/v1/barbershops/:id

### Employees CRUD

- [ ] POST /api/v1/employees (owner)
- [ ] GET /api/v1/employees (list, with filter)
- [ ] GET /api/v1/employees/:id
- [ ] PUT /api/v1/employees/:id
- [ ] DELETE /api/v1/employees/:id

### Services CRUD

- [ ] POST /api/v1/services (owner)
- [ ] GET /api/v1/services (list, with filter)
- [ ] GET /api/v1/services/:id
- [ ] PUT /api/v1/services/:id
- [ ] DELETE /api/v1/services/:id

### Validation Tests

- [ ] Zod schema tests for each model
- [ ] API validation tests for each endpoint
- [ ] Error response format tests

### Security Tests

- [ ] Auth middleware tests (valid/invalid/expired token)
- [ ] Role permission tests for each endpoint
- [ ] Tenant isolation tests
- [ ] Input sanitization tests

### Dependencies

- Phase 2 complete

---

## Phase 4: Appointments Core

**Goal**: Appointment booking with double-booking prevention.

### Deliverables

### Appointments CRUD

- [ ] POST /api/v1/appointments (client)
- [ ] GET /api/v1/appointments (filtered by role)
- [ ] GET /api/v1/appointments/:id
- [ ] PUT /api/v1/appointments/:id
- [ ] DELETE /api/v1/appointments/:id (cancel)

### Status Management

- [ ] PUT /api/v1/appointments/:id/status
- [ ] Status transition validation
- [ ] Status history tracking

### Availability

- [ ] GET /api/v1/employees/:id/availability
- [ ] Slot calculation based on existing appointments
- [ ] Service duration consideration

### Core Business Logic

- [ ] Double-booking prevention
- [ ] Time conflict detection
- [ ] Business hours enforcement
- [ ] Employee service assignment validation

### Tests

- [ ] Appointment creation tests
- [ ] Double-booking prevention tests (CRITICAL)
- [ ] Status transition tests
- [ ] Availability calculation tests
- [ ] Permission tests for each status transition

### Dependencies

- Phase 3 complete

---

## Phase 5: Mobile Foundation

**Goal**: Mobile app structure with authentication.

### Deliverables

### Project Setup

- [ ] Expo project initialized
- [ ] TypeScript configuration
- [ ] Navigation structure
- [ ] UI component library
- [ ] Zustand stores

### Authentication

- [ ] Clerk Expo integration
- [ ] Sign in screen
- [ ] Sign up screen
- [ ] Session management
- [ ] Protected routes

### API Client

- [ ] Axios client with token injection
- [ ] Error handling
- [ ] Response interceptors
- [ ] Offline handling (basic)

### CI

- [ ] Mobile build validation
- [ ] TypeScript check in CI

### Dependencies

- Phase 3 complete (API must be runnable)

---

## Phase 6: Mobile Features

**Goal**: Full mobile functionality for all roles.

### Deliverables

### Owner Features

- [ ] Dashboard with stats
- [ ] Barbershop settings screen
- [ ] Employee management screen
- [ ] Service management screen
- [ ] Appointment list (all)
- [ ] Appointment details with status actions

### Barber Features

- [ ] My appointments list
- [ ] Appointment details
- [ ] Mark status actions

### Client Features

- [ ] Browse barbershops
- [ ] View barber profiles
- [ ] View services
- [ ] Book appointment flow
- [ ] My appointments list
- [ ] Cancel appointment

### UI/UX

- [ ] Pull-to-refresh on lists
- [ ] Loading states
- [ ] Error handling with retry
- [ ] Empty states
- [ ] Form validation feedback

### Dependencies

- Phase 4 complete

---

## Phase 7: Integration & Final QA

**Goal**: E2E tests and owner sign-off.

### Deliverables

### E2E Tests

- [ ] Playwright setup
- [ ] Owner signup flow
- [ ] Owner creates barbershop
- [ ] Owner adds employees
- [ ] Owner adds services
- [ ] Client signup flow
- [ ] Client books appointment
- [ ] Owner sees new appointment
- [ ] Status transition flows

### Documentation

- [ ] API reference (auto-generated from routes)
- [ ] Mobile user guide
- [ ] Deployment guide

### Final QA

- [ ] Full test suite passes
- [ ] Owner manual QA checklist completed
- [ ] Performance check (API response times)
- [ ] Security review
- [ ] Final sign-off

### Dependencies

- All previous phases complete

---

## Timeline Estimates

| Phase | Complexity | Est. Time |
|-------|------------|-----------|
| Phase 1 | Low | 2-4 hours |
| Phase 2 | Medium | 4-8 hours |
| Phase 3 | High | 8-16 hours |
| Phase 4 | High | 8-16 hours |
| Phase 5 | Medium | 4-8 hours |
| Phase 6 | High | 12-20 hours |
| Phase 7 | Medium | 4-8 hours |
| **Total** | - | **36-80 hours** |

## Current Status

```
Phase 1: Foundation [==========] 80%
Phase 2: Database              []
Phase 3: API Foundation        []
Phase 4: Appointments Core     []
Phase 5: Mobile Foundation     []
Phase 6: Mobile Features       []
Phase 7: Integration & QA     []
```

## Next Action

After Phase 1 sign-off:

```
Run: /sdd-new database
Focus: Prisma schema and migrations
```

---

## Notes

- Each phase builds on the previous - no skipping
- If a phase reveals issues, go back and fix before continuing
- Owner QA is blocking - don't skip manual validation
- If tests are flaky, fix them before adding new features
