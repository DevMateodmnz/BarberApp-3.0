/**
 * Working hours store — Zustand store for barbershop weekly schedule.
 *
 * OWNER-only: loads and saves barbershop working hours.
 * BARBER and CLIENT are no-ops.
 */
import { create } from 'zustand';
import {
  fetchWorkingHours,
  putWorkingHours,
} from './workingHours.js';
import type { WorkingHoursDay } from './types.js';

interface WorkingHoursState {
  workingHours: WorkingHoursDay[];
  isWorkingHoursLoading: boolean;
  workingHoursError: string | null;

  loadWorkingHours: (
    getToken: () => Promise<string | null>,
    barbershopId: string | null,
  ) => Promise<void>;

  saveWorkingHours: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    days: WorkingHoursDay[],
  ) => Promise<WorkingHoursDay[]>;

  clearWorkingHours: () => void;
}

export const useWorkingHoursStore = create<WorkingHoursState>((set) => ({
  workingHours: [],
  isWorkingHoursLoading: false,
  workingHoursError: null,

  loadWorkingHours: async (getToken, barbershopId) => {
    if (!barbershopId) {
      return;
    }

    set({ isWorkingHoursLoading: true, workingHoursError: null });

    try {
      const workingHours = await fetchWorkingHours(getToken, barbershopId);
      set({ workingHours, isWorkingHoursLoading: false, workingHoursError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load working hours';
      set({ workingHours: [], isWorkingHoursLoading: false, workingHoursError: message });
    }
  },

  saveWorkingHours: async (getToken, barbershopId, days) => {
    const workingHours = await putWorkingHours(getToken, barbershopId, days);
    set({ workingHours, workingHoursError: null });
    return workingHours;
  },

  clearWorkingHours: () => {
    set({ workingHours: [], isWorkingHoursLoading: false, workingHoursError: null });
  },
}));
