/**
 * Employees store — Zustand store for barbershop employee roster.
 *
 * OWNER-only: loads, deactivates, and reactivates employees.
 * BARBER and CLIENT are no-ops.
 */
import { create } from 'zustand';
import {
  fetchEmployees,
  deactivateEmployee as deactivateEmployeeApi,
  reactivateEmployee as reactivateEmployeeApi,
  createEmployee as createEmployeeApi,
} from './employees.js';
import type { EmployeeListItem } from './types.js';

interface EmployeesState {
  employees: EmployeeListItem[];
  isEmployeesLoading: boolean;
  employeesError: string | null;

  loadEmployees: (
    getToken: () => Promise<string | null>,
    barbershopId: string | null,
  ) => Promise<void>;

  deactivateEmployee: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    employeeId: string,
  ) => Promise<void>;

  reactivateEmployee: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    employeeId: string,
  ) => Promise<void>;

  createEmployee: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    userId: string,
  ) => Promise<void>;

  clearEmployees: () => void;
}

export const useEmployeesStore = create<EmployeesState>((set, get) => ({
  employees: [],
  isEmployeesLoading: false,
  employeesError: null,

  loadEmployees: async (getToken, barbershopId) => {
    if (!barbershopId) {
      return;
    }

    set({ isEmployeesLoading: true, employeesError: null });

    try {
      const employees = await fetchEmployees(getToken, barbershopId);
      set({ employees, isEmployeesLoading: false, employeesError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ employees: [], isEmployeesLoading: false, employeesError: message });
    }
  },

  deactivateEmployee: async (getToken, barbershopId, employeeId) => {
    await deactivateEmployeeApi(getToken, barbershopId, employeeId);
    set({ employees: get().employees.filter((e) => e.id !== employeeId) });
  },

  reactivateEmployee: async (getToken, barbershopId, employeeId) => {
    await reactivateEmployeeApi(getToken, barbershopId, employeeId);
    // Reload the full list so the reactivated employee reappears with fresh data
    await fetchEmployees(getToken, barbershopId)
      .then((employees) => set({ employees }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        set({ employeesError: message });
      });
  },

  createEmployee: async (getToken, barbershopId, userId) => {
    set({ employeesError: null });
    try {
      await createEmployeeApi(getToken, barbershopId, userId);
      // Reload the full list for consistent ordering
      const employees = await fetchEmployees(getToken, barbershopId);
      set({ employees });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ employeesError: message });
    }
  },

  clearEmployees: () => {
    set({ employees: [], isEmployeesLoading: false, employeesError: null });
  },
}));
