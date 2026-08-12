import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  RoleBadge,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import { formatLocalizedDate } from '@/i18n/index.js';
import type { Appointment, AppointmentChange, CurrentUserContext } from '@/lib/types.js';
import { formatBusinessDateLabel, getTodayDateString } from '@/lib/format.js';
import { tokens } from '@/theme/index.js';

export interface RescheduleSelectorOption {
  id: string;
  label: string;
  detail?: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}

export interface RescheduleSlotOption {
  id: string;
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}

export interface RescheduleSummaryItem {
  label: string;
  value: string;
}

export interface AppointmentRescheduleScreenViewProps {
  context: CurrentUserContext | null;
  appointment: Appointment | null;
  isLoading: boolean;
  employeesStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  servicesStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  availabilityStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  employeesError: string | null;
  servicesError: string | null;
  availabilityError: string | null;
  employeeOptions: RescheduleSelectorOption[];
  serviceOptions: RescheduleSelectorOption[];
  slotOptions: RescheduleSlotOption[];
  selectedDate: string;
  reason: string;
  changes: AppointmentChange[];
  submissionError: string | null;
  isSubmitting: boolean;
  beforeSummary: RescheduleSummaryItem[];
  afterSummary: RescheduleSummaryItem[] | null;
  onBack: () => void;
  onSelectPreviousDate: () => void;
  onSelectToday: () => void;
  onSelectNextDate: () => void;
  onReasonChange: (value: string) => void;
  onRetryEmployees: () => void;
  onRetryServices: () => void;
  onRetryAvailability: () => void;
  onSubmit: () => void;
}

function SelectorCard({
  option,
}: {
  option: RescheduleSelectorOption;
}) {
  return (
    <Pressable
      testID={option.testID}
      accessibilityRole="button"
      accessibilityState={{ selected: option.selected }}
      onPress={option.onPress}
      style={({ pressed }) => [pressed && styles.selectorPressed]}
    >
      <AppCard variant="outlined" style={[styles.selectorCard, option.selected && styles.selectorCardSelected]}>
        <Text style={[styles.selectorTitle, option.selected && styles.selectorTitleSelected]}>
          {option.label}
        </Text>
        {option.detail ? <Text style={styles.selectorSubtitle}>{option.detail}</Text> : null}
      </AppCard>
    </Pressable>
  );
}

function SummaryRow({ label, value }: RescheduleSummaryItem) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ChangeHistoryRow({ change }: { change: AppointmentChange }) {
  const { t } = useTranslation();
  const previousDate = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(change.previousStartAt));
  const nextDate = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(change.newStartAt));
  const changedAt = formatLocalizedDate(change.createdAt.slice(0, 10), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) ?? change.createdAt;

  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyTitle}>{t('appointmentReschedule.historyItemTitle')}</Text>
      <Text style={styles.historyBody}>
        {previousDate} → {nextDate}
      </Text>
      <Text style={styles.historyMeta}>
        {change.changedByDisplayName} · {changedAt}
      </Text>
      {(change.previousEmployeeName !== change.newEmployeeName || change.previousServiceName !== change.newServiceName) ? (
        <Text style={styles.historyMeta}>
          {change.previousEmployeeName} / {change.previousServiceName} → {change.newEmployeeName} / {change.newServiceName}
        </Text>
      ) : null}
      {change.reason ? <Text style={styles.historyReason}>{change.reason}</Text> : null}
    </View>
  );
}

export function AppointmentRescheduleScreenView({
  context,
  appointment,
  isLoading,
  employeesStatus,
  servicesStatus,
  availabilityStatus,
  employeesError,
  servicesError,
  availabilityError,
  employeeOptions,
  serviceOptions,
  slotOptions,
  selectedDate,
  reason,
  changes,
  submissionError,
  isSubmitting,
  beforeSummary,
  afterSummary,
  onBack,
  onSelectPreviousDate,
  onSelectToday,
  onSelectNextDate,
  onReasonChange,
  onRetryEmployees,
  onRetryServices,
  onRetryAvailability,
  onSubmit,
}: AppointmentRescheduleScreenViewProps) {
  const { t } = useTranslation();

  if (isLoading && !appointment) {
    return (
      <Screen>
        <ScreenHeader
          title={t('appointmentReschedule.title')}
          subtitle={t('appointmentReschedule.subtitle')}
          onBack={onBack}
        />
        <AppCard style={styles.centeredCard} testID="appointment-reschedule-loading">
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('appointments.loading')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!appointment) {
    return (
      <Screen>
        <ScreenHeader
          title={t('appointmentReschedule.title')}
          subtitle={t('appointmentReschedule.subtitle')}
          onBack={onBack}
        />
        <AppCard>
          <EmptyState
            testID="appointment-reschedule-missing"
            title={t('appointmentReschedule.missingTitle')}
            message={t('appointmentReschedule.missingMessage')}
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen scrollable keyboardAware testID="appointment-reschedule-screen">
      <ScreenHeader
        title={t('appointmentReschedule.title')}
        subtitle={t('appointmentReschedule.subtitle')}
        onBack={onBack}
        rightAction={context ? <RoleBadge role={context.role} /> : undefined}
      />

      <AppCard testID="appointment-reschedule-current">
        <FormSection
          title={t('appointmentReschedule.currentSection')}
          helper={t('appointmentReschedule.currentHelper')}
        >
          <Text style={styles.currentClient}>{appointment.clientName}</Text>
          {beforeSummary.map((item) => <SummaryRow key={item.label} {...item} />)}
        </FormSection>
      </AppCard>

      <AppCard testID="appointment-reschedule-date">
        <FormSection
          title={t('appointmentCreation.sections.date')}
          helper={t('appointmentReschedule.dateHelper')}
        >
          <Text style={styles.dateDisplay}>{formatBusinessDateLabel(selectedDate)}</Text>
          <View style={styles.dateActions}>
            <AppButton
              testID="appointment-reschedule-date-prev"
              title={t('common.actions.previous')}
              variant="secondary"
              size="sm"
              onPress={onSelectPreviousDate}
            />
            <AppButton
              testID="appointment-reschedule-date-today"
              title={t('common.actions.today')}
              variant={selectedDate === getTodayDateString() ? 'secondary' : 'primary'}
              size="sm"
              onPress={onSelectToday}
              disabled={selectedDate === getTodayDateString()}
            />
            <AppButton
              testID="appointment-reschedule-date-next"
              title={t('common.actions.next')}
              variant="secondary"
              size="sm"
              onPress={onSelectNextDate}
            />
          </View>
        </FormSection>
      </AppCard>

      <AppCard testID="appointment-reschedule-employee">
        <FormSection
          title={t('appointmentCreation.sections.employee')}
          helper={t('appointmentReschedule.employeeHelper')}
        >
          {employeesStatus === 'loading' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.helperText}>{t('appointmentCreation.states.loadingEmployees')}</Text>
            </View>
          ) : null}
          {employeesStatus === 'error' ? (
            <View style={styles.stateStack}>
              <Text style={styles.errorText}>{employeesError ?? t('errors.unknownApi')}</Text>
              <AppButton title={t('common.actions.retry')} variant="secondary" onPress={onRetryEmployees} />
            </View>
          ) : null}
          <View style={styles.selectionList}>
            {employeeOptions.map((option) => <SelectorCard key={option.id} option={option} />)}
          </View>
        </FormSection>
      </AppCard>

      <AppCard testID="appointment-reschedule-service">
        <FormSection
          title={t('appointmentCreation.sections.service')}
          helper={t('appointmentReschedule.serviceHelper')}
        >
          {servicesStatus === 'loading' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.helperText}>{t('appointmentCreation.states.loadingServices')}</Text>
            </View>
          ) : null}
          {servicesStatus === 'error' ? (
            <View style={styles.stateStack}>
              <Text style={styles.errorText}>{servicesError ?? t('errors.unknownApi')}</Text>
              <AppButton title={t('common.actions.retry')} variant="secondary" onPress={onRetryServices} />
            </View>
          ) : null}
          <View style={styles.selectionList}>
            {serviceOptions.map((option) => <SelectorCard key={option.id} option={option} />)}
          </View>
        </FormSection>
      </AppCard>

      <AppCard testID="appointment-reschedule-slots">
        <FormSection
          title={t('appointmentCreation.sections.time')}
          helper={t('appointmentReschedule.timeHelper')}
        >
          {availabilityStatus === 'loading' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.helperText}>{t('appointmentCreation.states.loadingAvailability')}</Text>
            </View>
          ) : null}
          {availabilityStatus === 'error' ? (
            <View style={styles.stateStack}>
              <Text style={styles.errorText}>{availabilityError ?? t('errors.unknownApi')}</Text>
              <AppButton title={t('common.actions.retry')} variant="secondary" onPress={onRetryAvailability} />
            </View>
          ) : null}
          {availabilityStatus === 'empty' ? (
            <EmptyState
              testID="appointment-reschedule-slots-empty"
              title={t('appointmentCreation.states.availabilityEmptyTitle')}
              message={t('appointmentCreation.states.availabilityEmptyMessage')}
            />
          ) : null}
          <View style={styles.slotWrap}>
            {slotOptions.map((slot) => (
              <AppButton
                key={slot.id}
                testID={slot.testID}
                title={slot.label}
                variant={slot.selected ? 'primary' : 'secondary'}
                size="sm"
                onPress={slot.onPress}
              />
            ))}
          </View>
        </FormSection>
      </AppCard>

      <AppCard testID="appointment-reschedule-reason">
        <FormSection
          title={t('appointmentReschedule.reasonSection')}
          helper={t('appointmentReschedule.reasonHelper')}
        >
          <AppTextInput
            testID="appointment-reschedule-reason-input"
            label={t('appointmentReschedule.reasonLabel')}
            value={reason}
            onChangeText={onReasonChange}
            multiline
            textAlignVertical="top"
            inputStyle={styles.notesInput}
          />
        </FormSection>
      </AppCard>

      {afterSummary ? (
        <AppCard testID="appointment-reschedule-summary">
          <FormSection
            title={t('appointmentReschedule.confirmSection')}
            helper={t('appointmentReschedule.confirmHelper')}
          >
            <Text style={styles.summaryHeading}>{t('appointmentReschedule.previousSchedule')}</Text>
            {beforeSummary.map((item) => <SummaryRow key={`before-${item.label}`} {...item} />)}
            <Text style={styles.summaryHeading}>{t('appointmentReschedule.newSchedule')}</Text>
            {afterSummary.map((item) => <SummaryRow key={`after-${item.label}`} {...item} />)}

            {submissionError ? (
              <Text style={styles.errorText} testID="appointment-reschedule-submit-error">
                {submissionError}
              </Text>
            ) : null}

            <AppButton
              testID="appointment-reschedule-submit"
              title={t('appointmentReschedule.submit')}
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={onSubmit}
            />
          </FormSection>
        </AppCard>
      ) : null}

      {changes.length > 0 ? (
        <AppCard testID="appointment-reschedule-history">
          <FormSection
            title={t('appointmentReschedule.historySection')}
            helper={t('appointmentReschedule.historyHelper')}
          >
            <View style={styles.historyStack}>
              {changes.map((change) => <ChangeHistoryRow key={change.id} change={change} />)}
            </View>
          </FormSection>
        </AppCard>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredCard: {
    alignItems: 'center',
    gap: tokens.spacing[3],
    marginTop: tokens.spacing[6],
  },
  helperText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  currentClient: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  dateDisplay: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  dateActions: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[3],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  stateStack: {
    gap: tokens.spacing[2],
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
  },
  selectionList: {
    gap: tokens.spacing[2],
  },
  selectorCard: {
    gap: tokens.spacing[1],
  },
  selectorCardSelected: {
    borderColor: tokens.colors.primary,
  },
  selectorPressed: {
    opacity: 0.92,
  },
  selectorTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  selectorTitleSelected: {
    color: tokens.colors.primary,
  },
  selectorSubtitle: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  slotWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  notesInput: {
    minHeight: 120,
  },
  summaryHeading: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: tokens.spacing[2],
  },
  summaryRow: {
    gap: tokens.spacing[1],
  },
  summaryLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  summaryValue: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  historyStack: {
    gap: tokens.spacing[3],
  },
  historyRow: {
    gap: tokens.spacing[1],
  },
  historyTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  historyBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  historyMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
  },
  historyReason: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
});
