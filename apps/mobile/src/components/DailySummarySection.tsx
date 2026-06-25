import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AppCard,
  EmptyState,
  ListItem,
  MetricCard,
  SectionHeader,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import {
  formatBusinessDateLabel,
  formatCents,
  formatPaymentMethodLabel,
  isTodayDateString,
} from '@/lib/format.js';
import type { EmployeeSummary, PaymentMethodSummary } from '@/lib/types.js';

interface DailySummarySectionProps {
  byEmployee?: EmployeeSummary[];
  byPaymentMethod: PaymentMethodSummary[];
  selectedDate: string;
  totalRecords: number;
  totalRevenueCents: number;
  titleLabel?: string;
}

export function DailySummarySection({
  byEmployee,
  byPaymentMethod,
  selectedDate,
  totalRecords,
  totalRevenueCents,
  titleLabel,
}: DailySummarySectionProps) {
  const { t } = useTranslation();
  const dateLabel = titleLabel ?? (
    isTodayDateString(selectedDate)
      ? t('common.periods.today')
      : formatBusinessDateLabel(selectedDate)
  );
  const hasRecords = totalRecords > 0;

  return (
    <View style={styles.container}>
      <SectionHeader
        testID="summary-title"
        title={t(titleLabel ? 'summary.revenueSummaryTitle' : 'summary.dailySummaryTitle', {
          label: dateLabel,
        })}
      />

      <AppCard style={styles.metricsCard}>
        <View style={styles.metricRow}>
          <MetricCard
            value={totalRecords}
            label={t('summary.recordsMetric')}
            style={styles.metric}
          />
          <MetricCard
            value={formatCents(totalRevenueCents)}
            label={t('summary.revenueMetric')}
            style={styles.metric}
          />
        </View>
      </AppCard>

      {!hasRecords && (
        <EmptyState
          title={t('summary.noRecordsTitle')}
          message={t('summary.noRecordsMessage')}
        />
      )}

      {hasRecords && byEmployee && byEmployee.length > 0 && (
        <View style={styles.breakdownSection}>
          <SectionHeader title={t('summary.byEmployee')} />
          {byEmployee.map((employee) => (
            <ListItem
              key={employee.employeeId}
              title={employee.employeeName ?? t('common.states.unknown')}
              subtitle={`${employee.recordsCount} · ${formatCents(employee.revenueCents)}`}
              style={styles.breakdownItem}
            />
          ))}
        </View>
      )}

      {hasRecords && byPaymentMethod.length > 0 && (
        <View style={styles.breakdownSection}>
          <SectionHeader title={t('summary.byPaymentMethod')} />
          {byPaymentMethod.map((paymentMethod, index) => (
            <ListItem
              key={paymentMethod.paymentMethod ?? `null-${index}`}
              title={formatPaymentMethodLabel(paymentMethod.paymentMethod)}
              subtitle={`${paymentMethod.recordsCount} · ${formatCents(paymentMethod.revenueCents)}`}
              style={styles.breakdownItem}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing[3],
  },
  metricsCard: {
    padding: tokens.spacing[3],
  },
  metricRow: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
  },
  metric: {
    flex: 1,
  },
  breakdownSection: {
    gap: tokens.spacing[2],
  },
  breakdownItem: {
    marginBottom: tokens.spacing[1],
  },
});
