import { View, StyleSheet } from 'react-native';
import {
  AppCard,
  EmptyState,
  ListItem,
  MetricCard,
  SectionHeader,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import {
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
}

export function DailySummarySection({
  byEmployee,
  byPaymentMethod,
  selectedDate,
  totalRecords,
  totalRevenueCents,
}: DailySummarySectionProps) {
  const dateLabel = isTodayDateString(selectedDate) ? 'Today' : selectedDate;
  const hasRecords = totalRecords > 0;

  return (
    <View style={styles.container}>
      <SectionHeader
        testID="summary-title"
        title={`Daily Summary — ${dateLabel}`}
      />

      <AppCard style={styles.metricsCard}>
        <View style={styles.metricRow}>
          <MetricCard
            value={totalRecords}
            label="Records"
            style={styles.metric}
          />
          <MetricCard
            value={formatCents(totalRevenueCents)}
            label="Revenue"
            style={styles.metric}
          />
        </View>
      </AppCard>

      {!hasRecords && (
        <EmptyState
          title="No services recorded for this date."
          message="Records you create will appear here."
        />
      )}

      {hasRecords && byEmployee && byEmployee.length > 0 && (
        <View style={styles.breakdownSection}>
          <SectionHeader title="By Employee" />
          {byEmployee.map((employee) => (
            <ListItem
              key={employee.employeeId}
              title={employee.employeeName ?? 'Unknown'}
              subtitle={`${employee.recordsCount} · ${formatCents(employee.revenueCents)}`}
              style={styles.breakdownItem}
            />
          ))}
        </View>
      )}

      {hasRecords && byPaymentMethod.length > 0 && (
        <View style={styles.breakdownSection}>
          <SectionHeader title="By Payment Method" />
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
