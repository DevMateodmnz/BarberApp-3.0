import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  ActionRow,
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  RoleBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import { formatBusinessDateLabel } from '@/lib/format.js';
import type {
  CurrentUserContext,
  EmployeeScheduleConflictSummary,
  EmployeeScheduleDetail,
  EmployeeScheduleMode,
} from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

export interface EmployeeScheduleDayRowViewModel {
  dayOfWeek: number;
  dayName: string;
  isActive: boolean;
  start: string;
  end: string;
  error: string | null;
  onToggle: () => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

export interface EmployeeScheduleScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  contextError: string | null;
  schedule: EmployeeScheduleDetail | null;
  isScheduleLoading: boolean;
  scheduleError: string | null;
  isOwner: boolean;
  isReadOnly: boolean;
  mode: EmployeeScheduleMode;
  dayRows: EmployeeScheduleDayRowViewModel[];
  saveError: string | null;
  saving: boolean;
  exceptionDate: string;
  exceptionType: 'FULL_DAY_OFF' | 'CUSTOM_HOURS';
  exceptionStart: string;
  exceptionEnd: string;
  exceptionReason: string;
  exceptionError: string | null;
  exceptionSaving: boolean;
  deletingExceptionDate: string | null;
  conflictMessage: string | null;
  onRefresh: () => void;
  onBack: () => void;
  onModeChange: (mode: EmployeeScheduleMode) => void;
  onCopyFromBarbershop: () => void;
  onSave: () => void;
  onExceptionDateChange: (value: string) => void;
  onExceptionTypeChange: (value: 'FULL_DAY_OFF' | 'CUSTOM_HOURS') => void;
  onExceptionStartChange: (value: string) => void;
  onExceptionEndChange: (value: string) => void;
  onExceptionReasonChange: (value: string) => void;
  onSaveException: () => void;
  onDeleteException: (localDate: string) => void;
}

function getConflictLabel(
  conflict: EmployeeScheduleConflictSummary,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (conflict.reasonCode) {
    case 'EMPLOYEE_TIME_OFF':
      return t('employeeSchedules.conflicts.timeOff');
    case 'BARBERSHOP_CLOSED':
      return t('employeeSchedules.conflicts.barbershopClosed');
    case 'OUTSIDE_CUSTOM_HOURS':
      return t('employeeSchedules.conflicts.outsideCustomHours');
    case 'EMPLOYEE_NOT_WORKING':
    default:
      return t('employeeSchedules.conflicts.notWorking');
  }
}

export function EmployeeScheduleScreenView({
  context,
  isContextLoading,
  contextError,
  schedule,
  isScheduleLoading,
  scheduleError,
  isOwner: _isOwner,
  isReadOnly,
  mode,
  dayRows,
  saveError,
  saving,
  exceptionDate,
  exceptionType,
  exceptionStart,
  exceptionEnd,
  exceptionReason,
  exceptionError,
  exceptionSaving,
  deletingExceptionDate,
  conflictMessage,
  onRefresh,
  onBack,
  onModeChange,
  onCopyFromBarbershop,
  onSave,
  onExceptionDateChange,
  onExceptionTypeChange,
  onExceptionStartChange,
  onExceptionEndChange,
  onExceptionReasonChange,
  onSaveException,
  onDeleteException,
}: EmployeeScheduleScreenViewProps) {
  const { t } = useTranslation();

  const refreshControl = (
    <RefreshControl refreshing={isScheduleLoading} onRefresh={onRefresh} />
  );

  const header = (
    <ScreenHeader
      title={t('employeeSchedules.title')}
      subtitle={schedule?.employee.displayName ?? t('employeeSchedules.subtitle')}
      rightAction={context ? <RoleBadge role={context.role} /> : undefined}
    />
  );

  if (isContextLoading && !context) {
    return (
      <Screen>
        {header}
        <AppCard style={styles.stateCard}>
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
        <AppCard style={styles.stateCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen scrollable keyboardAware refreshControl={refreshControl}>
      {header}

      {schedule ? (
        <AppCard variant="outlined" style={styles.contextCard}>
          <Text style={styles.contextEyebrow}>{t('employeeSchedules.scope')}</Text>
          <Text style={styles.contextTitle}>{schedule.employee.displayName}</Text>
          <Text style={styles.contextBody}>{context?.barbershopName ?? t('common.states.unknown')}</Text>
          <Text style={styles.contextBody}>{schedule.timezone}</Text>
        </AppCard>
      ) : null}

      {isScheduleLoading && !schedule ? (
        <AppCard style={styles.stateCard} testID="employee-schedule-loading">
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.stateText}>{t('employeeSchedules.loading')}</Text>
        </AppCard>
      ) : null}

      {scheduleError ? (
        <AppCard style={styles.stateCard}>
          <Text style={styles.errorText} testID="employee-schedule-error">{scheduleError}</Text>
        </AppCard>
      ) : null}

      {schedule ? (
        <>
          {isReadOnly ? (
            <AppCard variant="outlined">
              <Text style={styles.readOnlyTitle}>{t('employeeSchedules.readOnlyTitle')}</Text>
              <Text style={styles.readOnlyBody}>{t('employeeSchedules.readOnlyBody')}</Text>
            </AppCard>
          ) : null}

          <AppCard>
            <SectionHeader title={t('employeeSchedules.modeTitle')} />
            <ActionRow label={t('employeeSchedules.modeLabel')} style={styles.modeRow}>
              <AppButton
                testID="employee-schedule-mode-inherit"
                title={t('employeeSchedules.modeInherit')}
                variant={mode === 'INHERIT_BARBERSHOP' ? 'primary' : 'ghost'}
                size="sm"
                onPress={() => onModeChange('INHERIT_BARBERSHOP')}
                disabled={isReadOnly}
              />
              <AppButton
                testID="employee-schedule-mode-custom"
                title={t('employeeSchedules.modeCustom')}
                variant={mode === 'CUSTOM' ? 'primary' : 'ghost'}
                size="sm"
                onPress={() => onModeChange('CUSTOM')}
                disabled={isReadOnly}
              />
            </ActionRow>
            <Text style={styles.helperText}>
              {mode === 'INHERIT_BARBERSHOP'
                ? t('employeeSchedules.modeInheritHelper')
                : t('employeeSchedules.modeCustomHelper')}
            </Text>
          </AppCard>

          {mode === 'CUSTOM' ? (
            <AppCard>
              <SectionHeader title={t('employeeSchedules.weeklyTitle')} />
              <FormSection helper={t('employeeSchedules.weeklyHelper')}>
                <View style={styles.daysList}>
                  {dayRows.map((day) => (
                    <AppCard key={day.dayOfWeek} variant="outlined" style={styles.dayCard}>
                      <View style={styles.dayHeader}>
                        <Text style={styles.dayName}>{day.dayName}</Text>
                        <StatusBadge status={day.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </View>
                      <ActionRow label={t('employeeSchedules.dayStatusLabel')} style={styles.dayActionRow}>
                        <AppButton
                          testID={`employee-schedule-toggle-${day.dayOfWeek}`}
                          title={day.isActive ? t('common.states.open') : t('common.states.closed')}
                          variant={day.isActive ? 'secondary' : 'ghost'}
                          size="sm"
                          onPress={day.onToggle}
                          disabled={isReadOnly}
                        />
                      </ActionRow>
                      {day.isActive ? (
                        <View style={styles.timeFields}>
                          <AppTextInput
                            testID={`employee-schedule-start-${day.dayOfWeek}`}
                            label={t('employeeSchedules.startLabel')}
                            value={day.start}
                            onChangeText={day.onStartChange}
                            placeholder="HH:mm"
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            autoCorrect={false}
                            editable={!isReadOnly}
                            style={styles.timeInput}
                          />
                          <AppTextInput
                            testID={`employee-schedule-end-${day.dayOfWeek}`}
                            label={t('employeeSchedules.endLabel')}
                            value={day.end}
                            onChangeText={day.onEndChange}
                            placeholder="HH:mm"
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            autoCorrect={false}
                            editable={!isReadOnly}
                            style={styles.timeInput}
                          />
                        </View>
                      ) : (
                        <Text style={styles.closedHint}>{t('employeeSchedules.closedHint')}</Text>
                      )}
                      {day.error ? <Text style={styles.fieldError}>{day.error}</Text> : null}
                    </AppCard>
                  ))}
                </View>
              </FormSection>
              {!isReadOnly ? (
                <AppButton
                  testID="employee-schedule-copy-barbershop"
                  title={t('employeeSchedules.copyFromBarbershop')}
                  variant="secondary"
                  onPress={onCopyFromBarbershop}
                />
              ) : null}
            </AppCard>
          ) : null}

          {saveError ? (
            <AppCard>
              <Text style={styles.errorText}>{saveError}</Text>
            </AppCard>
          ) : null}

          {!isReadOnly ? (
            <AppButton
              testID="employee-schedule-save"
              title={t('employeeSchedules.save')}
              onPress={onSave}
              loading={saving}
              loadingText={t('employeeSchedules.saving')}
              disabled={saving}
            />
          ) : null}

          <AppCard>
            <SectionHeader title={t('employeeSchedules.previewTitle')} />
            <View style={styles.previewList}>
              {schedule.effectivePreview.map((day) => (
                <AppCard key={day.localDate} variant="outlined" style={styles.previewCard}>
                  <Text style={styles.previewDate}>{formatBusinessDateLabel(day.localDate)}</Text>
                  <Text style={styles.previewBody}>
                    {day.intervals.length > 0
                      ? day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(' · ')
                      : t('employeeSchedules.notWorkingLabel')}
                  </Text>
                </AppCard>
              ))}
            </View>
          </AppCard>

          <AppCard>
            <SectionHeader title={t('employeeSchedules.exceptionsTitle')} />
            {schedule.upcomingExceptions.length === 0 ? (
              <EmptyState
                testID="employee-schedule-exceptions-empty"
                title={t('employeeSchedules.exceptionsEmptyTitle')}
                message={t('employeeSchedules.exceptionsEmptyMessage')}
              />
            ) : (
              <View style={styles.exceptionList}>
                {schedule.upcomingExceptions.map((exception) => (
                  <AppCard
                    key={exception.localDate}
                    variant="outlined"
                    style={styles.exceptionCard}
                    testID={`employee-schedule-exception-${exception.localDate}`}
                  >
                    <Text style={styles.previewDate}>{formatBusinessDateLabel(exception.localDate)}</Text>
                    <Text style={styles.previewBody}>
                      {exception.type === 'FULL_DAY_OFF'
                        ? t('employeeSchedules.fullDayOffLabel')
                        : exception.intervals.map((interval) => `${interval.start}–${interval.end}`).join(' · ')}
                    </Text>
                    {exception.reason ? <Text style={styles.helperText}>{exception.reason}</Text> : null}
                    {!isReadOnly ? (
                      <AppButton
                        testID={`employee-schedule-delete-exception-${exception.localDate}`}
                        title={t('employeeSchedules.deleteException')}
                        variant="ghost"
                        size="sm"
                        onPress={() => onDeleteException(exception.localDate)}
                        loading={deletingExceptionDate === exception.localDate}
                        disabled={deletingExceptionDate === exception.localDate}
                      />
                    ) : null}
                  </AppCard>
                ))}
              </View>
            )}
          </AppCard>

          {!isReadOnly ? (
            <AppCard>
              <SectionHeader title={t('employeeSchedules.newExceptionTitle')} />
              <FormSection helper={t('employeeSchedules.newExceptionHelper')}>
                <AppTextInput
                  testID="employee-schedule-exception-date"
                  label={t('employeeSchedules.dateLabel')}
                  value={exceptionDate}
                  onChangeText={onExceptionDateChange}
                  placeholder="YYYY-MM-DD"
                  autoCorrect={false}
                />
                <ActionRow label={t('employeeSchedules.exceptionTypeLabel')} style={styles.modeRow}>
                  <AppButton
                    testID="employee-schedule-exception-full-day"
                    title={t('employeeSchedules.fullDayOffLabel')}
                    variant={exceptionType === 'FULL_DAY_OFF' ? 'primary' : 'ghost'}
                    size="sm"
                    onPress={() => onExceptionTypeChange('FULL_DAY_OFF')}
                  />
                  <AppButton
                    testID="employee-schedule-exception-custom-hours"
                    title={t('employeeSchedules.specialHoursLabel')}
                    variant={exceptionType === 'CUSTOM_HOURS' ? 'primary' : 'ghost'}
                    size="sm"
                    onPress={() => onExceptionTypeChange('CUSTOM_HOURS')}
                  />
                </ActionRow>
                {exceptionType === 'CUSTOM_HOURS' ? (
                  <View style={styles.timeFields}>
                    <AppTextInput
                      testID="employee-schedule-exception-start"
                      label={t('employeeSchedules.startLabel')}
                      value={exceptionStart}
                      onChangeText={onExceptionStartChange}
                      placeholder="HH:mm"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      autoCorrect={false}
                      style={styles.timeInput}
                    />
                    <AppTextInput
                      testID="employee-schedule-exception-end"
                      label={t('employeeSchedules.endLabel')}
                      value={exceptionEnd}
                      onChangeText={onExceptionEndChange}
                      placeholder="HH:mm"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      autoCorrect={false}
                      style={styles.timeInput}
                    />
                  </View>
                ) : null}
                <AppTextInput
                  testID="employee-schedule-exception-reason"
                  label={t('employeeSchedules.reasonLabel')}
                  value={exceptionReason}
                  onChangeText={onExceptionReasonChange}
                  placeholder={t('employeeSchedules.reasonPlaceholder')}
                  autoCorrect={false}
                />
                <Text style={styles.helperText}>{t('employeeSchedules.existingAppointmentsWarning')}</Text>
                {exceptionError ? <Text style={styles.errorText}>{exceptionError}</Text> : null}
                <AppButton
                  testID="employee-schedule-save-exception"
                  title={t('employeeSchedules.saveException')}
                  onPress={onSaveException}
                  loading={exceptionSaving}
                  loadingText={t('employeeSchedules.saving')}
                  disabled={exceptionSaving}
                />
              </FormSection>
            </AppCard>
          ) : null}

          <AppCard>
            <SectionHeader title={t('employeeSchedules.conflictsTitle')} />
            {conflictMessage ? <Text style={styles.warningText}>{conflictMessage}</Text> : null}
            {schedule.conflictingFutureAppointments.length === 0 ? (
              <EmptyState
                testID="employee-schedule-conflicts-empty"
                title={t('employeeSchedules.conflictsEmptyTitle')}
                message={t('employeeSchedules.conflictsEmptyMessage')}
              />
            ) : (
              <View style={styles.exceptionList}>
                {schedule.conflictingFutureAppointments.map((conflict) => (
                  <AppCard key={conflict.appointmentId} variant="outlined" style={styles.exceptionCard}>
                    <Text style={styles.previewDate}>{formatBusinessDateLabel(conflict.startAt)}</Text>
                    <Text style={styles.previewBody}>{conflict.customerDisplayName} • {conflict.serviceName}</Text>
                    <Text style={styles.helperText}>{getConflictLabel(conflict, t)}</Text>
                  </AppCard>
                ))}
              </View>
            )}
          </AppCard>
        </>
      ) : null}

      <AppButton
        testID="employee-schedule-back"
        title={t('common.actions.backToHome')}
        variant="ghost"
        onPress={onBack}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateCard: {
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  stateText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  warningText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.warning,
  },
  contextCard: {
    gap: tokens.spacing[2],
  },
  contextEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
  },
  contextTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  contextBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  readOnlyTitle: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
  },
  readOnlyBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  modeRow: {
    marginTop: tokens.spacing[2],
    gap: tokens.spacing[2],
  },
  helperText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
  },
  daysList: {
    gap: tokens.spacing[3],
  },
  dayCard: {
    padding: tokens.spacing[3],
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  dayName: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
    flex: 1,
  },
  dayActionRow: {
    marginTop: tokens.spacing[3],
  },
  timeFields: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
    marginTop: tokens.spacing[3],
  },
  timeInput: {
    flex: 1,
  },
  closedHint: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[3],
    fontStyle: 'italic',
  },
  fieldError: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.error,
    marginTop: tokens.spacing[2],
  },
  previewList: {
    gap: tokens.spacing[3],
  },
  previewCard: {
    padding: tokens.spacing[3],
  },
  previewDate: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  previewBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
  },
  exceptionList: {
    gap: tokens.spacing[3],
  },
  exceptionCard: {
    padding: tokens.spacing[3],
  },
});
