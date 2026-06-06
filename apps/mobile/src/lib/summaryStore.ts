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
   * Loads today's daily summary based on the user's role and context.
   * - OWNER with barbershopId → loads barbershop summary.
   * - BARBER with barbershopId + employeeId → loads employee summary.
   * - CLIENT → no-op (summary stays null).
   * - Missing barbershopId or employeeId → no-op.
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

  loadTodaySummary: async (getToken, context) => {
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
      const date = getTodayDateString();
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

  clearSummary: () => {
    set({ summary: null, isSummaryLoading: false, summaryError: null });
  },
}));