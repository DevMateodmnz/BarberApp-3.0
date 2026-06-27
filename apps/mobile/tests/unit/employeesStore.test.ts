/**
 * Unit tests for employeesStore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EmployeeInvitation,
  EmployeeInvitationCreateOutcome,
  EmployeeListItem,
  Service,
} from '../../src/lib/types.js';

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

const mockFetchEmployeeInvitations = vi.fn();
const mockCreateEmployeeInvitation = vi.fn();
const mockResendEmployeeInvitation = vi.fn();
const mockRevokeEmployeeInvitation = vi.fn();

vi.mock('../../src/lib/employeeInvitations.js', () => ({
  fetchEmployeeInvitations: (...args: unknown[]) => mockFetchEmployeeInvitations(...args),
  createEmployeeInvitation: (...args: unknown[]) => mockCreateEmployeeInvitation(...args),
  resendEmployeeInvitation: (...args: unknown[]) => mockResendEmployeeInvitation(...args),
  revokeEmployeeInvitation: (...args: unknown[]) => mockRevokeEmployeeInvitation(...args),
  reconcileEmployeeInvitationOnboarding: vi.fn(),
}));

const mockFetchEmployeeServices = vi.fn();
const mockAssignEmployeeService = vi.fn();
const mockUnassignEmployeeService = vi.fn();

vi.mock('../../src/lib/employeeServices.js', () => ({
  fetchEmployeeServices: (...args: unknown[]) => mockFetchEmployeeServices(...args),
  fetchMyAssignedServices: vi.fn(),
  assignEmployeeService: (...args: unknown[]) => mockAssignEmployeeService(...args),
  unassignEmployeeService: (...args: unknown[]) => mockUnassignEmployeeService(...args),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

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
    user: { id: 'user-1', email: 'barber@example.com', name: 'Barber One', role: 'BARBER' },
    ...overrides,
  };
}

function makeInvitation(
  overrides: Partial<EmployeeInvitation> = {},
): EmployeeInvitation {
  return {
    id: 'inv-1',
    email: 'barber@example.com',
    invitedRole: 'BARBER',
    status: 'PENDING',
    expiresAt: '2026-07-01T00:00:00.000Z',
    lastSentAt: '2026-06-26T00:00:00.000Z',
    resendCount: 0,
    acceptedAt: null,
    revokedAt: null,
    userId: null,
    employeeId: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  };
}

function makeOutcome(
  outcome: EmployeeInvitationCreateOutcome['outcome'],
  overrides: {
    employee?: Partial<EmployeeListItem>;
    invitation?: Partial<EmployeeInvitation>;
  } = {},
): EmployeeInvitationCreateOutcome {
  if (outcome === 'employee_created' || outcome === 'employee_reactivated') {
    return {
      outcome,
      employee: makeEmployee(overrides.employee),
      invitation: null,
    };
  }

  return {
    outcome,
    employee: null,
    invitation: makeInvitation(overrides.invitation),
  };
}

describe('useEmployeesStore', () => {
  beforeEach(async () => {
    const { useEmployeesStore } = await importStore();
    const { mobileLocalizationRuntime } = await import('../../src/i18n/runtime.js');
    await mobileLocalizationRuntime.i18n.changeLanguage('en');
    useEmployeesStore.setState({
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
    });
    vi.clearAllMocks();
  });

  it('has empty initial employee and invitation state', async () => {
    const { useEmployeesStore } = await importStore();
    expect(useEmployeesStore.getState()).toMatchObject({
      employees: [],
      isEmployeesLoading: false,
      employeesError: null,
      employeeInvitations: [],
      employeeInvitationsStatus: 'idle',
      employeeInvitationsError: null,
      employeeInvitationMutationStatus: 'idle',
      employeeInvitationMutationError: null,
      employeeInvitationsBarbershopId: null,
    });
  });

  it('loads employees for a barbershop', async () => {
    const { useEmployeesStore } = await importStore();
    const fakeEmployees = [makeEmployee(), makeEmployee({ id: 'emp-2', userId: 'user-2' })];
    mockFetchEmployees.mockResolvedValueOnce(fakeEmployees);

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().loadEmployees(getToken, 'shop-1');

    expect(mockFetchEmployees).toHaveBeenCalledWith(getToken, 'shop-1');
    expect(useEmployeesStore.getState().employees).toEqual(fakeEmployees);
  });

  it('clearEmployees resets employee + invitation state', async () => {
    const { useEmployeesStore } = await importStore();
    useEmployeesStore.setState({
      employees: [makeEmployee()],
      isEmployeesLoading: true,
      employeesError: 'err',
      employeeInvitations: [makeInvitation()],
      employeeInvitationsStatus: 'success',
      employeeInvitationsError: 'invitationExpired',
      employeeInvitationMutationStatus: 'creating',
      employeeInvitationMutationError: 'invitationRateLimited',
      employeeInvitationsBarbershopId: 'shop-1',
    });

    useEmployeesStore.getState().clearEmployees();

    expect(useEmployeesStore.getState()).toMatchObject({
      employees: [],
      isEmployeesLoading: false,
      employeesError: null,
      employeeInvitations: [],
      employeeInvitationsStatus: 'idle',
      employeeInvitationsError: null,
      employeeInvitationMutationStatus: 'idle',
      employeeInvitationMutationError: null,
      employeeInvitationsBarbershopId: null,
    });
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
    expect(useEmployeesStore.getState().employees).toEqual(freshList);
  });

  it('createEmployee preserves existing behavior and error localization', async () => {
    const { useEmployeesStore } = await importStore();
    const existingEmp = makeEmployee({ id: 'emp-1' });
    const newEmp = makeEmployee({ id: 'emp-2', userId: 'user-2' });
    useEmployeesStore.setState({ employees: [existingEmp] });
    mockCreateEmployee.mockResolvedValueOnce(newEmp);
    mockFetchEmployees.mockResolvedValueOnce([existingEmp, newEmp]);

    const getToken = vi.fn().mockResolvedValue('token');
    await useEmployeesStore.getState().createEmployee(getToken, 'shop-1', 'user-2');
    expect(useEmployeesStore.getState().employees).toEqual([existingEmp, newEmp]);

    mockCreateEmployee.mockRejectedValueOnce(new Error('User not found'));
    await expect(
      useEmployeesStore.getState().createEmployee(getToken, 'shop-1', 'bad-id'),
    ).rejects.toThrow('User not found');
    expect(useEmployeesStore.getState().employeesError).toBe(
      'No account found with this email or ID. Make sure the person has logged in at least once.',
    );
  });

  describe('employee invitations', () => {
    it('loads initial, empty, populated, and failed invitation states', async () => {
      const { useEmployeesStore } = await importStore();
      const getToken = vi.fn().mockResolvedValue('token');

      mockFetchEmployeeInvitations.mockResolvedValueOnce([]);
      await useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-1');
      expect(useEmployeesStore.getState()).toMatchObject({
        employeeInvitations: [],
        employeeInvitationsStatus: 'empty',
        employeeInvitationsBarbershopId: 'shop-1',
      });

      mockFetchEmployeeInvitations.mockResolvedValueOnce([
        makeInvitation({ id: 'inv-1', updatedAt: '2026-06-26T02:00:00.000Z' }),
        makeInvitation({ id: 'inv-2', status: 'DELIVERY_FAILED', updatedAt: '2026-06-26T03:00:00.000Z' }),
      ]);
      await useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-1');
      expect(useEmployeesStore.getState().employeeInvitations.map((invitation) => invitation.id)).toEqual([
        'inv-2',
        'inv-1',
      ]);
      expect(useEmployeesStore.getState().employeeInvitationsStatus).toBe('success');

      const { ApiError } = await import('../../src/lib/api.js');
      mockFetchEmployeeInvitations.mockRejectedValueOnce(
        new ApiError('missing', 'EMPLOYEE_INVITATION_NOT_FOUND', 404),
      );
      await useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-1');
      expect(useEmployeesStore.getState().employeeInvitationsError).toBe('invitationNotFound');
      expect(useEmployeesStore.getState().employeeInvitationsStatus).toBe('error');
    });

    it('clears stale state on shop change and ignores the old shop response', async () => {
      const { useEmployeesStore } = await importStore();
      const firstLoad = deferred<EmployeeInvitation[]>();
      const secondLoad = deferred<EmployeeInvitation[]>();

      mockFetchEmployeeInvitations
        .mockReturnValueOnce(firstLoad.promise)
        .mockReturnValueOnce(secondLoad.promise);

      const getToken = vi.fn().mockResolvedValue('token');
      const firstPromise = useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-1');
      const secondPromise = useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-2');

      firstLoad.resolve([makeInvitation({ id: 'shop-1-inv' })]);
      secondLoad.resolve([makeInvitation({ id: 'shop-2-inv', email: 'shop2@example.com' })]);
      await Promise.all([firstPromise, secondPromise]);

      expect(useEmployeesStore.getState()).toMatchObject({
        employeeInvitationsBarbershopId: 'shop-2',
        employeeInvitationsStatus: 'success',
      });
      expect(useEmployeesStore.getState().employeeInvitations.map((invitation) => invitation.id)).toEqual([
        'shop-2-inv',
      ]);
    });

    it('does not let an earlier failure overwrite a newer success', async () => {
      const { useEmployeesStore } = await importStore();
      const firstLoad = deferred<EmployeeInvitation[]>();
      const secondLoad = deferred<EmployeeInvitation[]>();

      mockFetchEmployeeInvitations
        .mockReturnValueOnce(firstLoad.promise)
        .mockReturnValueOnce(secondLoad.promise);

      const getToken = vi.fn().mockResolvedValue('token');
      const firstPromise = useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-1');
      const secondPromise = useEmployeesStore.getState().loadEmployeeInvitations(getToken, 'shop-1');

      secondLoad.resolve([makeInvitation({ id: 'latest' })]);
      firstLoad.reject(new Error('older failure'));

      await Promise.allSettled([firstPromise, secondPromise]);

      expect(useEmployeesStore.getState()).toMatchObject({
        employeeInvitationsStatus: 'success',
        employeeInvitationsError: null,
      });
      expect(useEmployeesStore.getState().employeeInvitations.map((invitation) => invitation.id)).toEqual([
        'latest',
      ]);
    });

    it('employee_created upserts the employee once and does not add a pending invitation', async () => {
      const { useEmployeesStore } = await importStore();
      useEmployeesStore.setState({ employees: [makeEmployee()] });
      mockCreateEmployeeInvitation.mockResolvedValueOnce(
        makeOutcome('employee_created', { employee: { id: 'emp-2', userId: 'user-2', user: { id: 'user-2', email: 'new@example.com', name: 'New Barber', role: 'BARBER' } } }),
      );

      const getToken = vi.fn().mockResolvedValue('token');
      const result = await useEmployeesStore.getState().createEmployeeInvitation(
        getToken,
        'shop-1',
        'new@example.com',
      );

      expect(result.outcome).toBe('employee_created');
      expect(useEmployeesStore.getState().employees).toHaveLength(2);
      expect(useEmployeesStore.getState().employeeInvitations).toEqual([]);
    });

    it('employee_reactivated updates the same employee and removes obsolete invitation rows by email', async () => {
      const { useEmployeesStore } = await importStore();
      useEmployeesStore.setState({
        employees: [makeEmployee({ id: 'emp-1', isActive: false })],
        employeeInvitations: [makeInvitation({ id: 'inv-old', email: 'barber@example.com' })],
        employeeInvitationsBarbershopId: 'shop-1',
      });
      mockCreateEmployeeInvitation.mockResolvedValueOnce(
        makeOutcome('employee_reactivated', { employee: { id: 'emp-1', isActive: true } }),
      );

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().createEmployeeInvitation(
        getToken,
        'shop-1',
        'barber@example.com',
      );

      expect(useEmployeesStore.getState().employees[0]?.isActive).toBe(true);
      expect(useEmployeesStore.getState().employeeInvitations).toEqual([]);
    });

    it('invitation_created and invitation_pending upsert without duplication', async () => {
      const { useEmployeesStore } = await importStore();
      useEmployeesStore.setState({
        employeeInvitations: [makeInvitation({ id: 'inv-1', resendCount: 0 })],
        employeeInvitationsBarbershopId: 'shop-1',
      });

      mockCreateEmployeeInvitation
        .mockResolvedValueOnce(
          makeOutcome('invitation_created', {
            invitation: { id: 'inv-2', email: 'created@example.com' },
          }),
        )
        .mockResolvedValueOnce(
          makeOutcome('invitation_pending', {
            invitation: { id: 'inv-1', resendCount: 2, lastSentAt: '2026-06-27T00:00:00.000Z' },
          }),
        );

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().createEmployeeInvitation(getToken, 'shop-1', 'created@example.com');
      expect(useEmployeesStore.getState().employeeInvitations).toHaveLength(2);

      await useEmployeesStore.getState().createEmployeeInvitation(getToken, 'shop-1', 'barber@example.com');
      expect(useEmployeesStore.getState().employeeInvitations).toHaveLength(2);
      expect(
        useEmployeesStore.getState().employeeInvitations.find((invitation) => invitation.id === 'inv-1')?.resendCount,
      ).toBe(2);
    });

    it('failed create preserves employee/invitation data and records semantic mutation error', async () => {
      const { useEmployeesStore } = await importStore();
      const { ApiError } = await import('../../src/lib/api.js');
      useEmployeesStore.setState({
        employees: [makeEmployee()],
        employeeInvitations: [makeInvitation()],
        employeeInvitationsBarbershopId: 'shop-1',
      });
      mockCreateEmployeeInvitation.mockRejectedValueOnce(
        new ApiError('rate limited', 'EMPLOYEE_INVITATION_RATE_LIMITED', 429),
      );

      const getToken = vi.fn().mockResolvedValue('token');
      await expect(
        useEmployeesStore.getState().createEmployeeInvitation(getToken, 'shop-1', 'barber@example.com'),
      ).rejects.toThrow('rate limited');

      expect(useEmployeesStore.getState()).toMatchObject({
        employeeInvitationMutationError: 'invitationRateLimited',
        employeeInvitationMutationStatus: 'idle',
      });
      expect(useEmployeesStore.getState().employees).toHaveLength(1);
      expect(useEmployeesStore.getState().employeeInvitations).toHaveLength(1);
    });

    it('ignores stale create results after tenant context changes', async () => {
      const { useEmployeesStore } = await importStore();
      const pendingCreate = deferred<EmployeeInvitationCreateOutcome>();
      mockCreateEmployeeInvitation.mockReturnValueOnce(pendingCreate.promise);

      const getToken = vi.fn().mockResolvedValue('token');
      const createPromise = useEmployeesStore.getState().createEmployeeInvitation(
        getToken,
        'shop-1',
        'barber@example.com',
      );
      useEmployeesStore.getState().clearEmployeeInvitations();
      useEmployeesStore.setState({ employeeInvitationsBarbershopId: 'shop-2' });

      pendingCreate.resolve(
        makeOutcome('invitation_created', {
          invitation: { id: 'stale-inv', email: 'barber@example.com' },
        }),
      );
      await createPromise;

      expect(useEmployeesStore.getState()).toMatchObject({
        employeeInvitations: [],
        employeeInvitationsBarbershopId: 'shop-2',
      });
    });

    it('resend replaces invitation data and revoke keeps the row as REVOKED', async () => {
      const { useEmployeesStore } = await importStore();
      useEmployeesStore.setState({
        employeeInvitations: [makeInvitation({ id: 'inv-1' })],
        employeeInvitationsBarbershopId: 'shop-1',
      });

      mockResendEmployeeInvitation.mockResolvedValueOnce(
        makeInvitation({
          id: 'inv-1',
          resendCount: 3,
          expiresAt: '2026-07-04T00:00:00.000Z',
          lastSentAt: '2026-06-27T00:00:00.000Z',
        }),
      );
      mockRevokeEmployeeInvitation.mockResolvedValueOnce(
        makeInvitation({
          id: 'inv-1',
          status: 'REVOKED',
          revokedAt: '2026-06-27T01:00:00.000Z',
        }),
      );

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().resendEmployeeInvitation(getToken, 'shop-1', 'inv-1');
      expect(useEmployeesStore.getState().employeeInvitations[0]).toMatchObject({
        resendCount: 3,
        expiresAt: '2026-07-04T00:00:00.000Z',
      });

      await useEmployeesStore.getState().revokeEmployeeInvitation(getToken, 'shop-1', 'inv-1');
      expect(useEmployeesStore.getState().employeeInvitations[0]).toMatchObject({
        status: 'REVOKED',
      });
    });
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

    it('loadAssignments sets assigned services', async () => {
      const { useEmployeesStore } = await importStore();
      const assignedSvcs = [makeSvc('svc-1')];
      mockFetchEmployeeServices.mockResolvedValueOnce(assignedSvcs);

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().loadAssignments(getToken, 'shop-1', 'emp-1');

      expect(mockFetchEmployeeServices).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1');
      expect(useEmployeesStore.getState().assignedServices).toEqual(assignedSvcs);
    });

    it('assignService and unassignService reload assigned services', async () => {
      const { useEmployeesStore } = await importStore();
      const afterAssign = [makeSvc('svc-1'), makeSvc('svc-2')];
      const afterUnassign = [makeSvc('svc-2')];
      mockAssignEmployeeService.mockResolvedValueOnce({});
      mockFetchEmployeeServices.mockResolvedValueOnce(afterAssign);
      mockUnassignEmployeeService.mockResolvedValueOnce(undefined);
      mockFetchEmployeeServices.mockResolvedValueOnce(afterUnassign);

      const getToken = vi.fn().mockResolvedValue('token');
      await useEmployeesStore.getState().assignService(getToken, 'shop-1', 'emp-1', 'svc-2');
      expect(useEmployeesStore.getState().assignedServices).toEqual(afterAssign);

      await useEmployeesStore.getState().unassignService(getToken, 'shop-1', 'emp-1', 'svc-1');
      expect(useEmployeesStore.getState().assignedServices).toEqual(afterUnassign);
    });
  });
});
