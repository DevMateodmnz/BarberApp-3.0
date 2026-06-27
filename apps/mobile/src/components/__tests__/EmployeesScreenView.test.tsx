import { describe, expect, it, vi } from 'vitest';

import {
  EmployeesScreenView,
  type EmployeeInvitationRowViewModel,
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

function makeInvitationRows(
  overrides: Partial<EmployeeInvitationRowViewModel>[] = [],
): EmployeeInvitationRowViewModel[] {
  const base: EmployeeInvitationRowViewModel[] = [
    {
      id: 'inv-1',
      email: 'barber@example.com',
      status: 'PENDING',
      expiresAtLabel: 'Expires: Jul 1, 2026',
      lastSentAtLabel: 'Last sent: Jun 27, 2026, 9:00 AM',
      resendCountLabel: '2 resends',
      canResend: true,
      canRevoke: true,
      isResending: false,
      isRevoking: false,
      isHighlighted: true,
      resendActionLabel: 'Resend',
      resendLoadingLabel: 'Resending…',
      resendAccessibilityLabel: 'Resend invitation for barber@example.com',
      revokeActionLabel: 'Revoke',
      revokeLoadingLabel: 'Revoking…',
      revokeAccessibilityLabel: 'Revoke invitation for barber@example.com',
      onResend: vi.fn(),
      onRevoke: vi.fn(),
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
    isRefreshing: false,
    isEmployeesLoading: false,
    employeesError: null,
    showInvitationForm: false,
    invitationEmail: '',
    invitationEmailError: null,
    invitationFormError: null,
    isSubmittingInvitation: false,
    invitationRows: [],
    invitationListStatus: 'empty',
    invitationListError: null,
    invitationActionError: null,
    employeeRows: makeEmployeeRows(),
    onRefresh: vi.fn(),
    onBack: vi.fn(),
    onShowInvitationForm: vi.fn(),
    onCancelInvitationForm: vi.fn(),
    onInvitationEmailChange: vi.fn(),
    onSubmitInvitationForm: vi.fn(),
    onRetryInvitationList: vi.fn(),
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
    expect(findByText(tree, 'Only owners can manage the employee roster.')).toBeDefined();
    expect(queryByTestId(tree, 'employees-invite-button')).toBeNull();
  });

  it('renders the client blocked state', () => {
    const tree = renderView({ context: CLIENT_CONTEXT, isOwner: false, employeeRows: [] });
    expect(findByTestId(tree, 'employees-blocked')).toBeDefined();
    expect(findByText(tree, 'Only owners can manage the employee roster.')).toBeDefined();
    expect(queryByTestId(tree, 'employees-invite-button')).toBeNull();
  });

  it('renders the invite barber button and back action', () => {
    const onShowInvitationForm = vi.fn();
    const onBack = vi.fn();
    const tree = renderView({ onShowInvitationForm, onBack });

    press(findByTestId(tree, 'employees-invite-button'));
    expect(onShowInvitationForm).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employees-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the invite form, email keyboard, validation, and callbacks', () => {
    const onInvitationEmailChange = vi.fn();
    const onSubmitInvitationForm = vi.fn();
    const onCancelInvitationForm = vi.fn();
    const tree = renderView({
      showInvitationForm: true,
      invitationEmail: 'barber@example.com',
      invitationEmailError: 'Enter a valid email address.',
      invitationFormError: 'This account cannot be invited as a barber in this MVP.',
      onInvitationEmailChange,
      onSubmitInvitationForm,
      onCancelInvitationForm,
    });

    expect(findByTestId(tree, 'employees-invite-form')).toBeDefined();
    expect(findByTestId(tree, 'employees-invite-error')).toBeDefined();
    expect(findByText(tree, 'Enter a valid email address.')).toBeDefined();
    expect(findByText(tree, 'This account cannot be invited as a barber in this MVP.')).toBeDefined();

    const input = findByDisplayName(findByTestId(tree, 'employees-invite-email'), 'TextInput');
    expect((input as { props: { value: string; keyboardType: string } }).props.value).toBe(
      'barber@example.com',
    );
    expect((input as { props: { keyboardType: string } }).props.keyboardType).toBe('email-address');
    changeText(input, 'new@example.com');
    expect(onInvitationEmailChange).toHaveBeenCalledWith('new@example.com');

    press(findByTestId(tree, 'employees-invite-submit'));
    expect(onSubmitInvitationForm).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employees-invite-cancel'));
    expect(onCancelInvitationForm).toHaveBeenCalledTimes(1);
  });

  it('disables the invitation form buttons while submitting', () => {
    const onSubmitInvitationForm = vi.fn();
    const onCancelInvitationForm = vi.fn();
    const tree = renderView({
      showInvitationForm: true,
      isSubmittingInvitation: true,
      onSubmitInvitationForm,
      onCancelInvitationForm,
    });

    pressButton(tree, 'employees-invite-submit');
    pressButton(tree, 'employees-invite-cancel');
    expect(onSubmitInvitationForm).not.toHaveBeenCalled();
    expect(onCancelInvitationForm).not.toHaveBeenCalled();
  });

  it('renders invitation loading, error, empty, and retry states', () => {
    const loadingTree = renderView({
      employeeRows: [],
      invitationListStatus: 'loading',
    });
    expect(findByTestId(loadingTree, 'employees-invitations-loading')).toBeDefined();
    expect(findByText(loadingTree, 'Loading invitations…')).toBeDefined();

    const onRetryInvitationList = vi.fn();
    const errorTree = renderView({
      employeeRows: [],
      invitationListStatus: 'error',
      invitationListError: 'Network error. Check your connection and try again.',
      onRetryInvitationList,
    });
    expect(findByTestId(errorTree, 'employees-invitations-error')).toBeDefined();
    press(findByTestId(errorTree, 'employees-invitations-retry'));
    expect(onRetryInvitationList).toHaveBeenCalledTimes(1);

    const emptyTree = renderView({ employeeRows: [], invitationListStatus: 'empty' });
    expect(findByTestId(emptyTree, 'employees-invitations-empty')).toBeDefined();
    expect(findByText(emptyTree, 'No pending invitations')).toBeDefined();
  });

  it('renders invitation rows, long emails, row action callbacks, and hides accepted actions', () => {
    const onResend = vi.fn();
    const onRevoke = vi.fn();
    const tree = renderView({
      invitationListStatus: 'success',
      invitationRows: [
        makeInvitationRows([
          {
            email: 'very.long.employee.email.address.for.mobile.layout@example.com',
            onResend,
            onRevoke,
          },
        ])[0]!,
        makeInvitationRows([
          {
            id: 'inv-2',
            email: 'accepted@example.com',
            status: 'ACCEPTED',
            canResend: false,
            canRevoke: false,
            isHighlighted: false,
          },
        ])[0]!,
      ],
    });

    expect(findByText(tree, 'very.long.employee.email.address.for.mobile.layout@example.com')).toBeDefined();
    expect(findByText(tree, 'Pending')).toBeDefined();
    expect(findByText(tree, 'Accepted')).toBeDefined();

    press(findByTestId(tree, 'employee-invitation-resend-inv-1'));
    expect(onResend).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employee-invitation-revoke-inv-1'));
    expect(onRevoke).toHaveBeenCalledTimes(1);

    expect(queryByTestId(tree, 'employee-invitation-resend-inv-2')).toBeNull();
    expect(queryByTestId(tree, 'employee-invitation-revoke-inv-2')).toBeNull();
  });

  it('renders employee rows with active and inactive statuses', () => {
    const tree = renderView();
    const activeEmployee = findByTestId(tree, 'employee-emp-1');
    const inactiveEmployee = findByTestId(tree, 'employee-emp-2');

    expect(findByText(activeEmployee, 'Carlos')).toBeDefined();
    expect(findByText(activeEmployee, 'carlos@example.com')).toBeDefined();
    expect(findByText(activeEmployee, 'Active')).toBeDefined();
    expect(findByText(activeEmployee, 'Barber')).toBeDefined();

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
    expect(findByText(assignments, 'Assigned services')).toBeDefined();
    expect(findByText(assignments, 'Available services')).toBeDefined();
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
