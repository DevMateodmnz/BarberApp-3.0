/**
 * Home screen — protected, shown when user is signed in.
 *
 * Loads user context from backend (/me/context) on mount,
 * then loads today's daily summary based on the user role.
 * OWNER: sees barbershop summary (totals + employee breakdown).
 * BARBER: sees their own employee summary (totals).
 * CLIENT: sees a "coming soon" message.
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useContextStore } from '@/lib/store.js';
import { useSummaryStore } from '@/lib/summaryStore.js';
import { formatCents } from '@/lib/format.js';
import type { BarbershopDailySummary, EmployeeDailySummary } from '@/lib/types.js';

export default function HomeScreen() {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    summary,
    isSummaryLoading,
    summaryError,
    loadTodaySummary,
  } = useSummaryStore();

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getToken) return;
    loadContext(getToken);
  }, [isSignedIn, getToken, loadContext]);

  // Load summary after context is loaded
  useEffect(() => {
    if (!context || !getToken) return;
    loadTodaySummary(getToken, context);
  }, [context, getToken, loadTodaySummary]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <Text style={styles.appName}>BarberApp</Text>

      {/* Context loading */}
      {isContextLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator testID="home-loading" size="large" />
          <Text style={styles.loadingText}>Loading your context…</Text>
        </View>
      )}

      {/* Context error */}
      {contextError && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText} testID="home-error">
            {contextError}
          </Text>
        </View>
      )}

      {/* Context loaded */}
      {context && !isContextLoading && !contextError && (
        <>
          {/* Role card */}
          <View style={styles.contextCard} testID="home-context">
            <Text style={styles.roleLabel}>
              Role: <Text style={styles.roleValue}>{context.role}</Text>
            </Text>

            {context.barbershopName && (
              <Text style={styles.detailText} testID="home-barbershop-name">
                Barbershop: {context.barbershopName}
              </Text>
            )}

            {context.employeeName && (
              <Text style={styles.detailText} testID="home-employee-name">
                Employee: {context.employeeName}
              </Text>
            )}

            {(context.role === 'OWNER' || context.role === 'BARBER') &&
              !context.barbershopName && (
                <Text style={styles.emptyHint} testID="home-no-context">
                  No barbershop assigned yet.
                </Text>
              )}
          </View>

          {/* Summary section */}
          {context.role === 'CLIENT' && (
            <View style={styles.summaryCard} testID="home-client-message">
              <Text style={styles.summaryTitle}>Dashboard</Text>
              <Text style={styles.comingSoon}>Coming soon for clients.</Text>
            </View>
          )}

          {isSummaryLoading && (
            <View style={styles.summaryCard}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Loading summary…</Text>
            </View>
          )}

          {summaryError && (
            <View style={styles.summaryCard}>
              <Text style={styles.errorText} testID="home-summary-error">
                {summaryError}
              </Text>
            </View>
          )}

          {/* OWNER summary */}
          {context.role === 'OWNER' && summary && !isSummaryLoading && !summaryError && (
            <View style={styles.summaryCard} testID="home-owner-summary">
              <OwnerSummary summary={summary as BarbershopDailySummary} />
            </View>
          )}

          {/* BARBER summary */}
          {context.role === 'BARBER' && summary && !isSummaryLoading && !summaryError && (
            <View style={styles.summaryCard} testID="home-barber-summary">
              <BarberSummary summary={summary as EmployeeDailySummary} />
            </View>
          )}

          {/* Missing IDs — no summary to load */}
          {(context.role === 'OWNER' || context.role === 'BARBER') &&
            !context.barbershopId && !isSummaryLoading && !summary && (
              <View style={styles.summaryCard}>
                <Text style={styles.emptyHint}>
                  {context.role === 'OWNER'
                    ? 'No barbershop assigned yet. Summary will appear when a barbershop is linked to your account.'
                    : 'No employee record found. Summary will appear when you are linked to a barbershop.'}
                </Text>
              </View>
            )}
        </>
      )}
    </ScrollView>
  );
}

/** OWNER summary: totals + employee breakdown + payment methods */
function OwnerSummary({ summary }: { summary: BarbershopDailySummary }) {
  return (
    <>
      <Text style={styles.summaryTitle}>Today — {summary.date}</Text>
      <View style={styles.totalsRow}>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{summary.totalRecords}</Text>
          <Text style={styles.totalLabel}>Records</Text>
        </View>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{formatCents(summary.totalRevenueCents)}</Text>
          <Text style={styles.totalLabel}>Revenue</Text>
        </View>
      </View>

      {summary.byEmployee.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Employee</Text>
          {summary.byEmployee.map((emp) => (
            <View key={emp.employeeId} style={styles.breakdownRow}>
              <Text style={styles.breakdownName}>{emp.employeeName ?? 'Unknown'}</Text>
              <Text style={styles.breakdownDetail}>
                {emp.recordsCount} · {formatCents(emp.revenueCents)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {summary.byPaymentMethod.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Payment Method</Text>
          {summary.byPaymentMethod.map((pm, i) => (
            <View key={pm.paymentMethod ?? `null-${i}`} style={styles.breakdownRow}>
              <Text style={styles.breakdownName}>{pm.paymentMethod ?? 'Unknown'}</Text>
              <Text style={styles.breakdownDetail}>
                {pm.recordsCount} · {formatCents(pm.revenueCents)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

/** BARBER summary: totals + payment methods */
function BarberSummary({ summary }: { summary: EmployeeDailySummary }) {
  return (
    <>
      <Text style={styles.summaryTitle}>Today — {summary.date}</Text>
      <View style={styles.totalsRow}>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{summary.totalRecords}</Text>
          <Text style={styles.totalLabel}>Records</Text>
        </View>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{formatCents(summary.totalRevenueCents)}</Text>
          <Text style={styles.totalLabel}>Revenue</Text>
        </View>
      </View>

      {summary.byPaymentMethod.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Payment Method</Text>
          {summary.byPaymentMethod.map((pm, i) => (
            <View key={pm.paymentMethod ?? `null-${i}`} style={styles.breakdownRow}>
              <Text style={styles.breakdownName}>{pm.paymentMethod ?? 'Unknown'}</Text>
              <Text style={styles.breakdownDetail}>
                {pm.recordsCount} · {formatCents(pm.revenueCents)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    padding: 24,
    alignItems: 'center',
  },
  centerContent: {
    alignItems: 'center',
    marginTop: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#D32F2F',
    textAlign: 'center',
  },
  contextCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  roleLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  roleValue: {
    fontWeight: '700',
    color: '#007AFF',
  },
  detailText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  comingSoon: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  summaryCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
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