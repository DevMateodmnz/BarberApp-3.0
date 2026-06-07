# Design: Daily Summary Date Selector (PR-028G)

## Architecture

No architecture changes. This is a pure UI + store enhancement on the existing Home screen.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/lib/format.ts` | Add `addDaysToDateString()` and `isTodayDateString()` |
| `apps/mobile/src/lib/summaryStore.ts` | Add `loadSummaryForDate()`, refactor `loadTodaySummary` to delegate |
| `apps/mobile/app/(tabs)/index.tsx` | Add `selectedDate` state, date controls, wire to store |
| `apps/mobile/tests/unit/format.test.ts` | Add date arithmetic tests |
| `apps/mobile/tests/unit/summaryStore.test.ts` | Add `loadSummaryForDate` tests |

### No files to create

All changes are modifications to existing files.

## Data flow

```
Home screen
  │
  ├── selectedDate = getTodayDateString()  [initial]
  │
  ├── User presses prev/next/today
  │     └── setSelectedDate(newDate)
  │           └── useEffect: loadSummaryForDate(getToken, context, selectedDate)
  │
  ├── Pull-to-refresh
  │     └── loadContext(getToken)
  │           └── loadSummaryForDate(getToken, freshContext, selectedDate)
  │
  └── Summary card renders with selectedDate title
```

## Store API evolution

### Before (current)
```ts
loadTodaySummary(getToken, context): Promise<void>
```

### After
```ts
loadSummaryForDate(getToken, context, date): Promise<void>
loadTodaySummary(getToken, context): Promise<void>  // convenience, delegates to loadSummaryForDate
```

Backward compatible: `loadTodaySummary` is preserved as a thin wrapper.

## Date helper design

```ts
addDaysToDateString(date: string, amount: number): string
```

Implementation approach:
1. Parse `YYYY-MM-DD` manually (split on `-`, parseInt)
2. Construct `new Date(year, month-1, day)` — LOCAL time constructor
3. `d.setDate(d.getDate() + amount)` — calendar-aware arithmetic
4. Return `getFullYear()/getMonth()/getDate()` formatted as `YYYY-MM-DD`

This avoids all UTC off-by-one issues because:
- `new Date(Y, M-1, D)` creates a local-time date at midnight
- `setDate()` works in local time
- `getFullYear/getMonth/getDate` return local fields

```ts
isTodayDateString(date: string): boolean
```

Simple: compare `date === getTodayDateString()`.

## UI component layout

Summary card header (replaces current "Today — {date}"):

```
┌─────────────────────────────────────────┐
│  ◀  Prev    📅 2026-06-07    Next  ▶   │
│            [ Today ]                    │
├─────────────────────────────────────────┤
│  (existing summary content)             │
└─────────────────────────────────────────┘
```

- Prev/Next: TouchableOpacity with `◀` / `▶` text
- Today: TouchableOpacity, disabled (dimmed) when selectedDate is today
- Date display: Text showing YYYY-MM-DD

## Decision: No external date picker

**Rationale**: The user explicitly requested no heavy dependencies. A three-button control is sufficient for daily navigation. A full calendar picker (`react-native-date-picker`, `@react-native-community/datetimepicker`) would add:
- ~200KB+ to bundle size
- Additional native linking
- Complexity disproportionate to the value for daily-summary navigation

If users later need to jump to arbitrary dates far in the past/future, a calendar picker can be added incrementally.
