/**
 * Employees store — Zustand store for barbershop employee roster.
 *
 * OWNER-only: loads, creates, deactivates, reactivates employees,
 * and manages service assignments.
 */
import { create } from 'zustand';
import {
  fetchEmployees,
  deactivateEmployee as deactivateEmployeeApi,
  reactivateEmployee as reactivateEmployeeApi,
  createEmployee as createEmployeeApi,
  friendlyCreateEmployeeError,
} from './employees.js';
import { ApiError } from './api.js';
import {
  fetchEmployeeServices,
  assignEmployeeService as assignEmployeeServiceApi,
  unassignEmployeeService as unassignEmployeeServiceApi,
} from './employeeServices.js';
import type { EmployeeListItem, Service } from './types.js';

interface EmployeesState {
  employees: EmployeeListItem[];
  isEmployeesLoading: boolean;
  employeesError: string | null;

  // Service assignments
  assignedServices: Service[];
  isAssignmentsLoading: boolean;
  assignmentsError: string | null;
  selectedEmployeeIdForAssignments: string | null;

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
    identifier: string,
  ) => Promise<void>;

  loadAssignments: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    employeeId: string,
  ) => Promise<void>;

  assignService: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    employeeId: string,
    serviceId: string,
  ) => Promise<void>;

  unassignService: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    employeeId: string,
    serviceId: string,
  ) => Promise<void>;

  clearAssignments: () => void;

  clearEmployees: () => void;
}

export const useEmployeesStore = create<EmployeesState>((set, get) => ({
  employees: [],
  isEmployeesLoading: false,
  employeesError: null,

  assignedServices: [],
  isAssignmentsLoading: false,
  assignmentsError: null,
  selectedEmployeeIdForAssignments: null,

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
    await fetchEmployees(getToken, barbershopId)
      .then((employees) => set({ employees }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        set({ employeesError: message });
      });
  },

  createEmployee: async (getToken, barbershopId, identifier) => {
    set({ employeesError: null });
    try {
      await createEmployeeApi(getToken, barbershopId, identifier);
      const employees = await fetchEmployees(getToken, barbershopId);
      set({ employees });
    } catch (err) {
      set({
        employeesError: friendlyCreateEmployeeError(
          err instanceof ApiError ? err : (err instanceof Error ? err.message : 'Unknown error'),
        ),
      });
    }
  },

  loadAssignments: async (getToken, barbershopId, employeeId) => {
    set({
      isAssignmentsLoading: true,
      assignmentsError: null,
      selectedEmployeeIdForAssignments: employeeId,
    });

    try {
      const assignedServices = await fetchEmployeeServices(getToken, barbershopId, employeeId);
      set({ assignedServices, isAssignmentsLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ assignedServices: [], isAssignmentsLoading: false, assignmentsError: message });
    }
  },

  assignService: async (getToken, barbershopId, employeeId, serviceId) => {
    await assignEmployeeServiceApi(getToken, barbershopId, employeeId, serviceId);
    // Reload assigned services to reflect the change
    const assignedServices = await fetchEmployeeServices(getToken, barbershopId, employeeId);
    set({ assignedServices, assignmentsError: null });
  },

  unassignService: async (getToken, barbershopId, employeeId, serviceId) => {
    await unassignEmployeeServiceApi(getToken, barbershopId, employeeId, serviceId);
    const assignedServices = await fetchEmployeeServices(getToken, barbershopId, employeeId);
    set({ assignedServices, assignmentsError: null });
  },

  clearAssignments: () => {
    set({
      assignedServices: [],
      isAssignmentsLoading: false,
      assignmentsError: null,
      selectedEmployeeIdForAssignments: null,
    });
  },

  clearEmployees: () => {
    set({ employees: [], isEmployeesLoading: false, employeesError: null });
  },
}));
