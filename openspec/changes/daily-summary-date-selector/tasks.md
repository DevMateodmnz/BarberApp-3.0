# Tasks: Daily Summary Date Selector

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (3 work-unit commits) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add `addDaysToDateString` + `isTodayDateString` helpers with tests | PR 1 | Foundation; independently testable |
| 2 | Add `loadSummaryForDate` to store, refactor `loadTodaySummary` as wrapper, with tests | PR 1 | Depends on unit 1; backward-compatible |
| 3 | Wire `selectedDate` state + date controls to HomeScreen UI | PR 1 | User-visible change; depends on unit 2 |

---

## Phase 1: Date Helpers (Foundation)

- [x] 1.1 `apps/mobile/src/lib/format.ts`: Add `addDaysToDateString(date: string, amount: number): string` — parse YYYY-MM-DD, use local `new Date(Y,M-1,D)`, `setDate(getDate()+amount)`, return formatted string (spec MS-001, all 6 scenarios)
- [x] 1.2 `apps/mobile/src/lib/format.ts`: Add `isTodayDateString(date: string): boolean` — compare against `getTodayDateString()` (spec MS-002)
- [x] 1.3 `apps/mobile/tests/unit/format.test.ts`: Add `describe('addDaysToDateString')` with tests for all 6 spec scenarios (S1–S6) plus edge cases (wrap to next month, leap year)
- [x] 1.4 `apps/mobile/tests/unit/format.test.ts`: Add `describe('isTodayDateString')` with today-match and non-match cases

## Phase 2: Store Refactor

- [x] 2.1 `apps/mobile/src/lib/summaryStore.ts`: Add `loadSummaryForDate(getToken, context, date)` — same guard logic as current `loadTodaySummary` but accepts explicit date parameter (spec MS-003)
- [x] 2.2 `apps/mobile/src/lib/summaryStore.ts`: Refactor `loadTodaySummary` to delegate to `loadSummaryForDate(getToken, context, getTodayDateString())` — backward-compatible no-op (spec MS-003)
- [x] 2.3 `apps/mobile/tests/unit/summaryStore.test.ts`: Add tests for `loadSummaryForDate` — OWNER, BARBER, CLIENT, missing IDs, and error cases (specs MS-003, MS-007, MS-008)

## Phase 3: Home Screen UI Wiring

- [x] 3.1 `apps/mobile/app/(tabs)/index.tsx`: Add `selectedDate` state initialized with `getTodayDateString()` (spec MS-004)
- [x] 3.2 `apps/mobile/app/(tabs)/index.tsx`: Replace `loadTodaySummary` calls with `loadSummaryForDate(getToken, context, selectedDate)` in both useEffect and handleRefresh (specs MS-004, MS-006)
- [x] 3.3 `apps/mobile/app/(tabs)/index.tsx`: Add date navigation controls (Prev ◀, ▶ Next, Today button) above summary card with `TouchableOpacity`, visible YYYY-MM-DD display, dimmed Today when already today (spec MS-005)
- [x] 3.4 `apps/mobile/app/(tabs)/index.tsx`: Update summary card titles (OwnerSummary, BarberSummary) — show "Today" when `selectedDate` is today, otherwise show `selectedDate` (spec MS-009)
- [x] 3.5 `apps/mobile/app/(tabs)/index.tsx`: Ensure CLIENT still sees no summary calls and no date controls (spec MS-007)
