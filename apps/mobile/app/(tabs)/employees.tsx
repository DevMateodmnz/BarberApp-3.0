import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  EmployeesScreenView,
  type EmployeeInvitationRowViewModel,
  type EmployeeRowViewModel,
  type EmployeeServiceActionViewModel,
} from '@/components/EmployeesScreenView.js';
import { formatLocalizedDate } from '@/i18n/index.js';
import {
  getAcceptedEmployeeInvitations,
  getExpiredEmployeeInvitations,
  getFailedEmployeeInvitations,
  getPendingEmployeeInvitations,
  getRevokedEmployeeInvitations,
  isEmployeeInvitationRevokeAllowed,
  isEmployeeInvitationResendAllowed,
  mapEmployeeInvitationApiError,
  validateEmployeeInvitationEmail,
  type EmployeeInvitationErrorKey,
  type EmployeeInvitationValidationKey,
} from '@/lib/employeeInvitationDomain.js';
import { useContextStore } from '@/lib/store.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import { useServicesStore } from '@/lib/servicesStore.js';
import { useFlashStore } from '@/lib/flashStore.js';
import type { EmployeeListItem } from '@/lib/types.js';

function getEmployeeInvitationValidationMessage(
  key: EmployeeInvitationValidationKey,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (key) {
    case 'emailRequired':
      return t('employees.validation.emailRequired');
    case 'emailInvalid':
      return t('employees.validation.emailInvalid');
    case 'emailTooLong':
      return t('employees.validation.emailTooLong');
    default:
      return t('errors.unknownApi');
  }
}

function getEmployeeInvitationErrorMessage(
  key: EmployeeInvitationErrorKey,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (key) {
    case 'authenticationRequired':
      return t('employees.errors.authenticationRequired');
    case 'barbershopAccessDenied':
      return t('employees.errors.barbershopAccessDenied');
    case 'employeeAlreadyActive':
      return t('employees.errors.employeeAlreadyActive');
    case 'userRoleNotEligible':
      return t('employees.errors.userRoleNotEligible');
    case 'invitationNotFound':
      return t('employees.errors.invitationNotFound');
    case 'invitationAlreadyAccepted':
      return t('employees.errors.invitationAlreadyAccepted');
    case 'invitationRevoked':
      return t('employees.errors.invitationRevoked');
    case 'invitationExpired':
      return t('employees.errors.invitationExpired');
    case 'invitationDeliveryFailed':
      return t('employees.errors.invitationDeliveryFailed');
    case 'invitationRateLimited':
      return t('employees.errors.invitationRateLimited');
    case 'ambiguousInvitation':
      return t('employees.errors.ambiguousInvitation');
    case 'onboardingInvitationRequired':
      return t('employees.errors.onboardingInvitationRequired');
    case 'invalidInvitationFields':
      return t('employees.errors.invalidInvitationFields');
    case 'networkError':
      return t('employees.errors.networkError');
    case 'unknownServerError':
    default:
      return t('employees.errors.unknownServerError');
  }
}

function formatInvitationDateLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return (
    formatLocalizedDate(value, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...options,
    })
    ?? value
  );
}

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
    employeeInvitations,
    employeeInvitationsStatus,
    employeeInvitationsError,
    employeeInvitationMutationStatus,
    loadEmployees,
    loadEmployeeInvitations,
    createEmployeeInvitation,
    resendEmployeeInvitation,
    revokeEmployeeInvitation,
    assignedServices,
    isAssignmentsLoading,
    selectedEmployeeIdForAssignments,
    loadAssignments,
    assignService,
    unassignService,
    clearAssignments,
    clearEmployeeInvitations,
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

  const isOwner = context?.role === 'OWNER' && !!context.barbershopId;

  useEffect(() => {
    if (!getTokenRef.current) {
      return;
    }

    if (!isOwner || !context?.barbershopId) {
      clearEmployeeInvitations();
      return;
    }

    void loadEmployeeInvitations(getTokenRef.current, context.barbershopId);
  }, [
    clearEmployeeInvitations,
    context?.barbershopId,
    isOwner,
    loadEmployeeInvitations,
  ]);

  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState('');
  const [invitationEmailErrorKey, setInvitationEmailErrorKey] =
    useState<EmployeeInvitationValidationKey | null>(null);
  const [invitationFormError, setInvitationFormError] = useState<string | null>(null);
  const [invitationActionError, setInvitationActionError] = useState<string | null>(null);
  const [highlightedInvitationId, setHighlightedInvitationId] = useState<string | null>(null);
  const [activeInvitationAction, setActiveInvitationAction] = useState<{
    id: string;
    type: 'resend' | 'revoke';
  } | null>(null);

  const invitationEmailError = invitationEmailErrorKey
    ? getEmployeeInvitationValidationMessage(invitationEmailErrorKey, t)
    : null;

  const resetInvitationForm = useCallback(() => {
    setInvitationEmail('');
    setInvitationEmailErrorKey(null);
    setInvitationFormError(null);
    setShowInvitationForm(false);
  }, []);

  useEffect(() => {
    setInvitationActionError(null);
    setHighlightedInvitationId(null);
    setActiveInvitationAction(null);
    resetInvitationForm();
  }, [context?.barbershopId, context?.role, resetInvitationForm]);

  const validateInvitationField = useCallback((value: string): boolean => {
    const validation = validateEmployeeInvitationEmail(value);
    if (!validation.ok) {
      setInvitationEmailErrorKey(validation.fieldErrors.email ?? null);
      return false;
    }

    setInvitationEmailErrorKey(null);
    return true;
  }, []);

  const handleInvitationEmailChange = useCallback((value: string) => {
    setInvitationEmail(value);
    setInvitationFormError(null);

    if (invitationEmailErrorKey !== null) {
      validateInvitationField(value);
    }
  }, [invitationEmailErrorKey, validateInvitationField]);

  const handleCreateInvitation = useCallback(async () => {
    setInvitationFormError(null);
    setInvitationActionError(null);

    if (employeeInvitationMutationStatus !== 'idle') {
      return;
    }

    if (!validateInvitationField(invitationEmail)) {
      return;
    }

    if (!context?.barbershopId) {
      setInvitationFormError(t('employees.missingBarbershop'));
      return;
    }

    try {
      const outcome = await createEmployeeInvitation(
        getTokenRef.current,
        context.barbershopId,
        invitationEmail,
      );

      switch (outcome.outcome) {
        case 'employee_created':
          useFlashStore.getState().setMessage(t('employees.feedback.employeeCreated'));
          setHighlightedInvitationId(null);
          break;
        case 'employee_reactivated':
          useFlashStore.getState().setMessage(t('employees.feedback.employeeReactivated'));
          setHighlightedInvitationId(null);
          break;
        case 'invitation_created':
          useFlashStore.getState().setMessage(t('employees.feedback.invitationCreated'));
          setHighlightedInvitationId(outcome.invitation.id);
          break;
        case 'invitation_pending':
          useFlashStore.getState().setMessage(t('employees.feedback.invitationPending'));
          setHighlightedInvitationId(outcome.invitation.id);
          break;
        default:
          break;
      }

      resetInvitationForm();
      await loadEmployeeInvitations(getTokenRef.current, context.barbershopId);
    } catch (error) {
      setInvitationFormError(
        getEmployeeInvitationErrorMessage(mapEmployeeInvitationApiError(error), t),
      );
    }
  }, [
    context?.barbershopId,
    createEmployeeInvitation,
    employeeInvitationMutationStatus,
    invitationEmail,
    loadEmployeeInvitations,
    resetInvitationForm,
    t,
    validateInvitationField,
  ]);

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

    if (!isOwner) {
      void loadEmployees(getTokenRef.current, context.barbershopId);
      return;
    }

    void Promise.all([
      loadEmployees(getTokenRef.current, context.barbershopId),
      loadEmployeeInvitations(getTokenRef.current, context.barbershopId),
    ]);
  }, [context?.barbershopId, isOwner, loadEmployeeInvitations, loadEmployees]);

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
            useEmployeesStore.getState().deactivateEmployee(getTokenRef.current, context.barbershopId!, employee.id)
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

    useEmployeesStore.getState().reactivateEmployee(getTokenRef.current, context.barbershopId, employee.id)
      .then(() => {
        useFlashStore.getState().setMessage(t('employees.reactivateSuccess'));
      })
      .catch((err: unknown) => {
        useFlashStore.getState().setMessage(
          err instanceof Error ? err.message : t('errors.unknownApi'),
        );
      });
  }

  const invitationRows = useMemo<EmployeeInvitationRowViewModel[]>(() => {
    const visibleIds = new Set<string>();
    for (const selector of [
      getPendingEmployeeInvitations,
      getFailedEmployeeInvitations,
      getExpiredEmployeeInvitations,
      getRevokedEmployeeInvitations,
      getAcceptedEmployeeInvitations,
    ]) {
      for (const invitation of selector(employeeInvitations)) {
        visibleIds.add(invitation.id);
      }
    }

    return employeeInvitations
      .filter((invitation) => visibleIds.has(invitation.id))
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAtLabel: invitation.expiresAt
          ? t('employees.invitationSection.expiresAt', {
              value: formatInvitationDateLabel(invitation.expiresAt),
            })
          : null,
        lastSentAtLabel: invitation.lastSentAt
          ? t('employees.invitationSection.lastSentAt', {
              value: formatInvitationDateLabel(invitation.lastSentAt, {
                hour: 'numeric',
                minute: '2-digit',
              }),
            })
          : null,
        resendCountLabel: invitation.resendCount > 0
          ? t('employees.invitationSection.resendCount', {
              count: invitation.resendCount,
            })
          : null,
        canResend: isEmployeeInvitationResendAllowed(invitation),
        canRevoke: isEmployeeInvitationRevokeAllowed(invitation),
        isResending:
          activeInvitationAction?.id === invitation.id
          && activeInvitationAction.type === 'resend',
        isRevoking:
          activeInvitationAction?.id === invitation.id
          && activeInvitationAction.type === 'revoke',
        isHighlighted: highlightedInvitationId === invitation.id,
        resendActionLabel: t('employees.invitationSection.resendAction'),
        resendLoadingLabel: t('employees.invitationSection.resending'),
        resendAccessibilityLabel: t('employees.accessibility.resendInvitation', {
          email: invitation.email,
        }),
        revokeActionLabel: t('employees.invitationSection.revokeAction'),
        revokeLoadingLabel: t('employees.invitationSection.revoking'),
        revokeAccessibilityLabel: t('employees.accessibility.revokeInvitation', {
          email: invitation.email,
        }),
        onResend: () => {
          if (!context?.barbershopId || activeInvitationAction || employeeInvitationMutationStatus !== 'idle') {
            return;
          }

          setInvitationActionError(null);
          setActiveInvitationAction({ id: invitation.id, type: 'resend' });

          void resendEmployeeInvitation(getTokenRef.current, context.barbershopId, invitation.id)
            .then(async () => {
              setHighlightedInvitationId(invitation.id);
              useFlashStore.getState().setMessage(t('employees.feedback.invitationResent'));
              await loadEmployeeInvitations(getTokenRef.current, context.barbershopId);
            })
            .catch((error: unknown) => {
              setInvitationActionError(
                getEmployeeInvitationErrorMessage(mapEmployeeInvitationApiError(error), t),
              );
            })
            .finally(() => {
              setActiveInvitationAction(null);
            });
        },
        onRevoke: () => {
          if (!context?.barbershopId || activeInvitationAction || employeeInvitationMutationStatus !== 'idle') {
            return;
          }

          Alert.alert(
            t('employees.invitationSection.revokeConfirmTitle'),
            t('employees.invitationSection.revokeConfirmMessage', { email: invitation.email }),
            [
              { text: t('common.actions.cancel'), style: 'cancel' },
              {
                text: t('employees.invitationSection.revokeAction'),
                style: 'destructive',
                onPress: () => {
                  setInvitationActionError(null);
                  setActiveInvitationAction({ id: invitation.id, type: 'revoke' });

                  void revokeEmployeeInvitation(getTokenRef.current, context.barbershopId!, invitation.id)
                    .then(async () => {
                      setHighlightedInvitationId(invitation.id);
                      useFlashStore.getState().setMessage(t('employees.feedback.invitationRevoked'));
                      await loadEmployeeInvitations(getTokenRef.current, context.barbershopId!);
                    })
                    .catch((error: unknown) => {
                      setInvitationActionError(
                        getEmployeeInvitationErrorMessage(mapEmployeeInvitationApiError(error), t),
                      );
                    })
                    .finally(() => {
                      setActiveInvitationAction(null);
                    });
                },
              },
            ],
          );
        },
      }));
  }, [
    activeInvitationAction,
    context?.barbershopId,
    employeeInvitationMutationStatus,
    employeeInvitations,
    highlightedInvitationId,
    loadEmployeeInvitations,
    resendEmployeeInvitation,
    revokeEmployeeInvitation,
    t,
  ]);

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

  return (
    <EmployeesScreenView
      context={context}
      isContextLoading={isContextLoading}
      contextError={contextError}
      isOwner={isOwner}
      isRefreshing={isEmployeesLoading || employeeInvitationsStatus === 'loading'}
      isEmployeesLoading={isEmployeesLoading}
      employeesError={employeesError}
      showInvitationForm={showInvitationForm}
      invitationEmail={invitationEmail}
      invitationEmailError={invitationEmailError}
      invitationFormError={invitationFormError}
      isSubmittingInvitation={employeeInvitationMutationStatus === 'creating'}
      invitationRows={invitationRows}
      invitationListStatus={employeeInvitationsStatus}
      invitationListError={
        employeeInvitationsError
          ? getEmployeeInvitationErrorMessage(employeeInvitationsError, t)
          : null
      }
      invitationActionError={invitationActionError}
      employeeRows={employeeRows}
      onRefresh={handleRefresh}
      onBack={handleBack}
      onShowInvitationForm={() => setShowInvitationForm(true)}
      onCancelInvitationForm={resetInvitationForm}
      onInvitationEmailChange={handleInvitationEmailChange}
      onSubmitInvitationForm={() => void handleCreateInvitation()}
      onRetryInvitationList={() => {
        if (!context?.barbershopId) {
          return;
        }
        setInvitationActionError(null);
        void loadEmployeeInvitations(getTokenRef.current, context.barbershopId);
      }}
    />
  );
}
