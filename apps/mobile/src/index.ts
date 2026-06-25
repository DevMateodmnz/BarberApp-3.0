/**
 * BarberApp Mobile — Entry Point
 *
 * Re-exports constants and types for convenience.
 * The actual app entry point is app/_layout.tsx (Expo Router).
 */

export { APP_NAME } from './lib/constants.js';
export type { ApiResponse } from './lib/api.js';
export type {
  UserRole,
  CurrentUserContext,
  PaymentMethodSummary,
  EmployeeSummary,
  BarbershopDailySummary,
  EmployeeDailySummary,
  DailySummary,
} from './lib/types.js';
export { createAuthInterceptor } from './lib/api.js';
export { fetchCurrentUserContext } from './lib/context.js';
export { useContextStore } from './lib/store.js';
export { fetchBarbershopDailySummary, fetchEmployeeDailySummary } from './lib/summary.js';
export { useSummaryStore } from './lib/summaryStore.js';