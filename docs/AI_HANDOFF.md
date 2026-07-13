# BarberApp v3.0 — AI Handoff Document

## Purpose

This document provides context for AI assistants continuing work on BarberApp v3.0. It captures decisions, patterns, and critical information not easily inferred from code.

---

## Project Overview

BarberApp is a mobile-first SaaS for barbershop management built as a TypeScript monorepo.

**Repository**: `/home/mateo/Documents/coding/BarberApp-3.0/`

**Reference (old project, do not modify)**: `/home/mateo/Documents/coding/barberapp/`

---

## Key Decisions (Final)

### Architecture

- **API**: Express.js + Prisma + PostgreSQL
- **Mobile**: React Native + Expo + Zustand
- **Auth**: Clerk (webhook-based user sync)
- **Package Manager**: npm workspaces

### Database Design Principles

1. UUID primary keys on all models
2. Soft deletes via `deletedAt` nullable (Barbershop, Employee, Service)
3. Timestamps on all models (`createdAt`, `updatedAt`)
4. Indexes on all foreign keys
5. Enums for status fields

### Multi-Tenancy Model

```
User (Clerk external ID)
  └── Barbershop (1:1 with Owner)
        ├── Employee (N:1)
        ├── Service (N:1)
        └── Appointment (N:1 to Employee, Client)
```

**Rule**: Every Prisma query MUST include tenant filter. No exceptions.

### Authorization Pattern

```typescript
// All routes use middleware chain:
// 1. requireAuth() - validates Clerk token
// 2. requireRole(...) - checks role permissions
// 3. requireBarbershopAccess() - verifies tenant membership
```

### Validation Pattern

All input validated with Zod schemas before database access:

```typescript
// schemas/barbershop.ts
import { z } from 'zod';

export const CreateBarbershopSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(200),
  phone: z.string().min(10).max(20)
});
```

---

## Critical Anti-Patterns (DO NOT DO)

### NEVER

1. Hardcode tenant IDs: `where: { barbershopId: 'hardcoded' }`
2. Hardcode user IDs: `where: { ownerId: 'user-123' }`
3. Skip tenant filter: `prisma.appointment.findMany()` without `where.barbershopId`
4. Use mocks for security tests: must test with real DB + real auth
5. Skip validation: assume `req.body` is valid
6. Commit `.env` files or secrets
7. Create fake tests that only test mocks

### ALWAYS

1. Include tenant filter in every query
2. Validate all input with Zod
3. Test double-booking prevention with real queries
4. Test role permissions with real middleware
5. Run full test suite before marking phase complete

---

## Double-Booking Prevention (CRITICAL)

This is a core business rule that MUST be tested:

```typescript
// services/appointmentService.ts
export async function hasTimeConflict(
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<boolean> {
  const conflict = await prisma.appointment.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      employeeId,
      date,
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      // Time overlap check
      startTime: { lt: endTime },
      endTime: { gt: startTime }
    }
  });
  return conflict !== null;
}
```

**Test Requirement**: This function MUST have integration tests that verify:
1. No conflict when slots don't overlap
2. Conflict when slots overlap at start
3. Conflict when slots overlap at end
4. Conflict when new slot contains existing
5. No conflict with cancelled appointments
6. No conflict when checking own appointment during update

---

## Clerk Integration Details

### Webhook Events

```
POST /api/v1/auth/webhook
```

Handles: `user.created`, `user.updated`, `user.deleted`

### User Sync Logic

```typescript
// In webhook handler:
switch (event.type) {
  case 'user.created':
    await prisma.user.create({ data: { clerkUserId, email, name } });
    break;
  case 'user.updated':
    await prisma.user.update({ where: { clerkUserId }, data: { email, name } });
    break;
  case 'user.deleted':
    await prisma.user.update({ where: { clerkUserId }, data: { deletedAt: new Date() } });
    break;
}
```

### Token Validation

```typescript
// middleware/auth.ts
import { auth } from '@clerk/express';

app.use('/api/v1', (req, res, next) => {
  const { userId } = auth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
});
```

---

## Appointment Status Flow

```
PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
    ↓          ↓           ↓
 CANCELLED  CANCELLED   NO_SHOW
```

**Transition Rules**:

| From | To | Who Can |
|------|-----|---------|
| PENDING | CONFIRMED | OWNER |
| PENDING | CANCELLED | CLIENT, OWNER |
| CONFIRMED | IN_PROGRESS | BARBER (assigned), OWNER |
| CONFIRMED | CANCELLED | CLIENT, OWNER |
| IN_PROGRESS | COMPLETED | BARBER (assigned), OWNER |
| IN_PROGRESS | NO_SHOW | BARBER (assigned), OWNER |

---

## Environment Variables

### API (`apps/api/.env`)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/barberapp
CLERK_SECRET_KEY=sk_test_...
NODE_ENV=development
PORT=3000
# Optional direct-browser allowlist only when needed:
# CORS_ALLOWED_ORIGINS=http://localhost:8081
```

### Mobile (`apps/mobile/.env`)

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## Test Commands

```bash
# Run all tests
npm test

# Public booking release-candidate gate
npm run qa:public-booking

# API tests
npm test --workspace=apps/api

# Mobile tests
npm test --workspace=apps/mobile

# With coverage
npm run test:coverage

# E2E (Phase 7)
npm run test:e2e
```

---

## File Structure

```
BarberApp-3.0/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/          # Express routes
│   │   │   ├── services/        # Business logic
│   │   │   ├── middleware/      # Auth, validation
│   │   │   ├── lib/             # Prisma, utils
│   │   │   ├── schemas/         # Zod schemas
│   │   │   └── index.ts         # Entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tests/
│   │       ├── unit/
│   │       └── integration/
│   └── mobile/
│       ├── app/                  # Expo Router
│       ├── src/
│       │   ├── components/
│       │   ├── stores/
│       │   └── services/
│       └── tests/
├── packages/
│   └── shared/
│       └── src/
├── docs/
└── package.json
```

---

## Common Issues and Solutions

### "Prisma Client not initialized"

```bash
cd apps/api
npx prisma generate
npx prisma db push
```

### "Token validation fails in tests"

Mock Clerk middleware in tests:

```typescript
// tests/helpers/clerkMock.ts
export function mockClerkAuth(userId: string) {
  require('@clerk/express').auth.mockReturnValue({ userId });
}
```

### "Mobile can't connect to API"

Ensure API is running:

```bash
cd apps/api
npm run dev
```

Check `EXPO_PUBLIC_API_URL` matches your API URL.

---

## Documentation Map

| Doc | Purpose |
|-----|---------|
| `RESTART_PLAN.md` | Why we're starting fresh, what's rescued/discarded |
| `PRODUCT_SPEC.md` | Core product definition, features, data model |
| `ARCHITECTURE.md` | Technical architecture, API design, structure |
| `SECURITY_MODEL.md` | Auth, authorization, tenant isolation, validation |
| `QA_STRATEGY.md` | Test pyramid, test patterns, manual QA checklist |
| `ROADMAP.md` | Phase-by-phase implementation plan |
| `AI_HANDOFF.md` | This document - context for AI agents |

---

## SDD Workflow

This project uses Spec-Driven Development. Each phase follows:

1. **Explore** (optional): Investigate approach
2. **Propose**: Define scope and approach
3. **Spec**: Write detailed specs
4. **Design**: Technical design
5. **Tasks**: Break into tasks
6. **Apply**: Implement
7. **Verify**: Run tests
8. **Archive**: Save final state

To start a new phase:

```bash
/sdd-new <phase-name>
```

Or use meta-commands:

```bash
/sdd-ff <phase-name>  # Fast-forward: proposal → specs → design → tasks
/sdd-continue <phase-name>  # Continue from where we left off
```

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0+1 | ✅ Complete | Foundation, docs, test infra |
| Phase 2 | ✅ Complete | Database & ORM, Prisma, migrations, 27 tests |
| Phase 3 | 🔲 Next | API Foundation |
| Phase 4 | 🔲 | Appointments Core |
| Phase 5 | 🔲 | Mobile Foundation |
| Phase 6 | 🔲 | Mobile Features |
| Phase 7 | 🔲 | Integration & Final QA |

**Database tests implemented in Phase 2** - 27 tests covering models, constraints, and tenant isolation.

---

## Next Prompt for AI

When continuing work, start with:

```
Continue Phase 3: API Foundation.
Review docs/ROADMAP.md for Phase 3 deliverables.
Review docs/SECURITY_MODEL.md for auth requirements.
Create Express routes with Clerk auth middleware.
Implement CRUD endpoints for barbershops, employees, services.
Write integration tests with real database.
```
Review docs/ARCHITECTURE.md for schema design.
Create Prisma schema in apps/api/prisma/schema.prisma.
Write migration.
Write tests for models.
Run full test suite.
Generate QA report.
```

---

## Important Reminders

1. **No Blind Copying**: Don't copy code from old project without understanding why
2. **Test First**: Write tests BEFORE implementation
3. **Real Tests**: No mocks for security, auth, or business logic
4. **Single Source of Truth**: Docs and code must agree
5. **Validation Blocking**: Failing tests = not done
6. **Manual QA**: Each phase needs owner sign-off
