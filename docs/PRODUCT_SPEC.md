# BarberApp v3.0 — Product Specification

## Overview

BarberApp is a mobile-first SaaS application for barbershop management. It enables barbershop owners to manage their business, barbers to handle appointments, and clients to book services.

## Target Users

| Role | Description |
|------|-------------|
| **OWNER** | Manages the barbershop: business settings, employees, services, and appointments |
| **BARBER** | Manages their own assigned appointments and client photos |
| **CLIENT** | Books appointments at a barbershop for a specific service and barber |

## Core Features

### Authentication & Authorization

- **Authentication**: Clerk for identity management
  - Email/password, social login (Google)
  - Webhook-based user synchronization
  - JWT token validation on API requests

- **Role-Based Access Control**:
  - OWNER: Full access to their barbershop
  - BARBER: Access to assigned appointments only
  - CLIENT: Booking and own appointment management

### Multi-Tenancy Model

```
User (Clerk user)
  └── Barbershop (1:1 with Owner user)
        ├── Employee (N:1, belongs to Barbershop)
        ├── Service (N:1, belongs to Barbershop)
        └── Appointment (N:1, belongs to Barbershop + Employee + Client)
```

**Key Constraint**: A user can only own ONE barbershop.

### Barbershop Management (OWNER)

- Create barbershop profile (name, address, phone, hours)
- Configure business settings
- Activate/deactivate barbershop
- Soft delete barbershop (preserves historical data)

### Employee Management (OWNER)

- Add/remove barbers (employees)
- Assign services to barbers
- View employee schedules
- Soft delete employees

### Service Management (OWNER)

- Define services (name, description, duration, price)
- Assign services to specific barbers
- Enable/disable services
- Service categories (optional v2)

### Appointment Booking (CLIENT)

- Browse available barbers
- Select service and preferred barber
- View barber availability
- Book appointment (date, time, service)
- Receive confirmation
- Cancel appointment (with policy)

### Appointment Management

| Action | OWNER | BARBER | CLIENT |
|--------|-------|--------|--------|
| View all appointments | ✅ (shop) | ✅ (assigned) | ✅ (own) |
| Create appointment | N/A | N/A | ✅ |
| Cancel appointment | ✅ | ❌ | ✅ (own) |
| Reschedule | ✅ | ❌ | ❌ |
| Mark complete | ✅ | ✅ (assigned) | ❌ |
| No-show | ✅ | ✅ (assigned) | ❌ |

### Appointment Status Flow

```
PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
    ↓          ↓           ↓
 CANCELLED  CANCELLED   NO_SHOW
```

### Client Features

- View appointment history
- View assigned barber
- Upload reference photos (for hair style)

## Data Model

### User (Clerk External)

- `clerkUserId`: External reference to Clerk
- `email`: From Clerk
- `name`: From Clerk
- `role`: OWNER | BARBER | CLIENT
- `createdAt`, `updatedAt`

### Barbershop

- `id`: UUID
- `ownerId`: FK to User
- `name`: String
- `address`: String
- `phone`: String
- `openingHours`: JSON
- `isActive`: Boolean
- `deletedAt`: Nullable (soft delete)
- `createdAt`, `updatedAt`

### Employee

- `id`: UUID
- `barbershopId`: FK to Barbershop
- `userId`: FK to User (the barber)
- `isActive`: Boolean
- `deletedAt`: Nullable
- `createdAt`, `updatedAt`

### Service

- `id`: UUID
- `barbershopId`: FK to Barbershop
- `name`: String
- `description`: Text
- `durationMinutes`: Integer
- `price`: Decimal
- `isActive`: Boolean
- `createdAt`, `updatedAt`

### EmployeeService (N:N join)

- `employeeId`: FK
- `serviceId`: FK

### Appointment

- `id`: UUID
- `barbershopId`: FK
- `employeeId`: FK
- `clientId`: FK
- `serviceId`: FK
- `date`: Date
- `startTime`: Time
- `endTime`: Time
- `status`: ENUM (PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW)
- `notes`: Text (nullable)
- `createdAt`, `updatedAt`

### Photo

- `id`: UUID
- `clientId`: FK
- `url`: String (Cloudinary)
- `uploadedBy`: FK to User
- `createdAt`

## Non-Functional Requirements

### Security

- All API endpoints require authentication (except webhook)
- Multi-tenant isolation enforced at query level
- Input validation with Zod on all endpoints
- No hardcoded tenant/user IDs in code

### Performance

- API response time < 500ms (p95)
- Database queries use indexes on tenant keys
- Pagination on list endpoints (default 20, max 100)

### Mobile

- Offline-first architecture (local cache)
- Optimistic UI updates
- Pull-to-refresh on all lists

## Out of Scope for MVP

- Push notifications
- Payment processing
- Reviews/ratings
- Multiple barbershop ownership
- White-label/multi-brand
- Advanced analytics
- SMS reminders
- Google Calendar integration

## Success Metrics

- Owner can create barbershop and add employees
- Owner can define services and assign to barbers
- Client can browse and book available slot
- No double-booking of same barber at same time
- Role permissions enforced at API level
- All data isolated by barbershop tenant
