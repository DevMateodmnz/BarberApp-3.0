# Proposal: Daily Summary Date Selector (PR-028G)

## Intent

Add a lightweight date selector to the mobile Home screen so OWNER and BARBER users can view daily service summaries for past (and optionally future) dates, not just today.

## Motivation

Currently the Home screen always loads today's summary (`getTodayDateString()`). There is no way to look at yesterday's revenue, last Friday's records, or any other date. This makes the summary screen less useful for barbershop owners who need to review historical daily performance.

## Scope

- **In**: Previous day button, Today button, Next day button, visible selected date display, `selectedDate` state in Home screen, `loadSummaryForDate` store method, `addDaysToDateString` pure date helper.
- **Out**: Heavy date picker libraries (no `react-native-date-picker` or similar), charts, CSV/PDF export, new backend endpoints, role-based tab navigation, large component extraction.

## Approach

1. Add a pure `addDaysToDateString(date: string, amount: number): string` helper that manipulates YYYY-MM-DD strings using local calendar arithmetic (no UTC bugs).
2. Add `loadSummaryForDate(getToken, context, date)` to the summary store. Keep `loadTodaySummary` as a convenience wrapper that calls `loadSummaryForDate` with today's date.
3. Add `selectedDate` state to the Home screen, initialized with `getTodayDateString()`.
4. Add date navigation controls (prev/today/next + display) above the summary card.
5. Update pull-to-refresh to reload context and then reload summary for `selectedDate` (not always today).
6. CLIENT role remains unchanged — no summary calls.

## Rollback

Revert is trivial: remove the date controls from the Home screen, restore `loadTodaySummary` as the only store method, and remove `addDaysToDateString`. No backend or schema changes exist.

## Risks

- **Low**: Pure date arithmetic is well-tested. No external dependencies added. No backend changes. CLIENT path untouched.
