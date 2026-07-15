import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import { formatLocalizedDate, formatLocalizedTime, getAppointmentStatusLabel } from '@/i18n/index.js';
import { tokens } from '@/theme/index.js';

import type { CustomerDetail } from '@/lib/types.js';

export interface CustomerDetailScreenViewProps {
  detail: CustomerDetail | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  nameInput: string;
  emailInput: string;
  notesInput: string;
  onBack: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  onCreateAppointment: () => void;
}

function formatDate(value: string): string {
  return formatLocalizedDate(value.slice(0, 10), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) ?? value;
}

function formatTime(value: string): string {
  return formatLocalizedTime(value, {
    hour: '2-digit',
    minute: '2-digit',
  }) ?? value;
}

export function CustomerDetailScreenView({
  detail,
  isLoading,
  isSaving,
  error,
  nameInput,
  emailInput,
  notesInput,
  onBack,
  onRefresh,
  onRetry,
  onNameChange,
  onEmailChange,
  onNotesChange,
  onSave,
  onCreateAppointment,
}: CustomerDetailScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isLoading}
      onRefresh={onRefresh}
      testID="customer-detail-refresh"
    />
  );

  if (isLoading && !detail) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <AppCard testID="customer-detail-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('customers.detailLoading')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <AppCard testID="customer-detail-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{error}</Text>
          <AppButton
            testID="customer-detail-error-retry"
            title={t('common.actions.retry')}
            variant="secondary"
            onPress={onRetry}
          />
        </AppCard>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen scrollable keyboardAware refreshControl={refreshControl}>
        <EmptyState
          testID="customer-detail-empty"
          title={t('customers.detailMissingTitle')}
          message={t('customers.detailMissingMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable keyboardAware refreshControl={refreshControl}>
      <ScreenHeader
        testID="customer-detail-header"
        title={t('customers.detailTitle')}
        subtitle={detail.name}
        onBack={onBack}
      />

      <AppCard testID="customer-detail-summary">
        <Text style={styles.name}>{detail.name}</Text>
        <Text style={styles.meta}>{detail.phone}</Text>
        {detail.email ? (
          <Text style={styles.meta}>{detail.email}</Text>
        ) : null}
        <Text style={styles.meta}>
          {t('customers.labels.firstVisit')}: {formatDate(detail.firstSeenAt)}
        </Text>
        <Text style={styles.meta}>
          {t('customers.labels.lastVisit')}: {formatDate(detail.lastSeenAt)}
        </Text>
      </AppCard>

      <View style={styles.metricGrid}>
        <MetricCard
          testID="customer-detail-completed"
          label={t('customers.metrics.completed')}
          value={detail.completedCount}
        />
        <MetricCard
          testID="customer-detail-no-shows"
          label={t('customers.metrics.noShows')}
          value={detail.noShowCount}
        />
        <MetricCard
          testID="customer-detail-cancellations"
          label={t('customers.metrics.cancellations')}
          value={detail.cancelledCount}
        />
        <MetricCard
          testID="customer-detail-upcoming"
          label={t('customers.metrics.upcoming')}
          value={detail.upcomingCount}
        />
      </View>

      <AppCard testID="customer-detail-edit-form">
        <AppTextInput
          testID="customer-detail-name-input"
          label={t('common.labels.clientName')}
          value={nameInput}
          onChangeText={onNameChange}
        />
        <AppTextInput
          testID="customer-detail-email-input"
          label={t('common.labels.emailAddress')}
          value={emailInput}
          onChangeText={onEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <AppTextInput
          testID="customer-detail-notes-input"
          label={t('common.labels.notesOptional')}
          value={notesInput}
          onChangeText={onNotesChange}
          multiline
          textAlignVertical="top"
          inputStyle={styles.notesInput}
        />
        {error ? (
          <Text style={styles.errorText} testID="customer-detail-inline-error">
            {error}
          </Text>
        ) : null}
        <AppButton
          testID="customer-detail-save"
          title={t('common.actions.saveChanges')}
          loading={isSaving}
          onPress={onSave}
          disabled={isSaving}
        />
        <AppButton
          testID="customer-detail-create-appointment"
          title={t('customers.createAppointment')}
          variant="secondary"
          onPress={onCreateAppointment}
          disabled={isSaving}
        />
      </AppCard>

      <AppCard testID="customer-detail-upcoming-list">
        <Text style={styles.sectionTitle}>{t('customers.sections.upcoming')}</Text>
        {detail.upcomingAppointments.length === 0 ? (
          <Text style={styles.meta}>{t('customers.emptyUpcoming')}</Text>
        ) : (
          <View style={styles.listStack}>
            {detail.upcomingAppointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                title={appointment.serviceName}
                subtitle={`${formatDate(appointment.startAt)} • ${formatTime(appointment.startAt)} • ${appointment.employeeName ?? t('common.states.unknown')}`}
                status={getAppointmentStatusLabel(appointment.status)}
              />
            ))}
          </View>
        )}
      </AppCard>

      <AppCard testID="customer-detail-history-list">
        <Text style={styles.sectionTitle}>{t('customers.sections.history')}</Text>
        {detail.recentAppointments.length === 0 ? (
          <Text style={styles.meta}>{t('customers.emptyHistory')}</Text>
        ) : (
          <View style={styles.listStack}>
            {detail.recentAppointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                title={appointment.serviceName}
                subtitle={`${formatDate(appointment.startAt)} • ${formatTime(appointment.startAt)} • ${appointment.employeeName ?? t('common.states.unknown')}`}
                status={getAppointmentStatusLabel(appointment.status)}
              />
            ))}
          </View>
        )}
      </AppCard>
    </Screen>
  );
}

function MetricCard({
  label,
  value,
  testID,
}: {
  label: string;
  value: number;
  testID: string;
}) {
  return (
    <AppCard testID={testID} style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </AppCard>
  );
}

function AppointmentRow({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle: string;
  status: string;
}) {
  return (
    <View style={styles.appointmentRow}>
      <View style={styles.appointmentCopy}>
        <Text style={styles.appointmentTitle}>{title}</Text>
        <Text style={styles.meta}>{subtitle}</Text>
      </View>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredCard: {
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  helperText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
  },
  name: {
    ...tokens.typography.variant.heading,
    color: tokens.colors.textPrimary,
  },
  meta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  metricCard: {
    flexBasis: '47%',
  },
  metricValue: {
    ...tokens.typography.variant.heading,
    color: tokens.colors.textPrimary,
  },
  metricLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  notesInput: {
    minHeight: 120,
  },
  sectionTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
    marginBottom: tokens.spacing[2],
  },
  listStack: {
    gap: tokens.spacing[2],
  },
  appointmentRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    justifyContent: 'space-between',
  },
  appointmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  appointmentTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  status: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primary,
    fontWeight: tokens.typography.weight.semibold,
  },
});
