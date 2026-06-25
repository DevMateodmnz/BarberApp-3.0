import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  ActionRow,
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  ListItem,
  RoleBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import { getRoleLabel } from '@/i18n/index.js';
import { tokens } from '@/theme/index.js';
import type { CurrentUserContext } from '@/lib/types.js';

export interface EmployeeServiceActionViewModel {
  id: string;
  name: string;
  actionLabel: string;
  actionTestID: string;
  onAction: () => void;
}

export interface EmployeeRowViewModel {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  primaryActionLabel: string;
  primaryActionTestID: string;
  onPrimaryAction: () => void;
  manageServicesLabel: string;
  manageServicesTestID: string;
  onManageServices: () => void;
  assignmentsExpanded: boolean;
  isAssignmentsLoading: boolean;
  assignedServices: EmployeeServiceActionViewModel[];
  availableServices: EmployeeServiceActionViewModel[];
}

export interface EmployeesScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  contextError: string | null;
  isOwner: boolean;
  isEmployeesLoading: boolean;
  employeesError: string | null;
  showAddForm: boolean;
  newUserId: string;
  createError: string | null;
  isCreating: boolean;
  employeeRows: EmployeeRowViewModel[];
  onRefresh: () => void;
  onBack: () => void;
  onShowAddForm: () => void;
  onCancelAddForm: () => void;
  onNewUserIdChange: (value: string) => void;
  onSubmitAddForm: () => void;
}

export function EmployeesScreenView({
  context,
  isContextLoading,
  contextError,
  isOwner,
  isEmployeesLoading,
  employeesError,
  showAddForm,
  newUserId,
  createError,
  isCreating,
  employeeRows,
  onRefresh,
  onBack,
  onShowAddForm,
  onCancelAddForm,
  onNewUserIdChange,
  onSubmitAddForm,
}: EmployeesScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isEmployeesLoading}
      onRefresh={onRefresh}
      testID="employees-refresh"
    />
  );

  const header = (
    <ScreenHeader
      testID="employees"
      title={t('employees.title')}
      subtitle={t('employees.subtitle')}
      onBack={onBack}
      rightAction={context ? <RoleBadge role={context.role} /> : undefined}
    />
  );

  if (isContextLoading && !context) {
    return (
      <Screen>
        {header}
        <AppCard testID="employees-loading" style={styles.stateCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.stateText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (contextError && !context) {
    return (
      <Screen>
        {header}
        <AppCard testID="employees-context-error" style={styles.stateCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!context) {
    return (
      <Screen>
        {header}
        <AppCard>
          <EmptyState
            testID="employees-no-context"
            title={t('common.states.noContextTitle')}
            message={t('common.states.noContextMessage')}
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen scrollable keyboardAware refreshControl={refreshControl}>
      {header}

      <AppCard testID="employees-context" variant="outlined" style={styles.contextCard}>
        <Text style={styles.contextEyebrow}>{t('employees.contextEyebrow')}</Text>
        <Text style={styles.contextTitle}>{context.barbershopName ?? t('employees.contextFallbackTitle')}</Text>
        <Text style={styles.contextBody}>
          {isOwner ? t('employees.contextOwnerBody') : t('employees.contextBlockedBody')}
        </Text>
      </AppCard>

      {!isOwner && (
        <AppCard>
          <EmptyState
            testID="employees-blocked"
            title={t('employees.blockedTitle')}
            message={t('employees.blockedMessage')}
          />
        </AppCard>
      )}

      {isOwner && (
        <>
          {!showAddForm ? (
            <AppButton
              testID="employees-add-button"
              title={t('employees.addButton')}
              onPress={onShowAddForm}
            />
          ) : (
            <AppCard testID="employees-add-form">
              <FormSection
                title={t('employees.newEmployeeTitle')}
                helper={t('employees.newEmployeeHelper')}
              >
                <AppTextInput
                  testID="employees-add-userid"
                  label={t('employees.identifierLabel')}
                  value={newUserId}
                  onChangeText={onNewUserIdChange}
                  placeholder={t('employees.identifierPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {createError && (
                  <Text style={styles.errorText} testID="employees-add-error">{createError}</Text>
                )}

                <AppButton
                  testID="employees-add-submit"
                  title={t('employees.addButton')}
                  onPress={onSubmitAddForm}
                  loading={isCreating}
                  loadingText={t('common.states.genericLoading')}
                  disabled={isCreating}
                />
                <AppButton
                  testID="employees-add-cancel"
                  title={t('common.actions.cancel')}
                  variant="ghost"
                  onPress={onCancelAddForm}
                  disabled={isCreating}
                />
              </FormSection>
            </AppCard>
          )}

          {isEmployeesLoading && (
            <AppCard style={styles.stateCard}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.stateText}>{t('employees.loading')}</Text>
            </AppCard>
          )}

          {employeesError && (
            <AppCard style={styles.stateCard}>
              <Text style={styles.errorText} testID="employees-error">{employeesError}</Text>
            </AppCard>
          )}

          {!isEmployeesLoading && !employeesError && employeeRows.length === 0 && (
            <AppCard>
              <EmptyState
                testID="employees-empty"
                title={t('employees.emptyTitle')}
                message={t('employees.emptyMessage')}
              />
            </AppCard>
          )}

          {!isEmployeesLoading && !employeesError && employeeRows.length > 0 && (
            <AppCard testID="employees-list">
              <SectionHeader
                title={t('employees.rosterTitle')}
                action={<Text style={styles.sectionCount}>{employeeRows.length}</Text>}
              />

              <View style={styles.listContent}>
                {employeeRows.map((employee) => (
                  <AppCard
                    key={employee.id}
                    testID={`employee-${employee.id}`}
                    variant="outlined"
                    style={styles.employeeCard}
                  >
                    <ListItem
                      title={employee.name}
                      subtitle={employee.email}
                      trailing={<StatusBadge status={employee.isActive ? 'ACTIVE' : 'INACTIVE'} />}
                    />

                    <Text style={styles.roleText}>{getRoleLabel(employee.role)}</Text>

                    <ActionRow label={t('employees.actionsLabel')} style={styles.actionsRow}>
                      <AppButton
                        testID={employee.primaryActionTestID}
                        title={employee.primaryActionLabel}
                        variant={employee.isActive ? 'danger' : 'secondary'}
                        size="sm"
                        onPress={employee.onPrimaryAction}
                      />
                      <AppButton
                        testID={employee.manageServicesTestID}
                        title={employee.manageServicesLabel}
                        variant="ghost"
                        size="sm"
                        onPress={employee.onManageServices}
                      />
                    </ActionRow>

                    {employee.assignmentsExpanded && (
                      <View
                        style={styles.assignmentSection}
                        testID={`employee-assignments-${employee.id}`}
                      >
                        {employee.isAssignmentsLoading ? (
                          <View style={styles.assignmentLoadingRow}>
                            <ActivityIndicator size="small" color={tokens.colors.primary} />
                            <Text style={styles.stateText}>{t('employees.loadingAssignments')}</Text>
                          </View>
                        ) : (
                          <>
                            <AppCard variant="outlined" style={styles.assignmentCard}>
                              <SectionHeader title={t('common.labels.assignedServices')} />
                              {employee.assignedServices.length === 0 ? (
                                <EmptyState
                                  title={t('employees.noAssignedServicesTitle')}
                                  message={t('employees.noAssignedServicesMessage')}
                                />
                              ) : (
                                <View style={styles.assignmentList}>
                                  {employee.assignedServices.map((service) => (
                                    <ListItem
                                      key={service.id}
                                      title={service.name}
                                      trailing={(
                                        <AppButton
                                          testID={service.actionTestID}
                                          title={service.actionLabel}
                                          variant="danger"
                                          size="sm"
                                          onPress={service.onAction}
                                        />
                                      )}
                                    />
                                  ))}
                                </View>
                              )}
                            </AppCard>

                            <AppCard variant="outlined" style={styles.assignmentCard}>
                              <SectionHeader title={t('common.labels.availableServices')} />
                              {employee.availableServices.length === 0 ? (
                                <EmptyState
                                  title={t('employees.allServicesAssignedTitle')}
                                  message={t('employees.allServicesAssignedMessage')}
                                />
                              ) : (
                                <View style={styles.assignmentList}>
                                  {employee.availableServices.map((service) => (
                                    <ListItem
                                      key={service.id}
                                      title={service.name}
                                      trailing={(
                                        <AppButton
                                          testID={service.actionTestID}
                                          title={service.actionLabel}
                                          variant="secondary"
                                          size="sm"
                                          onPress={service.onAction}
                                        />
                                      )}
                                    />
                                  ))}
                                </View>
                              )}
                            </AppCard>
                          </>
                        )}
                      </View>
                    )}
                  </AppCard>
                ))}
              </View>
            </AppCard>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contextCard: {
    marginBottom: tokens.spacing[4],
  },
  contextEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: tokens.spacing[1],
  },
  contextTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  contextBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
  },
  stateCard: {
    alignItems: 'center',
    marginTop: tokens.spacing[4],
  },
  stateText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  sectionCount: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  listContent: {
    gap: tokens.spacing[3],
  },
  employeeCard: {
    padding: tokens.spacing[3],
  },
  roleText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    paddingHorizontal: tokens.spacing[3],
    marginTop: tokens.spacing[2],
  },
  actionsRow: {
    marginTop: tokens.spacing[3],
  },
  assignmentSection: {
    marginTop: tokens.spacing[3],
    gap: tokens.spacing[3],
  },
  assignmentLoadingRow: {
    alignItems: 'center',
  },
  assignmentCard: {
    padding: tokens.spacing[3],
  },
  assignmentList: {
    gap: tokens.spacing[2],
  },
});
