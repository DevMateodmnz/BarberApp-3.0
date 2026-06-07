/**
 * Home screen — protected, shown when user is signed in.
 *
 * Loads user context from backend (/me/context) on mount,
 * then loads today's daily summary based on the user role.
 * OWNER: sees barbershop summary (totals + employee breakdown).
 * BARBER: sees their own employee summary (totals).
 * CLIENT: sees a "coming soon" message.
 */
import { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { DailySummarySection } from '@/components/DailySummarySection.js';
import { ServiceRecordCreateSection } from '@/components/ServiceRecordCreateSection.js';
import { useContextStore } from '@/lib/store.js';
import { useSummaryStore } from '@/lib/summaryStore.js';
import {
  getTodayDateString,
  addDaysToDateString,
  isTodayDateString,
} from '@/lib/format.js';
import type { BarbershopDailySummary, EmployeeDailySummary } from '@/lib/types.js';

export default function HomeScreen() {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    summary,
    isSummaryLoading,
    summaryError,
    loadSummaryForDate,
  } = useSummaryStore();

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getToken) return;
    loadContext(getToken);
  }, [isSignedIn, getToken, loadContext]);

  // Load summary after context is loaded, for the selected date
  useEffect(() => {
    if (!context || !getToken) return;
    loadSummaryForDate(getToken, context, selectedDate);
  }, [context, getToken, selectedDate, loadSummaryForDate]);

  // Pull-to-refresh: reload context then summary for selectedDate
  const handleRefresh = useCallback(async () => {
    if (!getToken) return;
    await loadContext(getToken);
    // After context reloads, the useEffect above will trigger summary reload.
    // But if context didn't change (same reference), useEffect won't re-fire,
    // so we explicitly reload here too.
    const { context: freshContext } = useContextStore.getState();
    if (freshContext) {
      await loadSummaryForDate(getToken, freshContext, selectedDate);
    }
  }, [getToken, loadContext, selectedDate, loadSummaryForDate]);

  const handleOwnerRecordCreated = useCallback(async () => {
    if (!context || !getToken) return;
    await loadSummaryForDate(getToken, context, selectedDate);
  }, [context, getToken, loadSummaryForDate, selectedDate]);

  const isRefreshing = isContextLoading || isSummaryLoading;

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          testID="home-refresh"
        />
      }
    >
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
          {context.role === 'OWNER' && context.barbershopId && (
            <ServiceRecordCreateSection
              barbershopId={context.barbershopId}
              getToken={getToken}
              onRecordCreated={handleOwnerRecordCreated}
            />
          )}

          {context.role === 'CLIENT' && (
            <View style={styles.summaryCard} testID="home-client-message">
              <Text style={styles.summaryTitle}>Dashboard</Text>
              <Text style={styles.comingSoon}>Coming soon for clients.</Text>
            </View>
          )}

          {/* Date navigation controls — only for OWNER and BARBER, not CLIENT */}
          {(context.role === 'OWNER' || context.role === 'BARBER') && (
            <View style={styles.dateControls} testID="date-controls">
              <TouchableOpacity
                onPress={() => setSelectedDate((prev) => addDaysToDateString(prev, -1))}
                style={styles.dateButton}
                testID="date-prev"
              >
                <Text style={styles.dateButtonText}>◀</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const today = getTodayDateString();
                  if (selectedDate !== today) {
                    setSelectedDate(today);
                  }
                }}
                style={[styles.dateButton, isTodayDateString(selectedDate) && styles.dateButtonDisabled]}
                disabled={isTodayDateString(selectedDate)}
                testID="date-today"
              >
                <Text
                  style={[
                    styles.dateButtonText,
                    isTodayDateString(selectedDate) && styles.dateButtonTextDisabled,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>

              <Text style={styles.dateDisplay} testID="date-display">{selectedDate}</Text>

              <TouchableOpacity
                onPress={() => setSelectedDate((prev) => addDaysToDateString(prev, 1))}
                style={styles.dateButton}
                testID="date-next"
              >
                <Text style={styles.dateButtonText}>▶</Text>
              </TouchableOpacity>
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
              <DailySummarySection
                byEmployee={(summary as BarbershopDailySummary).byEmployee}
                byPaymentMethod={(summary as BarbershopDailySummary).byPaymentMethod}
                selectedDate={selectedDate}
                totalRecords={(summary as BarbershopDailySummary).totalRecords}
                totalRevenueCents={(summary as BarbershopDailySummary).totalRevenueCents}
              />
            </View>
          )}

          {/* BARBER summary */}
          {context.role === 'BARBER' && summary && !isSummaryLoading && !summaryError && (
            <View style={styles.summaryCard} testID="home-barber-summary">
              <DailySummarySection
                byPaymentMethod={(summary as EmployeeDailySummary).byPaymentMethod}
                selectedDate={selectedDate}
                totalRecords={(summary as EmployeeDailySummary).totalRecords}
                totalRevenueCents={(summary as EmployeeDailySummary).totalRevenueCents}
              />
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
  emptySummaryText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
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
  // Date navigation controls
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
  },
  dateButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  dateButtonDisabled: {
    backgroundColor: '#999',
  },
  dateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dateButtonTextDisabled: {
    color: '#CCCCCC',
  },
  dateDisplay: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    fontFamily: 'monospace',
  },
});
