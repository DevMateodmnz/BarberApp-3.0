import { describe, expect, it, vi } from 'vitest';

import {
  EmployeesScreenView,
  type EmployeeRowViewModel,
  type EmployeeServiceActionViewModel,
} from '@/components/EmployeesScreenView.js';
import {
  changeText,
  findAll,
  findByDisplayName,
  findByTestId,
  findByText,
  getDisplayName,
  press,
  queryByTestId,
} from '@/testing/elementTree.js';
import type { ReactElement, ReactNode } from 'react';

interface ElementLike {
  type: { displayName?: string } | string;
  props: Record<string, unknown>;
}

function pressButton(node: ReactNode, testID: string): void {
  const matches = findAll(
    node,
    (el) => getDisplayName(el) === 'Pressable' && (el as ElementLike).props.testID === testID,
  );
  if (matches.length === 0) {
    throw new Error(`No Pressable button with testID ${testID}`);
  }
  press(matches[0] as ReactElement);
}

const OWNER_CONTEXT = {
  userId: 'u-owner',
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

const BARBER_CONTEXT = {
  userId: 'u-barber',
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: 'emp-1',
  employeeName: 'Carlos',
};

const CLIENT_CONTEXT = {
  userId: 'u-client',
  role: 'CLIENT' as const,
  barbershopId: null,
  barbershopName: null,
  employeeId: null,
  employeeName: null,
};

function makeServiceActions(
  overrides: Partial<EmployeeServiceActionViewModel>[] = [],
): EmployeeServiceActionViewModel[] {
  const base: EmployeeServiceActionViewModel[] = [
    {
      id: 'svc-1',
      name: 'Classic Cut',
      actionLabel: 'Remove',
      actionTestID: 'employee-unassign-emp-1-svc-1',
      onAction: vi.fn(),
    },
    {
      id: 'svc-2',
      name: 'Beard Trim',
      actionLabel: 'Assign',
      actionTestID: 'employee-assign-emp-1-svc-2',
      onAction: vi.fn(),
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function makeEmployeeRows(
  overrides: Partial<EmployeeRowViewModel>[] = [],
): EmployeeRowViewModel[] {
  const base: EmployeeRowViewModel[] = [
    {
      id: 'emp-1',
      name: 'Carlos',
      email: 'carlos@example.com',
      role: 'BARBER',
      isActive: true,
      primaryActionLabel: 'Deactivate',
      primaryActionTestID: 'employee-deactivate-emp-1',
      onPrimaryAction: vi.fn(),
      manageServicesLabel: 'Manage Services',
      manageServicesTestID: 'employee-manage-services-emp-1',
      onManageServices: vi.fn(),
      assignmentsExpanded: true,
      isAssignmentsLoading: false,
      assignedServices: [makeServiceActions()[0]!],
      availableServices: [makeServiceActions()[1]!],
    },
    {
      id: 'emp-2',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'BARBER',
      isActive: false,
      primaryActionLabel: 'Reactivate',
      primaryActionTestID: 'employee-reactivate-emp-2',
      onPrimaryAction: vi.fn(),
      manageServicesLabel: 'Manage Services',
      manageServicesTestID: 'employee-manage-services-emp-2',
      onManageServices: vi.fn(),
      assignmentsExpanded: false,
      isAssignmentsLoading: false,
      assignedServices: [],
      availableServices: [],
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function renderView(overrides: Partial<Parameters<typeof EmployeesScreenView>[0]> = {}) {
  return EmployeesScreenView({
    context: OWNER_CONTEXT,
    isContextLoading: false,
    contextError: null,
    isOwner: true,
    isEmployeesLoading: false,
    employeesError: null,
    showAddForm: false,
    newUserId: '',
    createError: null,
    isCreating: false,
    employeeRows: makeEmployeeRows(),
    onRefresh: vi.fn(),
    onBack: vi.fn(),
    onShowAddForm: vi.fn(),
    onCancelAddForm: vi.fn(),
    onNewUserIdChange: vi.fn(),
    onSubmitAddForm: vi.fn(),
    ...overrides,
  });
}

describe('EmployeesScreenView', () => {
  it('renders the loading state', () => {
    const tree = renderView({ context: null, isContextLoading: true, employeeRows: [] });
    expect(findByTestId(tree, 'employees-loading')).toBeDefined();
    expect(findByText(tree, 'Loading your context…')).toBeDefined();
  });

  it('renders the context error state', () => {
    const tree = renderView({ context: null, contextError: 'Context failed', employeeRows: [] });
    expect(findByTestId(tree, 'employees-context-error')).toBeDefined();
    expect(findByText(tree, 'Context failed')).toBeDefined();
  });

  it('renders the no-context state', () => {
    const tree = renderView({ context: null, employeeRows: [] });
    expect(findByTestId(tree, 'employees-no-context')).toBeDefined();
    expect(findByText(tree, 'No context available yet.')).toBeDefined();
  });

  it('renders the barber blocked state', () => {
    const tree = renderView({ context: BARBER_CONTEXT, isOwner: false, employeeRows: [] });
    expect(findByTestId(tree, 'employees-blocked')).toBeDefined();
    expect(findByText(tree, 'Only barbershop owners can manage the employee roster.')).toBeDefined();
  });

  it('renders the client blocked state', () => {
    const tree = renderView({ context: CLIENT_CONTEXT, isOwner: false, employeeRows: [] });
    expect(findByTestId(tree, 'employees-blocked')).toBeDefined();
    expect(findByText(tree, 'Only barbershop owners can manage the employee roster.')).toBeDefined();
  });

  it('renders the add employee button and back action', () => {
    const onShowAddForm = vi.fn();
    const onBack = vi.fn();
    const tree = renderView({ onShowAddForm, onBack });

    press(findByTestId(tree, 'employees-add-button'));
    expect(onShowAddForm).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employees-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the add employee form, input, and callbacks', () => {
    const onNewUserIdChange = vi.fn();
    const onSubmitAddForm = vi.fn();
    const onCancelAddForm = vi.fn();
    const tree = renderView({
      showAddForm: true,
      newUserId: 'barber@example.com',
      createError: 'Email or User ID is required.',
      onNewUserIdChange,
      onSubmitAddForm,
      onCancelAddForm,
    });

    expect(findByTestId(tree, 'employees-add-form')).toBeDefined();
    expect(findByTestId(tree, 'employees-add-error')).toBeDefined();
    expect(findByText(tree, 'Email or User ID is required.')).toBeDefined();

    const input = findByDisplayName(findByTestId(tree, 'employees-add-userid'), 'TextInput');
    expect((input as { props: { value: string } }).props.value).toBe('barber@example.com');
    changeText(input, 'new@example.com');
    expect(onNewUserIdChange).toHaveBeenCalledWith('new@example.com');

    press(findByTestId(tree, 'employees-add-submit'));
    expect(onSubmitAddForm).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employees-add-cancel'));
    expect(onCancelAddForm).toHaveBeenCalledTimes(1);
  });

  it('disables the add form buttons while creating', () => {
    const onSubmitAddForm = vi.fn();
    const onCancelAddForm = vi.fn();
    const tree = renderView({
      showAddForm: true,
      isCreating: true,
      onSubmitAddForm,
      onCancelAddForm,
    });

    pressButton(tree, 'employees-add-submit');
    pressButton(tree, 'employees-add-cancel');
    expect(onSubmitAddForm).not.toHaveBeenCalled();
    expect(onCancelAddForm).not.toHaveBeenCalled();
  });

  it('renders employee rows with active and inactive statuses', () => {
    const tree = renderView();
    const activeEmployee = findByTestId(tree, 'employee-emp-1');
    const inactiveEmployee = findByTestId(tree, 'employee-emp-2');

    expect(findByText(activeEmployee, 'Carlos')).toBeDefined();
    expect(findByText(activeEmployee, 'carlos@example.com')).toBeDefined();
    expect(findByText(activeEmployee, 'Active')).toBeDefined();
    expect(findByText(activeEmployee, 'BARBER')).toBeDefined();

    expect(findByText(inactiveEmployee, 'Ana')).toBeDefined();
    expect(findByText(inactiveEmployee, 'Inactive')).toBeDefined();
  });

  it('renders employee loading, error, and empty states', () => {
    const loadingTree = renderView({ isEmployeesLoading: true, employeeRows: [] });
    expect(findByText(loadingTree, 'Loading employees…')).toBeDefined();

    const errorTree = renderView({ employeesError: 'Employees failed', employeeRows: [] });
    expect(findByTestId(errorTree, 'employees-error')).toBeDefined();
    expect(findByText(errorTree, 'Employees failed')).toBeDefined();

    const emptyTree = renderView({ employeeRows: [] });
    expect(findByTestId(emptyTree, 'employees-empty')).toBeDefined();
    expect(findByText(emptyTree, 'No employees found.')).toBeDefined();
  });

  it('calls activation, reactivation, and manage services callbacks', () => {
    const onDeactivate = vi.fn();
    const onReactivate = vi.fn();
    const onManageServices = vi.fn();
    const tree = renderView({
      employeeRows: makeEmployeeRows([
        { onPrimaryAction: onDeactivate, onManageServices: onManageServices },
        { onPrimaryAction: onReactivate },
      ]),
    });

    press(findByTestId(tree, 'employee-deactivate-emp-1'));
    expect(onDeactivate).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employee-reactivate-emp-2'));
    expect(onReactivate).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employee-manage-services-emp-1'));
    expect(onManageServices).toHaveBeenCalledTimes(1);
  });

  it('renders expanded assignments and calls assign/unassign callbacks', () => {
    const onUnassign = vi.fn();
    const onAssign = vi.fn();
    const tree = renderView({
      employeeRows: makeEmployeeRows([
        {
          assignedServices: [makeServiceActions([{ onAction: onUnassign }])[0]!],
          availableServices: [makeServiceActions([{}, { onAction: onAssign }])[1]!],
        },
      ]),
    });

    const assignments = findByTestId(tree, 'employee-assignments-emp-1');
    expect(assignments).toBeDefined();
    expect(findByText(assignments, 'Assigned Services')).toBeDefined();
    expect(findByText(assignments, 'Available Services')).toBeDefined();
    expect(findByText(assignments, 'Classic Cut')).toBeDefined();
    expect(findByText(assignments, 'Beard Trim')).toBeDefined();

    press(findByTestId(tree, 'employee-unassign-emp-1-svc-1'));
    expect(onUnassign).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employee-assign-emp-1-svc-2'));
    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it('renders assignment loading and empty assignment states', () => {
    const loadingTree = renderView({
      employeeRows: makeEmployeeRows([{ isAssignmentsLoading: true }]),
    });
    expect(findByText(loadingTree, 'Loading assignments…')).toBeDefined();

    const emptyTree = renderView({
      employeeRows: makeEmployeeRows([
        {
          assignedServices: [],
          availableServices: [],
        },
      ]),
    });
    const assignments = findByTestId(emptyTree, 'employee-assignments-emp-1');
    expect(findByText(assignments, 'No services assigned.')).toBeDefined();
    expect(findByText(assignments, 'All active services are assigned.')).toBeDefined();
  });

  it('hides assignment details when services are collapsed', () => {
    const tree = renderView({
      employeeRows: makeEmployeeRows([{ assignmentsExpanded: false }]),
    });
    expect(queryByTestId(tree, 'employee-assignments-emp-1')).toBeNull();
  });
});
