import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  ActionRow,
  AppButton,
  AppCard,
  EmptyState,
  ListItem,
  RoleBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import type { AppointmentStatus, CurrentUserContext } from '@/lib/types.js';
import { formatBusinessDateLabel } from '@/lib/format.js';

export interface EmployeeFilterOption {
  id: string;
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}

export interface AppointmentModeOption {
  id: 'list' | 'agenda';
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}

export interface AppointmentActionViewModel {
  id: string;
  variant: 'secondary' | 'danger';
  label: string;
  testID: string;
  onPress: () => void;
}

export interface AppointmentRowViewModel {
  id: string;
  timeLabel: string;
  status: AppointmentStatus;
  clientLabel: string;
  serviceLabel: string;
  employeeLabel?: string | null;
  notificationLabels?: string[];
  notes?: string | null;
  actions: AppointmentActionViewModel[];
}

export interface AppointmentsScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  isAppointmentsLoading: boolean;
  appointmentsError: string | null;
  isRefreshing: boolean;
  flashMessage: string | null;
  showCreateAction: boolean;
  selectedDate: string;
  isTodaySelected: boolean;
  modeOptions?: AppointmentModeOption[];
  employeeFilters: EmployeeFilterOption[];
  appointmentRows: AppointmentRowViewModel[];
  onCreateAppointment: () => void;
  onRefresh: () => void;
  onPrevDate: () => void;
  onToday: () => void;
  onNextDate: () => void;
}

export function AppointmentsScreenView({
  context,
  isContextLoading,
  isAppointmentsLoading,
  appointmentsError,
  isRefreshing,
  flashMessage,
  showCreateAction,
  selectedDate,
  isTodaySelected,
  modeOptions = [],
  employeeFilters,
  appointmentRows,
  onCreateAppointment,
  onRefresh,
  onPrevDate,
  onToday,
  onNextDate,
}: AppointmentsScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      testID="appointments-refresh"
    />
  );

  const headerSubtitle = context?.role === 'BARBER'
    ? t('appointments.subtitleBarber')
    : t('appointments.subtitleOwner');

  if (context?.role === 'CLIENT') {
    return (
      <Screen>
        <ScreenHeader
          title={t('appointments.title')}
          subtitle={t('appointments.subtitleOwner')}
        />
        <AppCard style={styles.blockedCard}>
          <EmptyState
            testID="appointments-client-blocked"
            title={t('appointments.blockedTitle')}
            message={t('appointments.blockedMessage')}
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen scrollable refreshControl={refreshControl}>
      <ScreenHeader
        title={t('appointments.title')}
        subtitle={headerSubtitle}
        rightAction={context ? <RoleBadge role={context.role} /> : undefined}
      />

      {flashMessage ? (
        <AppCard testID="appointments-flash-message" style={styles.flashBanner}>
          <Text style={styles.flashText}>{flashMessage}</Text>
        </AppCard>
      ) : null}

      {context && (
        <AppCard testID="appointments-context" variant="outlined" style={styles.contextCard}>
          <Text style={styles.contextEyebrow}>{t('common.labels.scheduleScope')}</Text>
          <Text style={styles.contextTitle}>
            {context.barbershopName ?? t('appointments.contextFallbackTitle')}
          </Text>
          <Text style={styles.contextBody}>
            {context.role === 'OWNER'
              ? t('appointments.contextOwnerBody')
              : t('appointments.contextBarberBody')}
          </Text>
          {context.role === 'BARBER' && context.employeeName && (
            <Text style={styles.contextMeta}>
              {t('appointments.contextBarberMeta', { name: context.employeeName })}
            </Text>
          )}
        </AppCard>
      )}

      {isContextLoading && (
        <AppCard style={styles.stateCard}>
          <ActivityIndicator testID="appointments-loading" size="large" color={tokens.colors.primary} />
          <Text style={styles.stateText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      )}

      {context && !isContextLoading && (
        <>
          {showCreateAction ? (
            <AppButton
              testID="appointments-create-button"
              title={t('appointments.newAction')}
              accessibilityLabel={t('appointmentCreation.accessibility.openCreate')}
              onPress={onCreateAppointment}
            />
          ) : null}

          <AppCard testID="appointments-mode-switch" variant="outlined">
            <SectionHeader title={t('appointments.modeTitle')} />
            <View style={styles.filterWrap}>
              {modeOptions.map((option) => (
                <AppButton
                  key={option.id}
                  testID={option.testID}
                  title={option.label}
                  variant={option.selected ? 'primary' : 'ghost'}
                  size="sm"
                  onPress={option.onPress}
                  style={styles.filterButton}
                />
              ))}
            </View>
          </AppCard>

          <AppCard testID="appointments-date-controls" variant="outlined" style={styles.dateCard}>
            <Text style={styles.dateEyebrow}>{t('common.labels.selectedDate')}</Text>
            <Text style={styles.dateDisplay} testID="appointments-date-display">
              {formatBusinessDateLabel(selectedDate)}
            </Text>
            <Text style={styles.dateHint}>
              {isTodaySelected ? t('appointments.selectedDateHintToday') : t('appointments.selectedDateHintBrowse')}
            </Text>
            <View style={styles.dateActions}>
              <AppButton
                testID="appointments-date-prev"
                title={t('common.actions.previous')}
                variant="secondary"
                size="sm"
                onPress={onPrevDate}
                style={styles.dateActionButton}
              />
              <AppButton
                testID="appointments-date-today"
                title={t('common.actions.today')}
                variant={isTodaySelected ? 'secondary' : 'primary'}
                size="sm"
                onPress={onToday}
                disabled={isTodaySelected}
                style={styles.dateActionButton}
              />
              <AppButton
                testID="appointments-date-next"
                title={t('common.actions.next')}
                variant="secondary"
                size="sm"
                onPress={onNextDate}
                style={styles.dateActionButton}
              />
            </View>
          </AppCard>

          {employeeFilters.length > 0 && (
            <AppCard testID="appointments-employee-filter" variant="outlined">
              <SectionHeader title={t('common.labels.barberFilter')} />
              <View style={styles.filterWrap}>
                {employeeFilters.map((filter) => (
                  <AppButton
                    key={filter.id}
                    testID={filter.testID}
                    title={filter.label}
                    variant={filter.selected ? 'primary' : 'ghost'}
                    size="sm"
                    onPress={filter.onPress}
                    style={styles.filterButton}
                  />
                ))}
              </View>
            </AppCard>
          )}

          {isAppointmentsLoading && (
            <AppCard style={styles.stateCard}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.stateText}>{t('appointments.loading')}</Text>
            </AppCard>
          )}

          {appointmentsError && (
            <AppCard style={styles.stateCard}>
              <Text style={styles.errorText} testID="appointments-error">
                {appointmentsError}
              </Text>
              <Text style={styles.stateHint}>{t('appointments.errorHint')}</Text>
            </AppCard>
          )}

          {!isAppointmentsLoading && !appointmentsError && appointmentRows.length === 0 && (
            <AppCard testID="appointments-empty">
              <EmptyState
                title={t('appointments.emptyTitle')}
                message={t('appointments.emptyMessage')}
              />
            </AppCard>
          )}

          {!isAppointmentsLoading && !appointmentsError && appointmentRows.length > 0 && (
            <AppCard testID="appointments-list">
              <SectionHeader
                title={t('appointments.listTitle')}
                action={<Text style={styles.sectionCount}>{appointmentRows.length}</Text>}
              />

              <View style={styles.listContent}>
                {appointmentRows.map((appointment) => (
                  <AppCard
                    key={appointment.id}
                    testID={`appointment-${appointment.id}`}
                    variant="outlined"
                    style={styles.appointmentCard}
                  >
                    <ListItem
                      title={appointment.clientLabel}
                      subtitle={appointment.serviceLabel}
                      leading={(
                        <View style={styles.timeBadge}>
                          <Text style={styles.timeBadgeText}>{appointment.timeLabel}</Text>
                        </View>
                      )}
                      trailing={<StatusBadge status={appointment.status} />}
                    />

                    {(appointment.employeeLabel || appointment.notificationLabels?.length || appointment.notes) && (
                      <View style={styles.metaBlock}>
                        {appointment.employeeLabel && (
                          <Text style={styles.metaText}>{appointment.employeeLabel}</Text>
                        )}
                        {appointment.notificationLabels?.map((label) => (
                          <Text key={label} style={styles.metaText}>
                            {label}
                          </Text>
                        ))}
                        {appointment.notes && (
                          <Text style={styles.notesText}>{appointment.notes}</Text>
                        )}
                      </View>
                    )}

                    {appointment.actions.length > 0 && (
                      <ActionRow
                        testID={`appointment-actions-${appointment.id}`}
                        label={t('common.labels.availableActions')}
                        style={styles.actionRow}
                      >
                        {appointment.actions.map((action) => (
                          <AppButton
                            key={action.id}
                            testID={action.testID}
                            title={action.label}
                            variant={action.variant}
                            size="sm"
                            onPress={action.onPress}
                          />
                        ))}
                      </ActionRow>
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
  blockedCard: {
    marginTop: tokens.spacing[6],
  },
  flashBanner: {
    marginBottom: tokens.spacing[4],
  },
  flashText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
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
  contextMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
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
  stateHint: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[2],
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  dateCard: {
    marginBottom: tokens.spacing[4],
  },
  dateEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  dateDisplay: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
    marginTop: tokens.spacing[2],
  },
  dateHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: tokens.spacing[1],
  },
  dateActions: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[4],
  },
  dateActionButton: {
    flex: 1,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  filterButton: {
    maxWidth: '100%',
  },
  sectionCount: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  listContent: {
    gap: tokens.spacing[3],
  },
  appointmentCard: {
    padding: tokens.spacing[3],
  },
  timeBadge: {
    minWidth: 68,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBadgeText: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
  },
  metaBlock: {
    marginTop: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[3],
    gap: tokens.spacing[1],
  },
  metaText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  notesText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textMuted,
  },
  actionRow: {
    marginTop: tokens.spacing[3],
  },
});
