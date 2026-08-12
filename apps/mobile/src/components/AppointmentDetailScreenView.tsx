import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  EmptyState,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import type {
  Appointment,
} from '@/lib/types.js';

export interface AppointmentDetailActionViewModel {
  id: string;
  label: string;
  variant: 'secondary' | 'danger';
  testID: string;
  onPress: () => void;
}

export interface AppointmentDetailScreenViewProps {
  appointment: Appointment | null;
  summaryTimeLabel: string | null;
  employeeDisplayLabel: string | null;
  changeRows: Array<{ id: string; title: string; body: string; meta?: string | null }>;
  notificationRows: Array<{ id: string; label: string; meta?: string | null }>;
  actions: AppointmentDetailActionViewModel[];
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  onBack: () => void;
}

export function AppointmentDetailScreenView({
  appointment,
  summaryTimeLabel,
  employeeDisplayLabel,
  changeRows,
  notificationRows,
  actions,
  isLoading,
  error,
  isMutating,
  onBack,
}: AppointmentDetailScreenViewProps) {
  const { t } = useTranslation();

  return (
    <Screen scrollable>
      <ScreenHeader
        title={t('appointments.detailTitle')}
        subtitle={t('appointments.detailSubtitle')}
      />

      <AppButton
        testID="appointment-detail-back"
        title={t('common.actions.back')}
        variant="secondary"
        size="sm"
        onPress={onBack}
      />

      {isLoading ? (
        <AppCard style={styles.stateCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.stateText}>{t('appointments.detailLoading')}</Text>
        </AppCard>
      ) : null}

      {error ? (
        <AppCard style={styles.stateCard}>
          <Text style={styles.errorText}>{error}</Text>
        </AppCard>
      ) : null}

      {!isLoading && !error && !appointment ? (
        <AppCard>
          <EmptyState
            title={t('appointments.detailMissingTitle')}
            message={t('appointments.detailMissingMessage')}
          />
        </AppCard>
      ) : null}

      {appointment ? (
        <>
          <AppCard variant="outlined" style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>{appointment.clientName}</Text>
                <Text style={styles.summaryBody}>{appointment.serviceName}</Text>
                {summaryTimeLabel ? (
                  <Text style={styles.summaryMeta}>{summaryTimeLabel}</Text>
                ) : null}
                {employeeDisplayLabel ? (
                  <Text style={styles.summaryMeta}>{employeeDisplayLabel}</Text>
                ) : null}
              </View>
              <StatusBadge status={appointment.status} />
            </View>

            {appointment.notes ? (
              <Text style={styles.notesText}>{appointment.notes}</Text>
            ) : null}

            {notificationRows.length > 0 ? (
              <View style={styles.notificationWrap}>
                {notificationRows.map((row) => (
                  <Text key={row.id} style={styles.notificationLabel}>
                    {row.label}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              {actions.map((action) => (
                <AppButton
                  key={action.id}
                  testID={action.testID}
                  title={action.label}
                  variant={action.variant}
                  size="sm"
                  disabled={isMutating}
                  onPress={action.onPress}
                />
              ))}
            </View>
          </AppCard>

          <AppCard variant="outlined">
            <SectionHeader
              title={t('appointments.detailNotificationsTitle')}
              action={<Text style={styles.sectionCount}>{notificationRows.length}</Text>}
            />
            {notificationRows.length === 0 ? (
              <Text style={styles.sectionEmpty}>{t('appointments.detailNotificationsEmpty')}</Text>
            ) : (
              <View style={styles.sectionStack}>
                {notificationRows.map((notification) => (
                  <View key={notification.id} style={styles.sectionRow}>
                    <Text style={styles.sectionRowTitle}>{notification.label}</Text>
                    {notification.meta ? (
                      <Text style={styles.sectionRowBody}>{notification.meta}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </AppCard>

          <AppCard variant="outlined">
            <SectionHeader
              title={t('appointmentReschedule.historySection')}
              action={<Text style={styles.sectionCount}>{changeRows.length}</Text>}
            />
            {changeRows.length === 0 ? (
              <Text style={styles.sectionEmpty}>{t('appointments.detailHistoryEmpty')}</Text>
            ) : (
              <View style={styles.sectionStack}>
                {changeRows.map((change) => (
                  <View key={change.id} style={styles.sectionRow}>
                    <Text style={styles.sectionRowTitle}>{change.title}</Text>
                    <Text style={styles.sectionRowBody}>{change.body}</Text>
                    {change.meta ? (
                      <Text style={styles.sectionRowMeta}>{change.meta}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </AppCard>
        </>
      ) : null}
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
  summaryCard: {
    gap: tokens.spacing[3],
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[3],
  },
  summaryCopy: {
    flex: 1,
    gap: tokens.spacing[1],
  },
  summaryTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  summaryBody: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  summaryMeta: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  notesText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  notificationWrap: {
    gap: tokens.spacing[1],
  },
  notificationLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primaryLight,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  sectionCount: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  sectionEmpty: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  sectionStack: {
    gap: tokens.spacing[3],
  },
  sectionRow: {
    gap: tokens.spacing[1],
  },
  sectionRowTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  sectionRowBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  sectionRowMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
});
