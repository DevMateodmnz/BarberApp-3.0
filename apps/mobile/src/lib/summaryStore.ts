/**
 * Summary store — Zustand store for daily service summary.
 *
 * Loads today's OWNER or BARBER summary based on user context.
 * CLIENT does not load any summary.
 */
import { create } from 'zustand';
import { fetchBarbershopDailySummary, fetchEmployeeDailySummary } from './summary.js';
import { getTodayDateString } from './format.js';
import type { CurrentUserContext, DailySummary } from './types.js';

interface SummaryState {
  summary: DailySummary | null;
  isSummaryLoading: boolean;
  summaryError: string | null;

  /**
   * Loads a daily summary for a specific date based on the user's role and context.
   * - OWNER with barbershopId → loads barbershop summary.
   * - BARBER with barbershopId + employeeId → loads employee summary.
   * - CLIENT → no-op (summary stays null).
   * - Missing barbershopId or employeeId → no-op.
   *
   * @param getToken - Function to retrieve the Clerk auth token
   * @param context - Current user context (role, shop, employee)
   * @param date - Date string in YYYY-MM-DD format
   */
  loadSummaryForDate: (getToken: () => Promise<string | null>, context: CurrentUserContext, date: string) => Promise<void>;

  /**
   * Loads today's daily summary based on the user's role and context.
   * Convenience wrapper that delegates to loadSummaryForDate with getTodayDateString().
   * Preserved for backward compatibility with existing callers.
   */
  loadTodaySummary: (getToken: () => Promise<string | null>, context: CurrentUserContext) => Promise<void>;

  /** Resets summary state to initial values. */
  clearSummary: () => void;
}

/**
 * Zustand store for daily service summary.
 *
 * Usage in a React component:
 *   const { summary, isSummaryLoading, summaryError, loadTodaySummary } = useSummaryStore();
 */
export const useSummaryStore = create<SummaryState>((set) => ({
  summary: null,
  isSummaryLoading: false,
  summaryError: null,

  loadSummaryForDate: async (getToken, context, date) => {
    // CLIENT never loads summary
    if (context.role === 'CLIENT') {
      return;
    }

    // Need barbershopId for both OWNER and BARBER
    if (!context.barbershopId) {
      return;
    }

    // BARBER needs employeeId
    if (context.role === 'BARBER' && !context.employeeId) {
      return;
    }

    set({ isSummaryLoading: true, summaryError: null });

    try {
      let summary: DailySummary;

      if (context.role === 'OWNER') {
        summary = await fetchBarbershopDailySummary(getToken, context.barbershopId, date);
      } else {
        // BARBER
        summary = await fetchEmployeeDailySummary(
          getToken,
          context.barbershopId,
          context.employeeId!,
          date
        );
      }

      set({ summary, isSummaryLoading: false, summaryError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ summary: null, isSummaryLoading: false, summaryError: message });
    }
  },

  loadTodaySummary: async (getToken, context) => {
    const state = useSummaryStore.getState();
    await state.loadSummaryForDate(getToken, context, getTodayDateString());
  },

  clearSummary: () => {
    set({ summary: null, isSummaryLoading: false, summaryError: null });
  },
}));