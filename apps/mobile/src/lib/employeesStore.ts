/**
 * Employees store — Zustand store for barbershop employee roster.
 *
 * OWNER-only: loads, creates, deactivates, reactivates employees,
 * invitation lifecycle state, and manages service assignments.
 */
import { create } from 'zustand';
import { localizeUnknownError } from '@/i18n/errors.js';
import { ApiError } from './api.js';
import {
  mapEmployeeInvitationApiError,
  mergeEmployeeInvitations,
  normalizeEmployeeInvitationEmail,
  sortEmployeeInvitations,
  upsertEmployeeInvitation,
  type EmployeeInvitationErrorKey,
  type EmployeeInvitationLoadStatus,
  type EmployeeInvitationMutationStatus,
} from './employeeInvitationDomain.js';
import {
  createEmployeeInvitation as createEmployeeInvitationApi,
  fetchEmployeeInvitations,
  resendEmployeeInvitation as resendEmployeeInvitationApi,
  revokeEmployeeInvitation as revokeEmployeeInvitationApi,
} from './employeeInvitations.js';
import {
  createEmployee as createEmployeeApi,
  deactivateEmployee as deactivateEmployeeApi,
  fetchEmployees,
  friendlyCreateEmployeeError,
  reactivateEmployee as reactivateEmployeeApi,
} from './employees.js';
import {
  assignEmployeeService as assignEmployeeServiceApi,
  fetchEmployeeServices,
  unassignEmployeeService as unassignEmployeeServiceApi,
} from './employeeServices.js';
import type {
  EmployeeInvitation,
  EmployeeInvitationCreateOutcome,
  EmployeeListItem,
  Service,
} from './types.js';

interface EmployeesState {
  employees: EmployeeListItem[];
  isEmployeesLoading: boolean;
  employeesError: string | null;

  employeeInvitations: EmployeeInvitation[];
  employeeInvitationsStatus: EmployeeInvitationLoadStatus;
  employeeInvitationsError: EmployeeInvitationErrorKey | null;
  employeeInvitationMutationStatus: EmployeeInvitationMutationStatus;
  employeeInvitationMutationError: EmployeeInvitationErrorKey | null;
  employeeInvitationsBarbershopId: string | null;

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

  loadEmployeeInvitations: (
    getToken: () => Promise<string | null>,
    barbershopId: string | null,
  ) => Promise<void>;

  createEmployeeInvitation: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    email: string,
  ) => Promise<EmployeeInvitationCreateOutcome>;

  resendEmployeeInvitation: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    invitationId: string,
  ) => Promise<void>;

  revokeEmployeeInvitation: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    invitationId: string,
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
  clearEmployeeInvitations: () => void;
  clearEmployees: () => void;
}

function upsertEmployee(
  employees: readonly EmployeeListItem[],
  employee: EmployeeListItem,
): EmployeeListItem[] {
  const index = employees.findIndex((current) => current.id === employee.id);
  if (index === -1) {
    return [...employees, employee];
  }

  const next = [...employees];
  next[index] = employee;
  return next;
}

function removeInvitationsByEmail(
  invitations: readonly EmployeeInvitation[],
  email: string,
): EmployeeInvitation[] {
  const normalizedEmail = normalizeEmployeeInvitationEmail(email);
  return sortEmployeeInvitations(
    invitations.filter(
      (invitation) =>
        normalizeEmployeeInvitationEmail(invitation.email) !== normalizedEmail,
    ),
  );
}

export const useEmployeesStore = create<EmployeesState>((set, get) => {
  let invitationTenantGeneration = 0;
  let invitationLoadRequestId = 0;
  let invitationMutationRequestId = 0;

  function isCurrentInvitationContext(
    generation: number,
    requestId: number,
    barbershopId: string,
    kind: 'load' | 'mutation',
  ): boolean {
    return (
      generation === invitationTenantGeneration
      && requestId === (
        kind === 'load' ? invitationLoadRequestId : invitationMutationRequestId
      )
      && get().employeeInvitationsBarbershopId === barbershopId
    );
  }

  function resetInvitationState(): Pick<
    EmployeesState,
    | 'employeeInvitations'
    | 'employeeInvitationsStatus'
    | 'employeeInvitationsError'
    | 'employeeInvitationMutationStatus'
    | 'employeeInvitationMutationError'
    | 'employeeInvitationsBarbershopId'
  > {
    return {
      employeeInvitations: [],
      employeeInvitationsStatus: 'idle',
      employeeInvitationsError: null,
      employeeInvitationMutationStatus: 'idle',
      employeeInvitationMutationError: null,
      employeeInvitationsBarbershopId: null,
    };
  }

  function ensureInvitationTenant(barbershopId: string): void {
    if (get().employeeInvitationsBarbershopId === barbershopId) {
      return;
    }

    invitationTenantGeneration += 1;
    set({
      ...resetInvitationState(),
      employeeInvitationsBarbershopId: barbershopId,
    });
  }

  return {
    employees: [],
    isEmployeesLoading: false,
    employeesError: null,

    employeeInvitations: [],
    employeeInvitationsStatus: 'idle',
    employeeInvitationsError: null,
    employeeInvitationMutationStatus: 'idle',
    employeeInvitationMutationError: null,
    employeeInvitationsBarbershopId: null,

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
        const message = err instanceof Error ? err.message : localizeUnknownError('Unknown error');
        set({ employees: [], isEmployeesLoading: false, employeesError: message });
      }
    },

    deactivateEmployee: async (getToken, barbershopId, employeeId) => {
      await deactivateEmployeeApi(getToken, barbershopId, employeeId);
      set({ employees: get().employees.filter((employee) => employee.id !== employeeId) });
    },

    reactivateEmployee: async (getToken, barbershopId, employeeId) => {
      await reactivateEmployeeApi(getToken, barbershopId, employeeId);
      await fetchEmployees(getToken, barbershopId)
        .then((employees) => set({ employees }))
        .catch((err) => {
          const message = err instanceof Error ? err.message : localizeUnknownError('Unknown error');
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
            err instanceof ApiError ? err : (err instanceof Error ? err.message : localizeUnknownError('Unknown error')),
          ),
        });
        throw err;
      }
    },

    loadEmployeeInvitations: async (getToken, barbershopId) => {
      if (!barbershopId) {
        invitationTenantGeneration += 1;
        set(resetInvitationState());
        return;
      }

      const isTenantChange =
        get().employeeInvitationsBarbershopId !== null
        && get().employeeInvitationsBarbershopId !== barbershopId;

      if (isTenantChange) {
        invitationTenantGeneration += 1;
      }

      const generation = invitationTenantGeneration;
      const requestId = ++invitationLoadRequestId;

      set({
        employeeInvitations: isTenantChange ? [] : get().employeeInvitations,
        employeeInvitationsStatus: 'loading',
        employeeInvitationsError: null,
        employeeInvitationsBarbershopId: barbershopId,
      });

      try {
        const invitations = mergeEmployeeInvitations(
          await fetchEmployeeInvitations(getToken, barbershopId),
        );
        if (!isCurrentInvitationContext(generation, requestId, barbershopId, 'load')) {
          return;
        }

        set({
          employeeInvitations: invitations,
          employeeInvitationsStatus: invitations.length > 0 ? 'success' : 'empty',
          employeeInvitationsError: null,
        });
      } catch (err) {
        if (!isCurrentInvitationContext(generation, requestId, barbershopId, 'load')) {
          return;
        }

        set({
          employeeInvitationsStatus: 'error',
          employeeInvitationsError: mapEmployeeInvitationApiError(err),
        });
      }
    },

    createEmployeeInvitation: async (getToken, barbershopId, email) => {
      ensureInvitationTenant(barbershopId);
      const generation = invitationTenantGeneration;
      const requestId = ++invitationMutationRequestId;

      set({
        employeeInvitationMutationStatus: 'creating',
        employeeInvitationMutationError: null,
      });

      try {
        const outcome = await createEmployeeInvitationApi(getToken, barbershopId, email);
        if (!isCurrentInvitationContext(generation, requestId, barbershopId, 'mutation')) {
          return outcome;
        }

        if (outcome.employee) {
          set({
            employees: upsertEmployee(get().employees, outcome.employee),
            employeeInvitations: removeInvitationsByEmail(
              get().employeeInvitations,
              outcome.employee.user.email,
            ),
            employeeInvitationMutationStatus: 'idle',
            employeeInvitationMutationError: null,
          });
          return outcome;
        }

        set({
          employeeInvitations: upsertEmployeeInvitation(
            get().employeeInvitations,
            outcome.invitation,
          ),
          employeeInvitationsStatus: 'success',
          employeeInvitationMutationStatus: 'idle',
          employeeInvitationMutationError: null,
        });
        return outcome;
      } catch (err) {
        if (isCurrentInvitationContext(generation, requestId, barbershopId, 'mutation')) {
          set({
            employeeInvitationMutationStatus: 'idle',
            employeeInvitationMutationError: mapEmployeeInvitationApiError(err),
          });
        }
        throw err;
      }
    },

    resendEmployeeInvitation: async (getToken, barbershopId, invitationId) => {
      ensureInvitationTenant(barbershopId);
      const generation = invitationTenantGeneration;
      const requestId = ++invitationMutationRequestId;

      set({
        employeeInvitationMutationStatus: 'resending',
        employeeInvitationMutationError: null,
      });

      try {
        const invitation = await resendEmployeeInvitationApi(getToken, barbershopId, invitationId);
        if (!isCurrentInvitationContext(generation, requestId, barbershopId, 'mutation')) {
          return;
        }

        set({
          employeeInvitations: upsertEmployeeInvitation(get().employeeInvitations, invitation),
          employeeInvitationsStatus: 'success',
          employeeInvitationMutationStatus: 'idle',
          employeeInvitationMutationError: null,
        });
      } catch (err) {
        if (isCurrentInvitationContext(generation, requestId, barbershopId, 'mutation')) {
          set({
            employeeInvitationMutationStatus: 'idle',
            employeeInvitationMutationError: mapEmployeeInvitationApiError(err),
          });
        }
        throw err;
      }
    },

    revokeEmployeeInvitation: async (getToken, barbershopId, invitationId) => {
      ensureInvitationTenant(barbershopId);
      const generation = invitationTenantGeneration;
      const requestId = ++invitationMutationRequestId;

      set({
        employeeInvitationMutationStatus: 'revoking',
        employeeInvitationMutationError: null,
      });

      try {
        const invitation = await revokeEmployeeInvitationApi(getToken, barbershopId, invitationId);
        if (!isCurrentInvitationContext(generation, requestId, barbershopId, 'mutation')) {
          return;
        }

        set({
          employeeInvitations: upsertEmployeeInvitation(get().employeeInvitations, invitation),
          employeeInvitationsStatus: 'success',
          employeeInvitationMutationStatus: 'idle',
          employeeInvitationMutationError: null,
        });
      } catch (err) {
        if (isCurrentInvitationContext(generation, requestId, barbershopId, 'mutation')) {
          set({
            employeeInvitationMutationStatus: 'idle',
            employeeInvitationMutationError: mapEmployeeInvitationApiError(err),
          });
        }
        throw err;
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
        const message = err instanceof Error ? err.message : localizeUnknownError('Unknown error');
        set({ assignedServices: [], isAssignmentsLoading: false, assignmentsError: message });
      }
    },

    assignService: async (getToken, barbershopId, employeeId, serviceId) => {
      await assignEmployeeServiceApi(getToken, barbershopId, employeeId, serviceId);
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

    clearEmployeeInvitations: () => {
      invitationTenantGeneration += 1;
      set(resetInvitationState());
    },

    clearEmployees: () => {
      invitationTenantGeneration += 1;
      set({
        employees: [],
        isEmployeesLoading: false,
        employeesError: null,
        ...resetInvitationState(),
      });
    },
  };
});
