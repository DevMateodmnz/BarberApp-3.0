import type { ReactNode } from 'react';
import { Text, View, StyleSheet } from 'react-native';
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

interface SummaryTotalsProps {
  totalRecords: number;
  totalRevenueCents: number;
}

interface BreakdownSectionProps {
  children: ReactNode;
  title: string;
}

interface EmployeeBreakdownProps {
  byEmployee: EmployeeSummary[];
}

interface PaymentMethodBreakdownProps {
  byPaymentMethod: PaymentMethodSummary[];
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
    <>
      <Text style={styles.summaryTitle} testID="summary-title">
        Daily Summary — {dateLabel}
      </Text>

      <SummaryTotals
        totalRecords={totalRecords}
        totalRevenueCents={totalRevenueCents}
      />

      {!hasRecords && <SummaryEmptyState />}

      {hasRecords && byEmployee && byEmployee.length > 0 && (
        <EmployeeBreakdown byEmployee={byEmployee} />
      )}

      {hasRecords && byPaymentMethod.length > 0 && (
        <PaymentMethodBreakdown byPaymentMethod={byPaymentMethod} />
      )}
    </>
  );
}

function SummaryTotals({
  totalRecords,
  totalRevenueCents,
}: SummaryTotalsProps) {
  return (
    <View style={styles.totalsRow}>
      <View style={styles.totalItem}>
        <Text style={styles.totalValue}>{totalRecords}</Text>
        <Text style={styles.totalLabel}>Records</Text>
      </View>
      <View style={styles.totalItem}>
        <Text style={styles.totalValue}>{formatCents(totalRevenueCents)}</Text>
        <Text style={styles.totalLabel}>Revenue</Text>
      </View>
    </View>
  );
}

function SummaryEmptyState() {
  return (
    <Text style={styles.emptySummaryText}>
      No services recorded for this date.
    </Text>
  );
}

function BreakdownSection({ children, title }: BreakdownSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function EmployeeBreakdown({ byEmployee }: EmployeeBreakdownProps) {
  return (
    <BreakdownSection title="By Employee">
      {byEmployee.map((employee) => (
        <View key={employee.employeeId} style={styles.breakdownRow}>
          <Text style={styles.breakdownName}>
            {employee.employeeName ?? 'Unknown'}
          </Text>
          <Text style={styles.breakdownDetail}>
            {employee.recordsCount} · {formatCents(employee.revenueCents)}
          </Text>
        </View>
      ))}
    </BreakdownSection>
  );
}

function PaymentMethodBreakdown({
  byPaymentMethod,
}: PaymentMethodBreakdownProps) {
  return (
    <BreakdownSection title="By Payment Method">
      {byPaymentMethod.map((paymentMethod, index) => (
        <View
          key={paymentMethod.paymentMethod ?? `null-${index}`}
          style={styles.breakdownRow}
        >
          <Text style={styles.breakdownName}>
            {formatPaymentMethodLabel(paymentMethod.paymentMethod)}
          </Text>
          <Text style={styles.breakdownDetail}>
            {paymentMethod.recordsCount} · {formatCents(paymentMethod.revenueCents)}
          </Text>
        </View>
      ))}
    </BreakdownSection>
  );
}

const styles = StyleSheet.create({
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  totalItem: {
    alignItems: 'center',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
  },
  totalLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptySummaryText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  breakdownDetail: {
    fontSize: 14,
    color: '#666',
  },
});
