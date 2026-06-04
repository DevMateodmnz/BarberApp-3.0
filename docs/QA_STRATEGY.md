# BarberApp v3.0 — QA Strategy

## Overview

Quality assurance in BarberApp v3.0 follows a rigorous test-first approach. No feature is considered complete until it passes tests and manual validation.

## Test Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  ← 10% - Critical user flows
                    │    Tests    │
                    ├─────────────┤
                    │ Integration │  ← 30% - API routes, DB queries
                    │    Tests    │
                    ├─────────────┤
                    │   Unit      │  ← 50% - Business logic, validation
                    │    Tests    │
                    ├─────────────┤
                    │   Static    │  ← 10% - Type checking, linting
                    │   Analysis   │
                    └─────────────┘
```

## Current Test Status (Phase 2 Complete)

**Phase 1**: Infrastructure smoke tests only (placeholder.test.ts files).

**Phase 2**: Database model tests implemented:
- User creation with unique constraints (clerkUserId, email)
- Barbershop creation with owner relation
- Employee creation with barbershop/user relations
- Duplicate employee prevention (unique barbershop+user)
- Service creation with barbershop relation
- EmployeeService linking with duplicate prevention
- Appointment creation with all relations
- Appointment status enum validation
- Soft delete support on all applicable models
- Cross-tenant data isolation verified

**Deferred to Phase 3**:
- API-level tenant isolation
- Double-booking prevention (requires application logic)
- Authentication/authorization tests
- API validation tests

## Unit Tests (Phase 3+)

## Unit Tests

### Scope

- Zod validation schemas
- Business logic functions (appointment conflict detection, etc.)
- Utility functions
- Zustand store actions (isolated)

### Location

```
apps/api/tests/unit/
├── schemas/
│   ├── barbershop.test.ts
│   ├── employee.test.ts
│   ├── service.test.ts
│   └── appointment.test.ts
└── services/
    └── appointmentConflict.test.ts

apps/mobile/tests/unit/
├── stores/
│   └── authStore.test.ts
└── components/
    └── Button.test.tsx
```

### Example: Schema Validation Test

```typescript
// apps/api/tests/unit/schemas/appointment.test.ts
import { describe, it, expect } from 'vitest';
import {
  CreateAppointmentSchema,
  UpdateAppointmentSchema
} from '@/schemas/appointment';

describe('CreateAppointmentSchema', () => {
  it('accepts valid appointment data', () => {
    const valid = {
      barbershopId: 'uuid-valid',
      employeeId: 'uuid-valid',
      serviceId: 'uuid-valid',
      date: '2026-06-15',
      startTime: '10:00'
    };
    expect(CreateAppointmentSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid date format', () => {
    const invalid = {
      barbershopId: 'uuid-valid',
      employeeId: 'uuid-valid',
      serviceId: 'uuid-valid',
      date: '15/06/2026', // Wrong format
      startTime: '10:00'
    };
    expect(() => CreateAppointmentSchema.parse(invalid)).toThrow();
  });

  it('rejects invalid UUID', () => {
    const invalid = {
      barbershopId: 'not-a-uuid',
      employeeId: 'uuid-valid',
      serviceId: 'uuid-valid',
      date: '2026-06-15',
      startTime: '10:00'
    };
    expect(() => CreateAppointmentSchema.parse(invalid)).toThrow();
  });
});
```

### Example: Business Logic Test

```typescript
// apps/api/tests/unit/services/appointmentConflict.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTimeConflict } from '@/services/appointmentService';

describe('hasTimeConflict', () => {
  it('returns false when no conflict', () => {
    const existing = { startTime: '10:00', endTime: '11:00' };
    const proposed = { startTime: '11:00', endTime: '12:00' };
    expect(hasTimeConflict(existing, proposed)).toBe(false);
  });

  it('returns true when overlap at start', () => {
    const existing = { startTime: '10:00', endTime: '11:00' };
    const proposed = { startTime: '10:30', endTime: '11:30' };
    expect(hasTimeConflict(existing, proposed)).toBe(true);
  });

  it('returns true when proposed contains existing', () => {
    const existing = { startTime: '10:00', endTime: '11:00' };
    const proposed = { startTime: '09:30', endTime: '11:30' };
    expect(hasTimeConflict(existing, proposed)).toBe(true);
  });
});
```

## Integration Tests

### Scope

- Full API route handling (request → validation → DB → response)
- Database queries with real PostgreSQL
- Multi-tenant isolation enforcement
- Authorization logic with real user context

### Location

```
apps/api/tests/integration/
├── auth.test.ts
├── barbershops.test.ts
├── employees.test.ts
├── services.test.ts
├── appointments.test.ts
└── security.test.ts
```

### Example: API Route Test

```typescript
// apps/api/tests/integration/barbershops.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '@/index';
import { createTestUser, createTestBarbershop } from '../helpers';
import { generateClerkToken } from '../utils/clerkMock';

const api = supertest(app);

describe('POST /api/v1/barbershops', () => {
  let ownerToken: string;
  let ownerUser: TestUser;

  beforeAll(async () => {
    ownerUser = await createTestUser({ role: 'OWNER' });
    ownerToken = generateClerkToken(ownerUser);
  });

  it('creates barbershop for owner', async () => {
    const response = await api
      .post('/api/v1/barbershops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Test Barber',
        address: '123 Main St',
        phone: '+1234567890'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Test Barber');
    expect(response.body.data.ownerId).toBe(ownerUser.id);
  });

  it('rejects non-owner role', async () => {
    const barberUser = await createTestUser({ role: 'BARBER' });
    const barberToken = generateClerkToken(barberUser);

    const response = await api
      .post('/api/v1/barbershops')
      .set('Authorization', `Bearer ${barberToken}`)
      .send({
        name: 'Test Barber',
        address: '123 Main St',
        phone: '+1234567890'
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects invalid data', async () => {
    const response = await api
      .post('/api/v1/barbershops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: '', // Invalid: empty
        address: '123 Main St'
        // Missing required phone
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### Example: Multi-Tenant Isolation Test

```typescript
// apps/api/tests/integration/security.test.ts
describe('Tenant Isolation', () => {
  it('owner cannot access other owners barbershops', async () => {
    const owner1 = await createTestUser({ role: 'OWNER' });
    const owner2 = await createTestUser({ role: 'OWNER' });

    const barbershop1 = await createTestBarbershop({ ownerId: owner1.id });
    const token2 = generateClerkToken(owner2);

    const response = await api
      .get(`/api/v1/barbershops/${barbershop1.id}`)
      .set('Authorization', `Bearer ${token2}`);

    expect(response.status).toBe(403);
  });

  it('barber cannot access appointments outside their shop', async () => {
    const owner1 = await createTestUser({ role: 'OWNER' });
    const owner2 = await createTestUser({ role: 'OWNER' });

    const shop1 = await createTestBarbershop({ ownerId: owner1.id });
    const shop2 = await createTestBarbershop({ ownerId: owner2.id });

    const barber1 = await createTestEmployee({
      barbershopId: shop1.id,
      role: 'BARBER'
    });

    const appointment2 = await createTestAppointment({
      barbershopId: shop2.id,
      employeeId: barber1.id
    });

    const token1 = generateClerkToken(barber1);

    const response = await api
      .get(`/api/v1/appointments/${appointment2.id}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(response.status).toBe(403);
  });
});
```

### Example: Double-Booking Test

```typescript
// apps/api/tests/integration/appointments.test.ts
describe('Double-Booking Prevention', () => {
  it('prevents booking same barber at overlapping time', async () => {
    const barbershop = await createTestBarbershop({ owner });
    const barber = await createTestEmployee({ barbershopId: barbershop.id });
    const client = await createTestUser({ role: 'CLIENT' });

    // Create first appointment
    await api
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${generateToken(client)}`)
      .send({
        barbershopId: barbershop.id,
        employeeId: barber.id,
        serviceId: service.id,
        date: '2026-06-15',
        startTime: '10:00',
        endTime: '11:00'
      });

    // Attempt overlapping appointment
    const response = await api
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${generateToken(client)}`)
      .send({
        barbershopId: barbershop.id,
        employeeId: barber.id,
        serviceId: service.id,
        date: '2026-06-15',
        startTime: '10:30',
        endTime: '11:30'
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TIME_SLOT_CONFLICT');
  });

  it('allows booking same barber at different time', async () => {
    // First appointment 10:00-11:00
    await createAppointment({ startTime: '10:00', endTime: '11:00' });

    // Second appointment 11:00-12:00 (no overlap)
    const response = await api
      .post('/api/v1/appointments')
      .send({
        startTime: '11:00',
        endTime: '12:00'
      });

    expect(response.status).toBe(201);
  });
});
```

## Mobile Tests

### Scope

- Component rendering (Vitest + Testing Library)
- Store actions (isolated)
- Hook behavior
- Navigation flows (manual for MVP)

### Location

```
apps/mobile/tests/
├── unit/
│   ├── components/
│   │   └── Button.test.tsx
│   ├── stores/
│   │   └── authStore.test.ts
│   └── hooks/
│       └── useAuth.test.ts
└── setup.ts
```

### Example: Component Test

```typescript
// apps/mobile/tests/unit/components/Button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders with title', () => {
    const { getByText } = render(<Button title="Book Now" />);
    expect(getByText('Book Now')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = vi.fn();
    const { getByText } = render(<Button title="Press Me" onPress={onPress} />);

    fireEvent.press(getByText('Press Me'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('is disabled when loading', () => {
    const onPress = vi.fn();
    const { getByRole } = render(
      <Button title="Submit" onPress={onPress} loading />
    );

    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

## End-to-End Tests

### Scope

Critical user flows with Playwright:

- User signup/login
- Owner creates barbershop
- Owner adds employee
- Client books appointment
- Appointment status transitions

### Location

```
tests/e2e/
├── auth.spec.ts
├── owner-flows.spec.ts
├── client-booking.spec.ts
└── playwright.config.ts
```

## Test Execution

### Commands

```bash
# All tests
npm test

# API tests only
npm test --workspace=apps/api

# Mobile tests only
npm test --workspace=apps/mobile

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## Definition of Done

### Per Feature

1. ✅ Unit tests written for validation schemas
2. ✅ Unit tests written for business logic
3. ✅ Integration tests written for API routes
4. ✅ Multi-tenant isolation tested
5. ✅ Role permissions tested
6. ✅ All tests pass
7. ✅ TypeScript compiles without errors
8. ✅ ESLint passes
9. ✅ Manual QA steps executed
10. ✅ QA report generated

### Per Phase

1. ✅ All features in phase have complete tests
2. ✅ No regressions in existing functionality
3. ✅ Documentation updated
4. ✅ Owner manual QA completed
5. ✅ Phase sign-off received

## Manual QA Checklist (Owner Final QA)

### Phase 1 - Foundation

- [ ] Project structure is correct
- [ ] Documentation is complete and accurate
- [ ] Test commands run successfully
- [ ] No hardcoded values in code

### Phase 2 - Database

- [ ] Database schema is correct
- [ ] Migrations run without errors
- [ ] Seed data is valid
- [ ] Indexes are created

### Phase 3 - API

- [ ] All endpoints return correct status codes
- [ ] Authentication works for all routes
- [ ] Authorization enforced correctly
- [ ] Validation errors return proper format
- [ ] Tenant isolation is enforced
- [ ] Double-booking prevention works

### Phase 4 - Mobile Foundation

- [ ] App builds successfully
- [ ] Navigation works between screens
- [ ] Authentication flow works
- [ ] API client connects to backend

### Phase 5 - Mobile Features

- [ ] Owner can manage barbershop
- [ ] Owner can manage employees
- [ ] Owner can manage services
- [ ] Client can book appointment
- [ ] Appointments display correctly

## QA Report Template

```markdown
## Phase X QA Report

### Test Summary

| Category | Passed | Failed | Total |
|----------|--------|--------|-------|
| Unit | X | 0 | X |
| Integration | X | 0 | X |
| E2E | X | 0 | X |
| Manual | X | 0 | X |

### Commands Run

\`\`\`
$ command1
output

$ command2
output
\`\`\`

### Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| none | - | - |

### Sign-Off

- [ ] Developer: Approved
- [ ] Owner: Pending/Approved
```

## Risk Management

| Risk | Mitigation | Impact |
|------|------------|--------|
| Test environment differs from prod | Use Docker for consistent DB | High |
| Mock data doesn't reflect reality | Use realistic seed data | Medium |
| Mobile tests brittle | Focus on critical flows only | Low |
| E2E tests slow | Run in parallel, tag by priority | Medium |
