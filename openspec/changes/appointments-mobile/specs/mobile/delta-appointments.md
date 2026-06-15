# Delta Spec: Mobile — Appointments Screen

**Change**: appointments-mobile  
**Domain**: mobile  
**Base spec**: `openspec/specs/mobile/spec.md` (MS-001 through MS-010)

---

### MS-011: Appointment types in mobile type system

**Given** the mobile app needs to represent appointments  
**When** types are defined in `apps/mobile/src/lib/types.ts`  
**Then** an `AppointmentStatus` union type MUST exist with values: `PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`  
**And** an `Appointment` interface MUST exist with fields matching the backend API response shape including nested `barbershop`, `employee.user`, `client`, and `service` includes

#### Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| S1 | TypeScript compiles with Appointment references | No type errors |
| S2 | Appointment interface matches backend `GET /appointments` shape | `barbershop`, `employee.user`, `client`, `service` all typed |

---

### MS-012: Appointments API helpers

**Given** the mobile app needs to call the appointments API  
**When** API helpers are defined in `apps/mobile/src/lib/appointments.ts`  
**Then** the following functions MUST exist:

| Function | Method | Endpoint |
|----------|--------|----------|
| `fetchAppointments(getToken)` | GET | `/appointments` |
| `fetchEmployeeAppointments(getToken, barbershopId, employeeId)` | GET | `/barbershops/:barbershopId/employees/:employeeId/appointments` |
| `transitionAppointmentStatus(getToken, appointmentId, status)` | PUT | `/appointments/:appointmentId/status` |
| `cancelAppointment(getToken, appointmentId)` | DELETE | `/appointments/:appointmentId` |

**And** each function MUST:
- Call `getToken()` directly (via function parameter)
- Inject token as `Authorization: Bearer ${token}` header
- Parse response as `ApiResponse<T>`
- Check `data.success && data.data`
- Return `data.data` or throw `Error` with `data.error.message`

---

### MS-013: Appointments store — role-aware loading

**Given** the appointments store is initialized  
**When** `loadAppointments(getToken, context)` is called  
**Then** it MUST:

- No-op if `context.role === 'CLIENT'`
- No-op if `context.barbershopId` is missing
- No-op if `context.role === 'BARBER'` and `context.employeeId` is missing
- For OWNER: call `fetchAppointments(getToken)`
- For BARBER: call `fetchEmployeeAppointments(getToken, context.barbershopId, context.employeeId)`
- Set `isAppointmentsLoading: true` while fetching, `false` after
- Set `appointments` on success, `appointmentsError` on failure

#### Scenarios

| # | Role | barbershopId | employeeId | API call expected |
|---|------|-------------|------------|-------------------|
| S1 | OWNER | present | — | `fetchAppointments` |
| S2 | BARBER | present | present | `fetchEmployeeAppointments(bsId, empId)` |
| S3 | CLIENT | any | any | None (no-op) |
| S4 | OWNER | null | — | None (no-op) |
| S5 | BARBER | present | null | None (no-op) |

---

### MS-014: Appointments store — mutation with refetch

**Given** appointments have been loaded (setting `_lastContext`)  
**When** `transitionStatus(getToken, appointmentId, newStatus)` is called  
**Then** it MUST:
- Call `transitionAppointmentStatus(getToken, appointmentId, newStatus)`
- After the API call succeeds, call `loadAppointments(getToken, _lastContext)` to refetch

**Given** appointments have been loaded  
**When** `cancelAppointment(getToken, appointmentId)` is called  
**Then** it MUST:
- Call `cancelAppointment(getToken, appointmentId)` (which uses DELETE)
- After the API call succeeds, call `loadAppointments(getToken, _lastContext)` to refetch

**And** `clearAppointments()` MUST reset `appointments` to `[]`, `isAppointmentsLoading` to `false`, `appointmentsError` to `null`, and `_lastContext` to `null`.

---

### MS-015: Appointments screen — OWNER view

**Given** an OWNER is signed in with a valid barbershop  
**When** the Appointments screen renders  
**Then** it MUST:

- Load appointments via `GET /appointments`
- Display date navigation controls (◀ Today YYYY-MM-DD ▶)
- Display employee filter chips (one per employee + "All")
- Show appointment cards with: time, status badge, client name, service name, barber name
- Show action buttons for allowed status transitions (per OWNER_TRANSITIONS)
- Show a red "Cancel" button for cancellable statuses

**Given** the OWNER taps an employee filter chip  
**When** the filter activates  
**Then** only that employee's appointments MUST be shown (client-side filter)  
**And** tapping "All" MUST clear the filter

---

### MS-016: Appointments screen — BARBER view

**Given** a BARBER is signed in with an active employee record  
**When** the Appointments screen renders  
**Then** it MUST:

- Load appointments via `GET /barbershops/:bsId/employees/:empId/appointments`
- Display date navigation controls
- NOT display employee filter chips
- Show appointment cards with: time, status badge, client name, service name
- NOT show barber name (it's always themselves)
- Show action buttons for allowed status transitions (per BARBER_TRANSITIONS)

---

### MS-017: Appointments screen — CLIENT blocked

**Given** a CLIENT user is signed in  
**When** the Appointments screen renders  
**Then** it MUST display: "Appointment management is available for barbershop owners and barbers only."  
**And** it MUST NOT make any appointments API calls  
**And** the text MUST be centered and styled (italic, gray)

---

### MS-018: Appointments screen — CLIENT blocked (non-CLIENT roles only)

ONLY if the user will change this requirement later; this spec element is reserved.

---

### MS-019: Appointments screen — date navigation

**Given** the user is on the Appointments screen  
**When** the date controls render  
**Then** they MUST show:
- Previous day button (◀)
- Today button ("Today")
- Current date display (YYYY-MM-DD, monospace)
- Next day button (▶)

**Given** the user taps ◀  
**Then** `selectedDate` MUST decrement by 1 day  
**And** the appointment list MUST re-filter

**Given** the user taps ▶  
**Then** `selectedDate` MUST increment by 1 day  
**And** the appointment list MUST re-filter

**Given** the user taps "Today"  
**When** `selectedDate` is already today  
**Then** the button MUST be disabled (no unnecessary re-filter)

**Given** the user taps "Today"  
**When** `selectedDate` is NOT today  
**Then** `selectedDate` MUST reset to today  
**And** the appointment list MUST re-filter

---

### MS-020: Appointments screen — pull-to-refresh

**Given** the user pulls to refresh on the Appointments screen  
**When** `handleRefresh` is invoked  
**Then** it MUST:
- Reload context via `loadContext(getTokenRef.current)`
- After context reload, reload appointments for the current context
- For OWNER: also reload employees

---

### MS-021: Appointments screen — focus reload

**Given** the user navigates away from and back to the Appointments screen  
**When** the screen regains focus (AFTER the initial mount)  
**Then** it MUST reload appointments via `loadAppointments(getTokenRef.current, context)`  
**But** it MUST NOT reload on the initial mount focus event (guarded by `hasFocusedOnceRef`)

---

### MS-022: Home screen — appointments entry point

**Given** the user is OWNER or BARBER with a valid `barbershopId`  
**When** the Home screen renders  
**Then** an "Appointments" action card MUST be visible with:
- Title: "Appointments"
- Description: "View and manage today's appointments."
- Button: "View Appointments"

**Given** the user taps "View Appointments"  
**Then** the app MUST navigate to `/(tabs)/appointments`

**Given** the user is CLIENT or has no `barbershopId`  
**When** the Home screen renders  
**Then** the Appointments card MUST NOT be visible

---

### MS-023: Tab layout — appointments registration

**Given** the protected tabs layout  
**When** the layout renders  
**Then** an `appointments` tab screen MUST be registered with:
- `name: "appointments"`
- `title: "Appointments"`
- `href: null` (hidden from bottom tab bar)

---

### MS-024: Appointments screen — loading, error, empty states

**Given** appointments are being loaded  
**When** the screen renders  
**Then** a loading spinner with "Loading appointments…" MUST be shown

**Given** appointments failed to load  
**When** the screen renders  
**Then** the error message MUST be shown in red text  
**And** the error MUST have `testID="appointments-error"`

**Given** appointments loaded successfully but the filtered list is empty  
**When** the screen renders  
**Then** "No appointments for this date." MUST be shown in italic gray text  
**And** the message MUST have `testID="appointments-empty"`

---

### MS-025: Clerk getToken stability on appointments screen

**Given** the Clerk Expo `useAuth()` hook creates a new `getToken` function on every render  
**When** the Appointments screen uses `getToken` in effects, callbacks, and focus effects  
**Then** `getToken` MUST NOT appear in ANY `useEffect`, `useCallback`, or `useFocusEffect` dependency array  
**And** a `getTokenRef` (updated every render via no-deps `useEffect`) MUST be used instead  
**And** all callbacks MUST reference `getTokenRef.current`  
**And** a comment MUST document the intentional exclusion
