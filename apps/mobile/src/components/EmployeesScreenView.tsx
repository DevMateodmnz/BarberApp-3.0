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
import type { EmployeeInvitationLoadStatus } from '@/lib/employeeInvitationDomain.js';
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

export interface EmployeeInvitationRowViewModel {
  id: string;
  email: string;
  status: string;
  expiresAtLabel: string | null;
  lastSentAtLabel: string | null;
  resendCountLabel: string | null;
  canResend: boolean;
  canRevoke: boolean;
  isResending: boolean;
  isRevoking: boolean;
  isHighlighted: boolean;
  resendActionLabel: string;
  resendLoadingLabel: string;
  resendAccessibilityLabel: string;
  revokeActionLabel: string;
  revokeLoadingLabel: string;
  revokeAccessibilityLabel: string;
  onResend: () => void;
  onRevoke: () => void;
}

export interface EmployeesScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  contextError: string | null;
  isOwner: boolean;
  isRefreshing: boolean;
  isEmployeesLoading: boolean;
  employeesError: string | null;
  showInvitationForm: boolean;
  invitationEmail: string;
  invitationEmailError: string | null;
  invitationFormError: string | null;
  isSubmittingInvitation: boolean;
  invitationRows: EmployeeInvitationRowViewModel[];
  invitationListStatus: EmployeeInvitationLoadStatus;
  invitationListError: string | null;
  invitationActionError: string | null;
  employeeRows: EmployeeRowViewModel[];
  onRefresh: () => void;
  onBack: () => void;
  onShowInvitationForm: () => void;
  onCancelInvitationForm: () => void;
  onInvitationEmailChange: (value: string) => void;
  onSubmitInvitationForm: () => void;
  onRetryInvitationList: () => void;
}

function renderInvitationListState(
  status: EmployeeInvitationLoadStatus,
  rows: EmployeeInvitationRowViewModel[],
  listError: string | null,
  actionError: string | null,
  onRetry: () => void,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (status === 'loading') {
    return (
      <View style={styles.invitationStateContent} testID="employees-invitations-loading">
        <ActivityIndicator size="small" color={tokens.colors.primary} />
        <Text style={styles.stateText}>{t('employees.invitationSection.loading')}</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.invitationStateContent} testID="employees-invitations-error">
        <Text style={styles.errorText}>{listError ?? t('errors.unknownApi')}</Text>
        <AppButton
          testID="employees-invitations-retry"
          title={t('employees.invitationSection.retry')}
          variant="secondary"
          onPress={onRetry}
        />
      </View>
    );
  }

  if ((status === 'empty' || (status === 'success' && rows.length === 0))) {
    return (
      <EmptyState
        testID="employees-invitations-empty"
        title={t('employees.invitationSection.emptyTitle')}
        message={t('employees.invitationSection.emptyMessage')}
      />
    );
  }

  return (
    <View style={styles.invitationListContent}>
      {actionError && (
        <Text style={styles.errorText} testID="employees-invitations-action-error">
          {actionError}
        </Text>
      )}

      {rows.map((invitation) => (
        <AppCard
          key={invitation.id}
          testID={`employee-invitation-${invitation.id}`}
          variant="outlined"
          style={[
            styles.invitationCard,
            invitation.isHighlighted && styles.invitationCardHighlighted,
          ]}
        >
          <ListItem
            title={invitation.email}
            subtitle={invitation.lastSentAtLabel ?? invitation.expiresAtLabel ?? undefined}
            trailing={<StatusBadge status={invitation.status} />}
          />

          <View style={styles.invitationMetaList}>
            {invitation.expiresAtLabel && (
              <Text style={styles.invitationMetaText}>{invitation.expiresAtLabel}</Text>
            )}
            {invitation.lastSentAtLabel && (
              <Text style={styles.invitationMetaText}>{invitation.lastSentAtLabel}</Text>
            )}
            {invitation.resendCountLabel && (
              <Text style={styles.invitationMetaText}>{invitation.resendCountLabel}</Text>
            )}
          </View>

          {(invitation.canResend || invitation.canRevoke) && (
            <ActionRow
              label={t('employees.invitationSection.actionsLabel')}
              style={styles.actionsRow}
            >
              {invitation.canResend && (
                <AppButton
                  testID={`employee-invitation-resend-${invitation.id}`}
                  title={invitation.resendActionLabel}
                  loading={invitation.isResending}
                  loadingText={invitation.resendLoadingLabel}
                  accessibilityLabel={invitation.resendAccessibilityLabel}
                  accessibilityState={{
                    busy: invitation.isResending,
                    disabled: invitation.isResending || invitation.isRevoking,
                  }}
                  variant="secondary"
                  size="sm"
                  onPress={invitation.onResend}
                  disabled={invitation.isResending || invitation.isRevoking}
                />
              )}

              {invitation.canRevoke && (
                <AppButton
                  testID={`employee-invitation-revoke-${invitation.id}`}
                  title={invitation.revokeActionLabel}
                  loading={invitation.isRevoking}
                  loadingText={invitation.revokeLoadingLabel}
                  accessibilityLabel={invitation.revokeAccessibilityLabel}
                  accessibilityState={{
                    busy: invitation.isRevoking,
                    disabled: invitation.isRevoking || invitation.isResending,
                  }}
                  variant="ghost"
                  size="sm"
                  onPress={invitation.onRevoke}
                  disabled={invitation.isRevoking || invitation.isResending}
                />
              )}
            </ActionRow>
          )}
        </AppCard>
      ))}
    </View>
  );
}

export function EmployeesScreenView({
  context,
  isContextLoading,
  contextError,
  isOwner,
  isRefreshing,
  isEmployeesLoading,
  employeesError,
  showInvitationForm,
  invitationEmail,
  invitationEmailError,
  invitationFormError,
  isSubmittingInvitation,
  invitationRows,
  invitationListStatus,
  invitationListError,
  invitationActionError,
  employeeRows,
  onRefresh,
  onBack,
  onShowInvitationForm,
  onCancelInvitationForm,
  onInvitationEmailChange,
  onSubmitInvitationForm,
  onRetryInvitationList,
}: EmployeesScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
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
          {!showInvitationForm ? (
            <AppButton
              testID="employees-invite-button"
              title={t('employees.inviteAction')}
              accessibilityLabel={t('employees.accessibility.openInvitationForm')}
              onPress={onShowInvitationForm}
            />
          ) : (
            <AppCard testID="employees-invite-form">
              <FormSection
                title={t('employees.inviteForm.title')}
                helper={t('employees.inviteForm.helper')}
              >
                <AppTextInput
                  testID="employees-invite-email"
                  label={t('employees.inviteForm.emailLabel')}
                  value={invitationEmail}
                  onChangeText={onInvitationEmailChange}
                  placeholder={t('employees.inviteForm.emailPlaceholder')}
                  error={invitationEmailError ?? undefined}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  inputMode="email"
                />

                {invitationFormError && (
                  <Text style={styles.errorText} testID="employees-invite-error">
                    {invitationFormError}
                  </Text>
                )}

                <AppButton
                  testID="employees-invite-submit"
                  title={t('employees.inviteForm.submit')}
                  loading={isSubmittingInvitation}
                  loadingText={t('employees.inviteForm.submitting')}
                  accessibilityLabel={t('employees.accessibility.submitInvitation')}
                  accessibilityState={{
                    busy: isSubmittingInvitation,
                    disabled: isSubmittingInvitation,
                  }}
                  onPress={onSubmitInvitationForm}
                  disabled={isSubmittingInvitation}
                />
                <AppButton
                  testID="employees-invite-cancel"
                  title={t('common.actions.cancel')}
                  variant="ghost"
                  accessibilityLabel={t('employees.accessibility.cancelInvitation')}
                  onPress={onCancelInvitationForm}
                  disabled={isSubmittingInvitation}
                />
              </FormSection>
            </AppCard>
          )}

          <AppCard testID="employees-invitations-section">
            <SectionHeader
              title={t('employees.invitationSection.title')}
              action={(
                invitationRows.length > 0
                  ? <Text style={styles.sectionCount}>{invitationRows.length}</Text>
                  : undefined
              )}
            />
            <Text style={styles.sectionHelper}>
              {t('employees.invitationSection.helper')}
            </Text>
            {renderInvitationListState(
              invitationListStatus,
              invitationRows,
              invitationListError,
              invitationActionError,
              onRetryInvitationList,
              t,
            )}
          </AppCard>

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
  sectionHelper: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing[3],
  },
  invitationStateContent: {
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  invitationListContent: {
    gap: tokens.spacing[3],
  },
  invitationCard: {
    padding: tokens.spacing[3],
  },
  invitationCardHighlighted: {
    borderColor: tokens.colors.primary,
  },
  invitationMetaList: {
    marginTop: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[3],
    gap: tokens.spacing[1],
  },
  invitationMetaText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    flexShrink: 1,
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
