/**
 * Records store — Zustand store for daily service records list.
 *
 * Loads service records for a given date, mirroring the summaryStore
 * pattern. OWNER loads barbershop records; BARBER loads own records.
 * CLIENT is a no-op.
 */
import { create } from 'zustand';
import { fetchBarbershopRecords, fetchEmployeeRecords } from './serviceRecords.js';
import type { CurrentUserContext, ServiceRecord } from './types.js';

interface RecordsState {
  records: ServiceRecord[];
  isRecordsLoading: boolean;
  recordsError: string | null;

  /**
   * Loads service records for a specific date based on user role.
   * - OWNER with barbershopId → fetches barbershop records.
   * - BARBER with barbershopId + employeeId → fetches employee records.
   * - CLIENT → no-op.
   */
  loadRecordsForDate: (
    getToken: () => Promise<string | null>,
    context: CurrentUserContext,
    date: string,
  ) => Promise<void>;

  /** Resets records state to initial values. */
  clearRecords: () => void;
}

export const useRecordsStore = create<RecordsState>((set) => ({
  records: [],
  isRecordsLoading: false,
  recordsError: null,

  loadRecordsForDate: async (getToken, context, date) => {
    if (context.role === 'CLIENT') {
      return;
    }

    if (!context.barbershopId) {
      return;
    }

    if (context.role === 'BARBER' && !context.employeeId) {
      return;
    }

    set({ isRecordsLoading: true, recordsError: null });

    try {
      let records: ServiceRecord[];

      if (context.role === 'OWNER') {
        records = await fetchBarbershopRecords(
          getToken,
          context.barbershopId,
          date,
        );
      } else {
        records = await fetchEmployeeRecords(
          getToken,
          context.barbershopId,
          context.employeeId!,
          date,
        );
      }

      set({ records, isRecordsLoading: false, recordsError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ records: [], isRecordsLoading: false, recordsError: message });
    }
  },

  clearRecords: () => {
    set({ records: [], isRecordsLoading: false, recordsError: null });
  },
}));
