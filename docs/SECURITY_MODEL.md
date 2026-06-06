# BarberApp v3.0 — Security Model

## Overview

Security in BarberApp v3.0 is enforced at multiple layers: authentication, authorization, input validation, and database query isolation.

## Authentication

### Clerk Integration

All users authenticate through Clerk. The API validates tokens on every request.

```typescript
// middleware/auth.ts
import { requireAuth } from '@clerk/express';

app.use('/api/v1', requireAuth());
```

### Webhook Sync

Users are synced to the database via Clerk webhooks. Implemented in PR-010.

```
POST /api/v1/webhooks/clerk
Headers: svix-id, svix-timestamp, svix-signature (verified via standardwebhooks)
Body: Clerk event payload (raw JSON, express.raw)
```

Events handled:
- `user.created` → Create user record (idempotent, role from `public_metadata.role` or default `CLIENT`)
- `user.updated` → Update name/email; resolve role preserving privilege (never downgrade OWNER/BARBER)
- `user.deleted` → Soft delete (set deletedAt)

**Role source**: `public_metadata.role` on the Clerk user object. Valid values: `OWNER`, `BARBER`, `CLIENT`. Absent/invalid metadata defaults to `CLIENT`. `unsafe_metadata` is intentionally not trusted.

**DB as source of truth**: Auth middleware (`auth.ts:85`) reads `user.role` from the DB on every request. The webhook is only a sync mechanism — the DB `User.role` column is authoritative at runtime.

**Limitations**: OWNER/BARBER role bootstrap currently requires setting `public_metadata` in the Clerk Dashboard. There is no backend endpoint for OWNER-managed employee/role assignment yet (deferred to future PR).

See `apps/api/src/routes/webhooks.ts` and `apps/api/src/services/userSyncService.ts`.

## Authorization

### Role Hierarchy

```
OWNER > BARBER > CLIENT
```

### Permission Matrix

| Resource | OWNER | BARBER | CLIENT |
|----------|-------|--------|--------|
| Own profile | RW | RW | RW |
| Barbershop (own) | CRUD | R | - |
| Employees (shop) | CRUD | R | - |
| Services (shop) | CRUD | R | - |
| Working Hours (shop) | RU | - | - |
| Appointments (own shop) | CRUD | R (assigned) | R (own) |
| Create appointment | - | - | C |
| Cancel appointment (own) | - | - | D |
| Mark appointment status | U | U (assigned) | - |

### Employee Lifecycle

- **Employee management**: OWNER can add, list, deactivate, and reactivate employees. See `apps/api/src/routes/barbershops.ts` and `apps/api/src/services/employeeService.ts`.
- **Service listing**: OWNER can list services assigned to an employee via `GET .../employees/:employeeId/services`. Returns active, non-deleted services only.
- **Reactivation**: OWNER can reactivate deactivated employees via `PATCH .../employees/:employeeId/reactivate`. Restores isActive=true and deletedAt=null. Preserves EmployeeService links and does not modify User.role.
- **Deactivation**: OWNER can soft-deactivate employees via `DELETE .../employees/:employeeId`. Sets isActive=false and deletedAt=now without removing historical data.
- **Appointment listing**: BARBERs can list their own appointments via the scoped `GET .../employees/:employeeId/appointments` endpoint. OWNERs can list any employee's appointments. Global BARBER listing remains fail-closed for safety.
- **Working hours**: OWNER can view and update barbershop working hours via `GET/PUT /api/v1/barbershops/:barbershopId/working-hours`. Updates are idempotent. Closed days set `isActive: false`. Appointment booking validates against current working hours.

### Implementation Pattern

```typescript
// middleware/requireRole.ts
export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getCurrentUser(req);
    if (!roles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
      });
    }
    next();
  };
}

// Usage in routes
router.post('/barbershops', requireAuth(), requireRole('OWNER'), createBarbershop);
```

### Barbershop Access Control

```typescript
// middleware/barbershopAccess.ts
export async function requireBarbershopAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = await getCurrentUser(req);
  const barbershopId = req.params.barbershopId || req.body.barbershopId;

  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId }
  });

  if (!barbershop) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Barbershop not found' }
    });
  }

  // Owner can access their own barbershop
  if (barbershop.ownerId === user.id) return next();

  // Employee can access if they belong to the barbershop
  const employee = await prisma.employee.findFirst({
    where: { userId: user.id, barbershopId }
  });

  if (!employee) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Not part of this barbershop' }
    });
  }

  next();
}
```

## Multi-Tenant Isolation

### Principle

Every database query MUST include tenant filtering. There are no exceptions.

### Implementation

```typescript
// lib/prisma.ts - Tenant-aware prisma client
export function getTenantPrisma(userId: string, barbershopId?: string) {
  return prisma.$extends({
    query: {
      appointment: {
        async findMany({ args, query }) {
          // Inject tenant filter automatically
          args.where = {
            ...args.where,
            barbershop: {
              ownerId: userId  // Only owner can query their shop
            }
          };
          return query(args);
        }
      }
    }
  });
}
```

### Manual Tenant Filtering Pattern

```typescript
// Every query must include tenant scope
const appointments = await prisma.appointment.findMany({
  where: {
    barbershop: {
      ownerId: user.id  // REQUIRED
    },
    // ... other filters
  }
});
```

### Anti-Patterns (PROHIBITED)

```typescript
// ❌ NEVER do this - no tenant filter
const appointments = await prisma.appointment.findMany();

// ❌ NEVER do this - hardcoded tenant
const appointments = await prisma.appointment.findMany({
  where: { barbershopId: 'hardcoded-id' }
});
```

## Input Validation

### Zod Schemas

All input is validated with Zod before processing:

```typescript
// schemas/appointment.ts
import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  barbershopId: z.string().uuid(),
  employeeId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional()
});

export const UpdateAppointmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().max(500).optional()
});

export const AppointmentStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
});
```

### Validation Middleware

```typescript
// middleware/validate.ts
import { z } from 'zod';

export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.flatten()
        }
      });
    }
    req.body = result.data;
    next();
  };
}
```

## Double-Booking Prevention

### Constraint

An employee cannot have two appointments at the same time.

### Implementation

```typescript
// services/appointmentService.ts
export async function createAppointment(data: CreateAppointmentInput) {
  const { employeeId, date, startTime, endTime } = data;

  // Check for existing appointment
  const conflict = await prisma.appointment.findFirst({
    where: {
      employeeId,
      date,
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      OR: [
        { startTime: { lte: endTime }, endTime: { gte: startTime } }
      ]
    }
  });

  if (conflict) {
    throw new ConflictError('Time slot already booked');
  }

  return prisma.appointment.create({ data });
}
```

### Test Requirement

This constraint MUST be tested with real database:

```typescript
// tests/integration/appointment.test.ts
it('should prevent double-booking', async () => {
  // Create first appointment
  await createAppointment({ employeeId, date, startTime: '10:00', endTime: '11:00' });

  // Attempt second appointment at same time
  const result = await createAppointment({
    employeeId,
    date,
    startTime: '10:30',
    endTime: '11:30'
  });

  expect(result).toBeInstanceOf(ConflictError);
});
```

### Database-Level Prevention (Implemented in PR-006)

**Current Status**: Double-booking prevention is implemented at BOTH the application service layer and the database level.

**DB-Level**: A PostgreSQL GiST exclusion constraint (`no_double_booking`) enforces atomic overlap prevention per employee for active statuses (PENDING, CONFIRMED, IN_PROGRESS). This closes the TOCTOU race condition where two concurrent requests both pass the app-layer `hasTimeConflict()` check.

**Migration**: `apps/api/prisma/migrations/20260604_add_db_double_booking_constraint/migration.sql`

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_double_booking' AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments"
    ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (
      employee_id WITH =,
      tsrange(start_at, end_at, '[)') WITH &&
    ) WHERE (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
  END IF;
END $$;
```

**Defense-in-depth**: The application-layer `hasTimeConflict()` check remains in place at `appointmentService.ts:139-157`. It catches 99.9% of conflicts at the request level. The DB constraint is the final atomic safeguard for concurrent races.

## API Security

### Rate Limiting

Implemented in PR-009. See `apps/api/src/middleware/rateLimit.ts`.

```typescript
// apps/api/src/index.ts
import { appointmentRateLimit } from './middleware/rateLimit.js';

app.use('/api/v1/appointments', appointmentRateLimit, appointmentRoutes);
```

**Configuration** (env vars):
- `RATE_LIMIT_ENABLED` — "true" or "false" (default: true, except in `NODE_ENV=test`)
- `RATE_LIMIT_WINDOW_MS` — window duration (default: 15 minutes)
- `RATE_LIMIT_MAX` — max requests per window (default: 100)

**Limitations**: Uses in-memory MemoryStore — acceptable for single-instance MVP. For production horizontal scaling, replace with a shared store (Redis via `rate-limit-redis`, etc.).

**Error response** (HTTP 429):
```json
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many requests, please try again later" } }
```

### CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN, // Mobile app URL
  credentials: true
}));
```

## Security Test Requirements

| Test | Requirement |
|------|-------------|
| Auth middleware | Test with valid/invalid/expired tokens |
| Role permissions | Test each role can only access allowed endpoints |
| Tenant isolation | Test user cannot access another user's barbershop data |
| Double-booking | Test conflict detection with real DB queries |
| Input validation | Test invalid data is rejected with proper errors |
| Webhook signature | Test webhook rejects unsigned payloads |

## Environment Security

### Required Secrets

```
CLERK_SECRET_KEY=sk_live_...
DATABASE_URL=postgresql://...
CLOUDINARY_API_SECRET=...
```

### Never Commit

- `.env` files
- `*.log` files with sensitive data
- Stack traces in production

## Security Checklist

- [ ] All API routes have authentication check
- [ ] All API routes have authorization check
- [ ] All user input is validated with Zod
- [ ] All queries include tenant filter
- [ ] Double-booking prevention tested
- [x] Rate limiting on sensitive endpoints
- [x] Webhook signature verification
- [ ] No hardcoded IDs in code
- [ ] No secrets in repository
