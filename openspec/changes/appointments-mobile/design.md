# Design: appointments-mobile

**Change**: Appointments management screen for mobile  
**Date**: 2026-06-15  
**Status**: Pre-existing implementation — design documented for review

---

## Architecture Decision

### Pattern: Passive listing screen with role-aware store

The appointments screen follows the existing mobile architecture pattern established by Services, Employees, and Working Hours screens:

```
Screen (React component) → Zustand store → API helper → Axios → Backend API
```

No new architectural patterns are introduced. All patterns are inherited from the existing codebase.

---

## Component Design

### Screen: `appointments.tsx`

**Type**: Tab screen (hidden from tab bar, navigated via `router.push`)  
**Location**: `apps/mobile/app/(tabs)/appointments.tsx`  
**Lines**: 621

#### State Management

| State variable | Type | Source | Purpose |
|---------------|------|--------|---------|
| `selectedDate` | `string` (YYYY-MM-DD) | `useState(getTodayDateString())` | Active date filter |
| `selectedEmployeeId` | `string \| null` | `useState(null)` | Active employee filter (OWNER only) |
| `hasFocusedOnceRef` | `RefObject<boolean>` | `useRef(false)` | Skip initial focus reload |
| `getTokenRef` | `RefObject<GetToken>` | `useRef(getToken)` + no-deps useEffect | Clerk getToken stabilizer |

#### Store Consumption

| Store | Hook | Data used |
|-------|------|-----------|
| Context | `useContextStore()` | `context`, `isLoading`, `loadContext` |
| Appointments | `useAppointmentsStore()` | `appointments`, `isAppointmentsLoading`, `appointmentsError`, `loadAppointments`, `transitionStatus`, `cancelAppointment` |
| Employees | `useEmployeesStore()` | `employees`, `loadEmployees` (OWNER only) |

#### Effect Lifecycle

```
Mount:
  useEffect → loadContext(getTokenRef.current)          [isSignedIn]
  useEffect → loadEmployees(getTokenRef.current, ...)   [context, OWNER]
  useEffect → loadAppointments(getTokenRef.current, …)  [context]

Focus (after first mount):
  useFocusEffect → loadAppointments(getTokenRef.current, …)  [context]

Pull-to-refresh:
  handleRefresh → loadContext → get fresh context → loadAppointments + loadEmployees
```

#### Rendering States

| State | Condition | UI |
|-------|-----------|-----|
| Not signed in | `!isLoaded \|\| !isSignedIn` | `null` (redirect handled by auth guard) |
| CLIENT blocked | `context?.role === 'CLIENT'` | Centered italic message |
| Context loading | `isContextLoading` | Full-size spinner + "Loading your context…" |
| Appointments loading | `isAppointmentsLoading` | Small spinner + "Loading appointments…" |
| Error | `appointmentsError` | Red error text in summary card |
| Empty | No filtered appointments | "No appointments for this date." |
| Data | Filtered appointments > 0 | Appointment cards with actions |

#### testID Conventions

| Element | testID |
|---------|--------|
| CLIENT blocked view | `appointments-client-blocked` |
| Refresh control | `appointments-refresh` |
| Loading spinner | `appointments-loading` |
| Date controls container | `appointments-date-controls` |
| Previous day button | `appointments-date-prev` |
| Today button | `appointments-date-today` |
| Date display text | `appointments-date-display` |
| Next day button | `appointments-date-next` |
| Employee filter row | `appointments-employee-filter` |
| "All" filter chip | `appointments-filter-all` |
| Employee filter chip | `appointments-filter-emp-{id}` |
| Error message | `appointments-error` |
| Empty state | `appointments-empty` |
| Appointment list | `appointments-list` |
| Appointment card | `appointment-{id}` |
| Action button row | `appointment-actions-{id}` |
| Action button | `appointment-action-{id}-{status}` |

---

## Store Design: `appointmentsStore.ts`

**Type**: Zustand store  
**Location**: `apps/mobile/src/lib/appointmentsStore.ts`  
**Lines**: 125

### State Shape

```typescript
interface AppointmentsState {
  appointments: Appointment[];        // Full list from API (unfiltered)
  isAppointmentsLoading: boolean;     // true during fetch
  appointmentsError: string | null;   // Error message or null

  loadAppointments(getToken, context): Promise<void>;
  transitionStatus(getToken, id, status): Promise<void>;
  cancelAppointment(getToken, id): Promise<void>;
  clearAppointments(): void;
}
```

### Role-Aware Loading

```
loadAppointments(getToken, context)
  ├── role === 'CLIENT'        → no-op (return)
  ├── !barbershopId            → no-op (return)
  ├── role === 'BARBER' && !employeeId → no-op (return)
  ├── role === 'OWNER'         → fetchAppointments(getToken)
  └── role === 'BARBER'        → fetchEmployeeAppointments(getToken, bsId, empId)
```

### Mutation Pattern (Refetch-After-Mutation)

The store uses a module-level `_lastContext` variable to remember the context from the last `loadAppointments` call. After any mutation (`transitionStatus` or `cancelAppointment`), it calls `loadAppointments` again with the cached context — refetching the full list to ensure UI consistency.

```
transitionStatus(token, id, status)
  → await API call (PUT /appointments/:id/status)
  → loadAppointments(token, _lastContext)  // refetch

cancelAppointment(token, id)
  → await API call (DELETE /appointments/:id)
  → loadAppointments(token, _lastContext)  // refetch (cancel returns stripped object)
```

This pattern avoids:
- Optimistic UI updates (complex, risky with backend-validated transitions)
- Manual list manipulation (error-prone, can desync from backend state)
- Passing context on every mutation call (the screen would need to thread context through)

### Error Handling Strategy

- **loadAppointments**: Errors caught, stored in `appointmentsError`, list set to `[]`
- **transitionStatus / cancelAppointment**: Errors propagate to caller (screen's handleTransition/handleCancel catch blocks are no-ops that rely on store error state being set implicitly — **NOTE: this is a minor gap**: mutation errors are NOT surfaced to the user in the current implementation)

---

## API Helper Design: `appointments.ts`

**Location**: `apps/mobile/src/lib/appointments.ts`  
**Lines**: 104

### Functions

| Function | Method | Endpoint | Returns |
|----------|--------|----------|---------|
| `fetchAppointments(getToken)` | GET | `/appointments` | `Appointment[]` |
| `fetchEmployeeAppointments(getToken, bsId, empId)` | GET | `/barbershops/${bsId}/employees/${empId}/appointments` | `Appointment[]` |
| `transitionAppointmentStatus(getToken, id, status)` | PUT | `/appointments/${id}/status` | `Appointment` |
| `cancelAppointment(getToken, id)` | DELETE | `/appointments/${id}` | `Appointment` |

### Pattern

All functions follow the established API helper pattern:
1. Call `getToken()` directly (NOT via ref — ref is a component concern)
2. Pass token as `Authorization: Bearer ${token}` header
3. Type response as `ApiResponse<T>`
4. Check `data.success && data.data`
5. Return `data.data` or throw `Error` with API error message

---

## Type Design: types.ts additions

**Location**: `apps/mobile/src/lib/types.ts` (appended to existing file)  
**Lines added**: +49

### AppointmentStatus

```typescript
type AppointmentStatus =
  | 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS'
  | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
```

Matches the Prisma `AppointmentStatus` enum exactly.

### Appointment

```typescript
interface Appointment {
  id: string;
  barbershopId: string;
  employeeId: string;
  clientId: string;
  serviceId: string;
  startAt: string;       // ISO 8601 datetime from backend
  endAt: string;         // ISO 8601 datetime from backend
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Nested includes (from Prisma include)
  barbershop: { id: string; name: string };
  employee: { id: string; user: { id: string; name: string | null } };
  client: { id: string; name: string | null; email: string };
  service: { id: string; name: string; durationMinutes: number; priceCents: number };
}
```

Matches the Prisma `include: { barbershop: true, employee: { include: { user: true } }, client: true, service: true }` shape.

---

## Navigation Design

### Entry Points

1. **Home screen card** (`index.tsx`): Conditionally rendered for OWNER and BARBER when `barbershopId` is present. Routes via `router.push('/(tabs)/appointments')`.

2. **Tab registration** (`_layout.tsx`): Hidden tab (`href: null`) — prevents it from appearing in the bottom tab bar while making it reachable via `router.push`.

### No Exit Navigation

The appointments screen has no explicit "back" or navigation elements. The user returns via:
- Android back button (standard Expo Router behavior)
- Tab bar (only "Home" tab is visible)

---

## Transition Rules Design

### OWNER Transitions

```typescript
const OWNER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING:     ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:   ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED:   [],
  CANCELLED:   [],
  NO_SHOW:     [],
};
```

### BARBER Transitions

```typescript
const BARBER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING:     [],                          // BARBER cannot confirm
  CONFIRMED:   ['IN_PROGRESS'],             // Can only start
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],    // Can complete or no-show
  COMPLETED:   [],
  CANCELLED:   [],
  NO_SHOW:     [],
};
```

These match the backend `STATUS_TRANSITIONS` table in `appointmentService.ts` exactly.

### Cancel vs Transition

- **Cancel**: Uses `DELETE /appointments/:id` → calls `cancelAppointment()` in store. Rendered with red danger styling.
- **Status transition**: Uses `PUT /appointments/:id/status` → calls `transitionStatus()` in store. Rendered with blue action styling.

---

## Styling Design

The appointments screen uses inline `StyleSheet.create()` with a consistent design system:

| Element | Style |
|---------|-------|
| Background | `#FFFFFF` |
| Cards/containers | `#F5F5F5`, `borderRadius: 12`, `padding: 20` |
| Primary actions | `#007AFF` (iOS blue) |
| Danger actions | `#D32F2F` |
| Status badges | Color-coded: PENDING=orange, CONFIRMED=blue, IN_PROGRESS=deep orange, COMPLETED=green, CANCELLED=gray, NO_SHOW=red |
| Date controls | `#F5F5F5` background, `#007AFF` buttons |
| Filter chips | `#F5F5F5` inactive, `#007AFF` active |
| Text hierarchy | Titles: `700` weight, `#333`. Body: `500` weight, `#555`. Metadata: `#666`/`#777`/`#888` |

---

## Dependency Graph

```
appointments.tsx
├── @clerk/clerk-expo (useAuth)
├── expo-router (useFocusEffect, router)
├── react-native (View, Text, ScrollView, RefreshControl, etc.)
├── @/lib/store.js (useContextStore)
├── @/lib/appointmentsStore.js (useAppointmentsStore)
├── @/lib/employeesStore.js (useEmployeesStore)
├── @/lib/format.js (getTodayDateString, addDaysToDateString, isTodayDateString, formatRecordTime)
└── @/lib/types.js (AppointmentStatus)

appointmentsStore.ts
├── zustand (create)
├── @/lib/appointments.js (all 4 API helpers)
└── @/lib/types.js (Appointment, AppointmentStatus, CurrentUserContext)

appointments.ts
├── @/lib/api.js (api, ApiResponse, GetToken)
└── @/lib/types.js (Appointment, AppointmentStatus)
```

No new external dependencies required.
