/**
 * Unit tests for employeesStore — PR-060A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmployeeListItem, Service } from '../../src/lib/types.js';

const mockFetchEmployees = vi.fn();
const mockDeactivateEmployee = vi.fn();
const mockReactivateEmployee = vi.fn();
const mockCreateEmployee = vi.fn();

vi.mock('../../src/lib/employees.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/employees.js')>();
  return {
    ...actual,
    fetchEmployees: (...args: unknown[]) => mockFetchEmployees(...args),
    deactivateEmployee: (...args: unknown[]) => mockDeactivateEmployee(...args),
    reactivateEmployee: (...args: unknown[]) => mockReactivateEmployee(...args),
    createEmployee: (...args: unknown[]) => mockCreateEmployee(...args),
  };
});

const mockFetchEmployeeServices = vi.fn();
const mockAssignEmployeeService = vi.fn();
const mockUnassignEmployeeService = vi.fn();

vi.mock('../../src/lib/employeeServices.js', () => ({
  fetchEmployeeServices: (...args: unknown[]) => mockFetchEmployeeServices(...args),
  fetchMyAssignedServices: vi.fn(),
  assignEmployeeService: (...args: unknown[]) => mockAssignEmployeeService(...args),
  unassignEmployeeService: (...args: unknown[]) => mockUnassignEmployeeService(...args),
}));

async function importStore() {
  return import('../../src/lib/employeesStore.js');
}

function makeEmployee(overrides: Partial<EmployeeListItem> = {}): EmployeeListItem {
  return {
    id: 'emp-1',
    barbershopId: 'shop-1',
    userId: 'user-1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'user-1', email: 'b@t.com', name: 'Barber One', role: 'BARBER' },
    ...overrides,
  };
}

describe('useEmployeesStore', () => {
  beforeEach(async () => {
    const { useEmployeesStore } = await importStore();
    useEmployeesStore.setState({ employees: [], isEmployeesLoading: false, employeesError: null });
    vi.clearAllMocks();
  });

  it('initial state is empty', async () => {
    const { useEmployeesStore } = await importStore();
    const state = useEmployeesStore.getState();
    expect(state.employees).toEqual([]);
    expect(state.isEmployeesLoading).toBe(false);
    expect(state.employeesError).toBeNull();
  });

  it('loads employees for a barbershop', async () => {
    const { useEmployeesStore } = await importStore();
    const fakeEmployees = [makeEmployee(), makeEmployee({ id: 'emp-2', userId: 'user-2' })];
    mockFetchEmployees.mockResolvedValueOnce(fakeEmployees);

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().loadEmployees(getToken, 'shop-1');

    expect(mockFetchEmployees).toHaveBeenCalledWith(getToken, 'shop-1');
    expect(useEmployeesStore.getState().employees).toEqual(fakeEmployees);
    expect(useEmployeesStore.getState().isEmployeesLoading).toBe(false);
  });

  it('no-ops when barbershopId is null', async () => {
    const { useEmployeesStore } = await importStore();
    const getToken = vi.fn();

    await useEmployeesStore.getState().loadEmployees(getToken, null);

    expect(mockFetchEmployees).not.toHaveBeenCalled();
    expect(useEmployeesStore.getState().employees).toEqual([]);
  });

  it('sets error state on failure', async () => {
    const { useEmployeesStore } = await importStore();
    mockFetchEmployees.mockRejectedValueOnce(new Error('Network error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().loadEmployees(getToken, 'shop-1');

    expect(useEmployeesStore.getState().employeesError).toBe('Network error');
    expect(useEmployeesStore.getState().isEmployeesLoading).toBe(false);
  });

  it('clearEmployees resets state', async () => {
    const { useEmployeesStore } = await importStore();
    useEmployeesStore.setState({
      employees: [makeEmployee()],
      isEmployeesLoading: true,
      employeesError: 'err',
    });

    useEmployeesStore.getState().clearEmployees();

    const state = useEmployeesStore.getState();
    expect(state.employees).toEqual([]);
    expect(state.isEmployeesLoading).toBe(false);
    expect(state.employeesError).toBeNull();
  });

  it('deactivateEmployee calls API and removes from list', async () => {
    const { useEmployeesStore } = await importStore();
    const emp1 = makeEmployee({ id: 'emp-1' });
    const emp2 = makeEmployee({ id: 'emp-2' });
    useEmployeesStore.setState({ employees: [emp1, emp2] });
    mockDeactivateEmployee.mockResolvedValueOnce(undefined);

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().deactivateEmployee(getToken, 'shop-1', 'emp-1');

    expect(mockDeactivateEmployee).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1');
    expect(useEmployeesStore.getState().employees).toEqual([emp2]);
  });

  it('reactivateEmployee calls API and re-fetches list', async () => {
    const { useEmployeesStore } = await importStore();
    const freshList = [makeEmployee({ id: 'emp-1' }), makeEmployee({ id: 'emp-2' })];
    mockReactivateEmployee.mockResolvedValueOnce({});
    mockFetchEmployees.mockResolvedValueOnce(freshList);

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().reactivateEmployee(getToken, 'shop-1', 'emp-1');

    expect(mockReactivateEmployee).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1');
    expect(mockFetchEmployees).toHaveBeenCalledWith(getToken, 'shop-1');
    expect(useEmployeesStore.getState().employees).toEqual(freshList);
  });

  it('createEmployee sends userId and reloads list', async () => {
    const { useEmployeesStore } = await importStore();
    const existingEmp = makeEmployee({ id: 'emp-1' });
    useEmployeesStore.setState({ employees: [existingEmp] });

    const newEmp = makeEmployee({ id: 'emp-2', userId: 'user-2' });
    mockCreateEmployee.mockResolvedValueOnce(newEmp);
    const freshList = [existingEmp, newEmp];
    mockFetchEmployees.mockResolvedValueOnce(freshList);

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().createEmployee(getToken, 'shop-1', 'user-2');

    expect(mockCreateEmployee).toHaveBeenCalledWith(getToken, 'shop-1', 'user-2');
    expect(mockFetchEmployees).toHaveBeenCalledWith(getToken, 'shop-1');
    expect(useEmployeesStore.getState().employees).toEqual(freshList);
  });

  it('createEmployee error does not mutate list', async () => {
    const { useEmployeesStore } = await importStore();
    const existingEmp = makeEmployee({ id: 'emp-1' });
    useEmployeesStore.setState({ employees: [existingEmp] });
    mockCreateEmployee.mockRejectedValueOnce(new Error('User not found'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().createEmployee(getToken, 'shop-1', 'bad-id');

    expect(useEmployeesStore.getState().employeesError).toBe(
      'No account found with this email or ID. Make sure the person has logged in at least once.',
    );
    expect(useEmployeesStore.getState().employees).toEqual([existingEmp]);
  });

  describe('service assignments', () => {
    function makeSvc(id: string): Service {
      return {
        id,
        name: `Service ${id}`,
        description: null,
        durationMinutes: 30,
        priceCents: 1000,
        currency: 'ARS',
        isActive: true,
      };
    }

    it('loadAssignments sets assigned and all services', async () => {
      const { useEmployeesStore } = await importStore();
      const assignedSvcs = [makeSvc('svc-1')];
      mockFetchEmployeeServices.mockResolvedValueOnce(assignedSvcs);

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().loadAssignments(getToken, 'shop-1', 'emp-1');

      expect(mockFetchEmployeeServices).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1');
      expect(useEmployeesStore.getState().assignedServices).toEqual(assignedSvcs);
    });

    it('assignService reloads assigned services', async () => {
      const { useEmployeesStore } = await importStore();
      const afterAssign = [makeSvc('svc-1'), makeSvc('svc-2')];
      mockAssignEmployeeService.mockResolvedValueOnce({});
      mockFetchEmployeeServices.mockResolvedValueOnce(afterAssign);

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().assignService(getToken, 'shop-1', 'emp-1', 'svc-2');

      expect(mockAssignEmployeeService).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1', 'svc-2');
      expect(useEmployeesStore.getState().assignedServices).toEqual(afterAssign);
    });

    it('unassignService reloads assigned services', async () => {
      const { useEmployeesStore } = await importStore();
      const afterUnassign = [makeSvc('svc-2')];
      mockUnassignEmployeeService.mockResolvedValueOnce(undefined);
      mockFetchEmployeeServices.mockResolvedValueOnce(afterUnassign);

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().unassignService(getToken, 'shop-1', 'emp-1', 'svc-1');

      expect(mockUnassignEmployeeService).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1', 'svc-1');
      expect(useEmployeesStore.getState().assignedServices).toEqual(afterUnassign);
    });
  });
});
