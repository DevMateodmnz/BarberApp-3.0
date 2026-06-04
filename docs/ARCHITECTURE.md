# BarberApp v3.0 — Architecture

## Overview

BarberApp is a TypeScript monorepo with three components: REST API, React Native mobile app, and shared types package.

## Technology Stack

### API (apps/api)

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 20+ |
| Framework | Express.js | 4.x |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 16+ |
| Validation | Zod | 3.x |
| Auth | @clerk/express | Latest |
| Testing | Vitest + Supertest | Latest |
| Runtime | tsx | 4.x |

### Mobile (apps/mobile)

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | React Native + Expo | SDK 54 (0.81.5) |
| Language | TypeScript | 5.x |
| Auth | @clerk/clerk-expo | 2.x |
| Navigation | @react-navigation/native | 6.x |
| State | Zustand | 5.x |
| Forms | React Hook Form | 7.x |
| Validation | Zod | 3.x |
| Testing | Vitest | Latest |

### Shared (packages/shared)

| Component | Technology |
|-----------|------------|
| Types | TypeScript interfaces |
| Validation | Zod schemas |
| Constants | Shared enums, config |

## Project Structure

```
BarberApp-3.0/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/          # Express route handlers
│   │   │   ├── services/        # Business logic
│   │   │   ├── middleware/       # Auth, validation, error handling
│   │   │   ├── lib/              # Prisma client, utilities
│   │   │   └── index.ts          # App entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # Database schema
│   │   │   ├── seed.ts          # Seed data
│   │   │   └── migrations/       # Prisma migrations
│   │   ├── tests/
│   │   │   ├── unit/            # Unit tests
│   │   │   ├── integration/     # API integration tests
│   │   │   └── setup.ts         # Test configuration
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mobile/
│       ├── app/                  # Expo Router file-based routing
│       ├── src/
│       │   ├── components/       # Reusable UI components
│       │   ├── hooks/            # Custom React hooks
│       │   ├── services/        # API client, external services
│       │   ├── stores/          # Zustand stores
│       │   └── lib/            # Utilities
│       ├── tests/
│       │   ├── unit/           # Component/hook tests
│       │   └── setup.ts
│       ├── app.json
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/           # TypeScript interfaces
│       │   ├── schemas/         # Zod schemas
│       │   └── constants/       # Shared constants
│       └── package.json
│
├── docs/                         # Documentation
├── package.json                  # Root workspace
├── tsconfig.base.json           # Base TypeScript config
├── turbo.json                   # Turborepo config (optional)
└── docker-compose.yml           # PostgreSQL for local dev
```

## API Design

### Base URL Structure

```
/api/v1/...          # Versioned API
```

### Endpoint Summary

#### Authentication

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/auth/webhook | Clerk webhook handler | None (signed) |
| GET | /api/v1/auth/me | Get current user | Required |

#### Barbershops

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/barbershops | Create barbershop | OWNER |
| GET | /api/v1/barbershops | List user's barbershops | Required |
| GET | /api/v1/barbershops/:id | Get barbershop | OWNER |
| PUT | /api/v1/barbershops/:id | Update barbershop | OWNER |
| DELETE | /api/v1/barbershops/:id | Soft delete | OWNER |

#### Employees

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/employees | Add employee | OWNER |
| GET | /api/v1/employees | List employees | Required |
| GET | /api/v1/employees/:id | Get employee | Required |
| PUT | /api/v1/employees/:id | Update employee | OWNER |
| DELETE | /api/v1/employees/:id | Soft delete | OWNER |

#### Services

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/services | Create service | OWNER |
| GET | /api/v1/services | List services | Required |
| GET | /api/v1/services/:id | Get service | Required |
| PUT | /api/v1/services/:id | Update service | OWNER |
| DELETE | /api/v1/services/:id | Soft delete | OWNER |

#### Appointments

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/appointments | Book appointment | CLIENT |
| GET | /api/v1/appointments | List appointments | Required |
| GET | /api/v1/appointments/:id | Get appointment | Required |
| PUT | /api/v1/appointments/:id | Update appointment | OWNER/BARBER |
| PUT | /api/v1/appointments/:id/status | Change status | OWNER/BARBER |
| DELETE | /api/v1/appointments/:id | Cancel appointment | CLIENT/OWNER |

#### Clients

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/clients | List clients | Required |
| GET | /api/v1/clients/:id | Get client | Required |

#### Availability

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/employees/:id/availability | Get available slots | Required |

### Response Format

All responses follow a consistent envelope:

```typescript
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { ... }
  }
}
```

### Pagination

List endpoints use cursor-based pagination:

```typescript
GET /api/v1/appointments?cursor=abc123&limit=20

{
  "success": true,
  "data": [...],
  "pagination": {
    "nextCursor": "def456",
    "hasMore": true
  }
}
```

## Database Design

### Prisma Schema Principles

1. **Explicit IDs**: UUID primary keys
2. **Soft Deletes**: `deletedAt` nullable for Barbershop, Employee, Service
3. **Timestamps**: `createdAt`, `updatedAt` on all models
4. **Indexes**: On all foreign keys and frequently queried columns
5. **Enums**: For status fields and roles

### Key Indexes

```prisma
// Barbershop
@@index([ownerId])
@@index([ownerId, isActive])

// Employee
@@index([barbershopId])
@@index([userId])
@@index([barbershopId, isActive])
@@unique([barbershopId, userId])  // Prevent duplicate employee per shop

// Appointment
@@index([barbershopId])
@@index([employeeId])
@@index([clientId])
@@index([startAt])
@@index([barbershopId, employeeId, startAt])
@@index([employeeId, startAt, status])

// Service
@@index([barbershopId])
@@index([barbershopId, isActive])

// EmployeeService
@@index([employeeId])
@@index([serviceId])
@@unique([employeeId, serviceId])  // Prevent duplicate service assignment

// Photo
@@index([clientId])
@@index([uploadedById])
```

## Mobile Architecture

### File-Based Routing (Expo Router)

```
app/
├── _layout.tsx              # Root layout with providers
├── (auth)/
│   ├── _layout.tsx         # Auth flow layout
│   ├── sign-in.tsx         # Sign in screen
│   └── sign-up.tsx         # Sign up screen
├── (tabs)/
│   ├── _layout.tsx         # Tab navigator
│   ├── index.tsx          # Home/dashboard
│   ├── appointments.tsx    # Appointments list
│   └── profile.tsx        # User profile
├── (owner)/
│   ├── _layout.tsx        # Owner layout
│   ├── barbershop.tsx     # Barbershop settings
│   ├── employees.tsx      # Employee management
│   └── services.tsx       # Service management
└── (barber)/
    ├── _layout.tsx        # Barber layout
    └── my-appointments.tsx # Barber's appointments
```

### State Management (Zustand)

```
stores/
├── authStore.ts           # User authentication state
├── barbershopStore.ts     # Current barbershop
├── appointmentStore.ts    # Appointments
└── uiStore.ts             # UI state (loading, errors)
```

### API Client Pattern

```typescript
// services/api.ts
const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = authStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

## CI/CD Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Lint/     │───▶│   Type      │───▶│   Unit      │
│   Format    │    │   Check     │    │   Tests     │
└─────────────┘    └─────────────┘    └──────┬──────┘
                                              │
┌─────────────┐    ┌─────────────┐    ┌──────▼──────┐
│   Deploy    │◀───│  E2E Tests  │◀───│ Integration │
│   Staging   │    │             │    │   Tests     │
└─────────────┘    └─────────────┘    └─────────────┘
```

## Environment Variables

### API

```
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_...
CLOUDINARY_API_SECRET=...
NODE_ENV=development|production
```

### Mobile

```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
```

## Security Considerations

1. All API routes require authentication except webhook
2. Multi-tenant isolation at Prisma query level using `where` clauses
3. Input validation with Zod on all request data
4. Rate limiting on authentication endpoints
5. CORS configured for mobile app origin only
6. No sensitive data in logs
