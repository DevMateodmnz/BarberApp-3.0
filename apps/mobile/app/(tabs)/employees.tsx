import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  EmployeesScreenView,
  type EmployeeRowViewModel,
  type EmployeeServiceActionViewModel,
} from '@/components/EmployeesScreenView.js';
import { useContextStore } from '@/lib/store.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import { useServicesStore } from '@/lib/servicesStore.js';
import { useFlashStore } from '@/lib/flashStore.js';
import type { EmployeeListItem } from '@/lib/types.js';

export default function EmployeesScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useTranslation();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    employees,
    isEmployeesLoading,
    employeesError,
    loadEmployees,
    deactivateEmployee,
    reactivateEmployee,
    createEmployee,
    assignedServices,
    isAssignmentsLoading,
    selectedEmployeeIdForAssignments,
    loadAssignments,
    assignService,
    unassignService,
    clearAssignments,
  } = useEmployeesStore();

  const { services: allServices, loadServices } = useServicesStore();

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    void loadEmployees(getTokenRef.current, context.barbershopId);
  }, [context, loadEmployees]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function resetAddForm() {
    setNewUserId('');
    setCreateError(null);
    setShowAddForm(false);
  }

  async function handleCreateEmployee() {
    setCreateError(null);

    const identifier = newUserId.trim();
    if (identifier.length === 0) {
      setCreateError(t('employees.identifierRequired'));
      return;
    }

    if (!context?.barbershopId) {
      setCreateError(t('employees.missingBarbershop'));
      return;
    }

    setIsCreating(true);

    try {
      await createEmployee(getTokenRef.current, context.barbershopId, identifier);
      resetAddForm();
      useFlashStore.getState().setMessage(t('employees.addSuccess'));
    } catch {
      setCreateError(useEmployeesStore.getState().employeesError ?? t('errors.unknownApi'));
    } finally {
      setIsCreating(false);
    }
  }

  function handleToggleAssignments(employeeId: string) {
    if (selectedEmployeeIdForAssignments === employeeId) {
      clearAssignments();
      return;
    }
    if (!context?.barbershopId || !getTokenRef.current) return;
    void loadServices(getTokenRef.current, context.barbershopId);
    void loadAssignments(getTokenRef.current, context.barbershopId, employeeId);
  }

  const unassignedServices = useMemo(
    () =>
      allServices.filter(
        (service) => service.isActive && !assignedServices.some((assigned) => assigned.id === service.id),
      ),
    [allServices, assignedServices],
  );

  const handleRefresh = useCallback(() => {
    if (!getTokenRef.current || !context?.barbershopId) return;
    void loadEmployees(getTokenRef.current, context.barbershopId);
  }, [context?.barbershopId, loadEmployees]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  function handleDeactivate(employee: EmployeeListItem) {
    if (!context?.barbershopId) return;

    Alert.alert(
      t('employees.deactivateConfirmTitle'),
      t('employees.deactivateConfirmMessage', { name: employee.user.name ?? employee.user.email }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.deactivate'),
          style: 'destructive',
          onPress: () => {
            deactivateEmployee(getTokenRef.current, context.barbershopId!, employee.id)
              .then(() => {
                useFlashStore.getState().setMessage(t('employees.deactivateSuccess'));
              })
              .catch((err: unknown) => {
                useFlashStore.getState().setMessage(
                  err instanceof Error ? err.message : t('errors.unknownApi'),
                );
              });
          },
        },
      ],
    );
  }

  function handleReactivate(employee: EmployeeListItem) {
    if (!context?.barbershopId) return;

    reactivateEmployee(getTokenRef.current, context.barbershopId, employee.id)
      .then(() => {
        useFlashStore.getState().setMessage(t('employees.reactivateSuccess'));
      })
      .catch((err: unknown) => {
        useFlashStore.getState().setMessage(
          err instanceof Error ? err.message : t('errors.unknownApi'),
        );
      });
  }

  const employeeRows = useMemo<EmployeeRowViewModel[]>(() => {
    return employees.map((employee) => {
      const isExpanded = selectedEmployeeIdForAssignments === employee.id;

      const assignedServiceRows: EmployeeServiceActionViewModel[] = isExpanded
        ? assignedServices.map((service) => ({
            id: service.id,
            name: service.name,
            actionLabel: t('common.actions.remove'),
            actionTestID: `employee-unassign-${employee.id}-${service.id}`,
            onAction: () => {
              if (!context?.barbershopId) return;
              void unassignService(getTokenRef.current, context.barbershopId, employee.id, service.id);
            },
          }))
        : [];

      const availableServiceRows: EmployeeServiceActionViewModel[] = isExpanded
        ? unassignedServices.map((service) => ({
            id: service.id,
            name: service.name,
            actionLabel: t('common.actions.assign'),
            actionTestID: `employee-assign-${employee.id}-${service.id}`,
            onAction: () => {
              if (!context?.barbershopId) return;
              void assignService(getTokenRef.current, context.barbershopId, employee.id, service.id);
            },
          }))
        : [];

      return {
        id: employee.id,
        name: employee.user.name ?? employee.user.email,
        email: employee.user.email,
        role: employee.user.role,
        isActive: employee.isActive,
        primaryActionLabel: employee.isActive ? t('common.actions.deactivate') : t('common.actions.reactivate'),
        primaryActionTestID: employee.isActive
          ? `employee-deactivate-${employee.id}`
          : `employee-reactivate-${employee.id}`,
        onPrimaryAction: () => {
          if (employee.isActive) {
            handleDeactivate(employee);
            return;
          }
          handleReactivate(employee);
        },
        manageServicesLabel: isExpanded ? t('common.actions.hideServices') : t('common.actions.manageServices'),
        manageServicesTestID: `employee-manage-services-${employee.id}`,
        onManageServices: () => handleToggleAssignments(employee.id),
        assignmentsExpanded: isExpanded,
        isAssignmentsLoading: isExpanded && isAssignmentsLoading,
        assignedServices: assignedServiceRows,
        availableServices: availableServiceRows,
      };
    });
  }, [
    assignedServices,
    assignService,
    context?.barbershopId,
    employees,
    isAssignmentsLoading,
    selectedEmployeeIdForAssignments,
    t,
    unassignedServices,
    unassignService,
  ]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const isOwner = context?.role === 'OWNER' && !!context.barbershopId;

  return (
    <EmployeesScreenView
      context={context}
      isContextLoading={isContextLoading}
      contextError={contextError}
      isOwner={isOwner}
      isEmployeesLoading={isEmployeesLoading}
      employeesError={employeesError}
      showAddForm={showAddForm}
      newUserId={newUserId}
      createError={createError}
      isCreating={isCreating}
      employeeRows={employeeRows}
      onRefresh={handleRefresh}
      onBack={handleBack}
      onShowAddForm={() => setShowAddForm(true)}
      onCancelAddForm={resetAddForm}
      onNewUserIdChange={setNewUserId}
      onSubmitAddForm={() => void handleCreateEmployee()}
    />
  );
}
