# Spec: Mobile

## Domain: mobile

---

### MS-001: Pure date helper — addDaysToDateString

**Given** a date string in YYYY-MM-DD format  
**When** `addDaysToDateString(date, N)` is called with integer N  
**Then** it MUST return a new YYYY-MM-DD string offset by N days using local calendar arithmetic

#### Scenarios

| # | Input date | N | Expected output |
|---|-----------|---|-----------------|
| S1 | `"2026-01-15"` | `-1` | `"2026-01-14"` |
| S2 | `"2026-01-31"` | `1` | `"2026-02-01"` |
| S3 | `"2026-03-01"` | `-1` | `"2026-02-28"` |
| S4 | `"2028-03-01"` | `-1` | `"2028-02-29"` |
| S5 | `"2026-01-01"` | `0` | `"2026-01-01"` |
| S6 | `"2026-12-31"` | `1` | `"2027-01-01"` |

#### Constraints

- MUST NOT use `new Date(dateString)` parsing (UTC risk).
- MUST parse YYYY-MM-DD manually into numeric year/month/day.
- MUST use `new Date(year, month-1, day)` (local time constructor) for the base date.
- MUST use `setDate(getDate() + N)` for calendar-aware arithmetic.
- MUST return the result using `getFullYear()/getMonth()/getDate()` (local fields).

---

### MS-002: isTodayDateString helper

**Given** a date string in YYYY-MM-DD format  
**When** `isTodayDateString(date)` is called  
**Then** it MUST return `true` if the date matches today's local date, `false` otherwise

---

### MS-003: Summary store — loadSummaryForDate

**Given** a user context and a date string in YYYY-MM-DD format  
**When** `loadSummaryForDate(getToken, context, date)` is called  
**Then** it MUST:

- Skip (no-op) if `context.role === 'CLIENT'`
- Skip if `context.barbershopId` is missing
- Skip if `context.role === 'BARBER'` and `context.employeeId` is missing
- For OWNER: call `fetchBarbershopDailySummary(getToken, barbershopId, date)`
- For BARBER: call `fetchEmployeeDailySummary(getToken, barbershopId, employeeId, date)`
- Set `isSummaryLoading: true` while fetching, `false` after
- Set `summary` on success, `summaryError` on failure

**And** `loadTodaySummary(getToken, context)` MUST delegate to `loadSummaryForDate(getToken, context, getTodayDateString())`.

---

### MS-004: Home screen — selectedDate state

**Given** the Home screen mounts  
**When** the component initializes  
**Then** `selectedDate` MUST be initialized with `getTodayDateString()`

**Given** the Home screen has a `selectedDate`  
**When** the summary loads  
**Then** the summary request MUST use `selectedDate`, not always today's date

---

### MS-005: Home screen — date navigation controls

**Given** the user is OWNER or BARBER with summary visible  
**When** the summary card renders  
**Then** it MUST show:

- A **Previous day** button (navigates `selectedDate` back one day)
- A **Today** button (resets `selectedDate` to today)
- A **Next day** button (navigates `selectedDate` forward one day)
- The currently selected date displayed visibly (YYYY-MM-DD format)

**Given** the user presses Previous day or Next day  
**When** `selectedDate` changes  
**Then** the summary MUST reload for the new date

**Given** the Today button is pressed and `selectedDate` is already today  
**Then** no unnecessary reload SHOULD be triggered

---

### MS-006: Home screen — pull-to-refresh

**Given** the user pulls to refresh  
**When** `handleRefresh` is invoked  
**Then** it MUST:

- Reload `/me/context` via `loadContext(getToken)`
- After context reload, reload the summary for the current `selectedDate` (not always today)

---

### MS-007: CLIENT remains unchanged

**Given** the user role is CLIENT  
**When** the Home screen renders  
**Then** no summary API calls MUST be made  
**And** no date selector UI MUST be shown

---

### MS-008: Missing IDs — safe skip

**Given** the user is OWNER but `barbershopId` is null  
**When** date navigation occurs  
**Then** no summary API call MUST be made  

**Given** the user is BARBER but `employeeId` is null  
**When** date navigation occurs  
**Then** no summary API call MUST be made

---

### MS-009: Summary card title reflects selected date

**Given** a summary is loaded for `selectedDate`  
**When** the summary card renders  
**Then** the title MUST show the selected date, not hardcoded "Today"  
**Unless** `selectedDate === getTodayDateString()`, then the title MAY show "Today"

---

### MS-010: Date format to backend

**Given** any date is sent to the backend  
**When** the API call is made  
**Then** the date parameter MUST be in YYYY-MM-DD format
