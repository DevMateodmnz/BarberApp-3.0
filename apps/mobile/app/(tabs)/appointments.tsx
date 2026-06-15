/**
 * Appointments screen — OWNER and BARBER manage appointments.
 *
 * OWNER sees all barbershop appointments with an employee filter.
 * BARBER sees their own appointments.
 * CLIENT is blocked.
 *
 * Date navigation uses client-side filtering: appointments whose
 * startAt starts with the selected date string are shown.
 */
import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { useContextStore } from '@/lib/store.js';
import { useAppointmentsStore } from '@/lib/appointmentsStore.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import {
  getTodayDateString,
  addDaysToDateString,
  isTodayDateString,
  formatRecordTime,
} from '@/lib/format.js';
import type { AppointmentStatus } from '@/lib/types.js';

/** Allowed status transitions per role. */
const OWNER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const BARBER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: [],
  CONFIRMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function statusLabel(status: AppointmentStatus): string {
  switch (status) {
    case 'PENDING': return 'Pending';
    case 'CONFIRMED': return 'Confirmed';
    case 'IN_PROGRESS': return 'In Progress';
    case 'COMPLETED': return 'Completed';
    case 'CANCELLED': return 'Cancelled';
    case 'NO_SHOW': return 'No-show';
  }
}

function transitionLabel(status: AppointmentStatus): string {
  switch (status) {
    case 'CONFIRMED': return 'Confirm';
    case 'CANCELLED': return 'Cancel';
    case 'IN_PROGRESS': return 'Start';
    case 'COMPLETED': return 'Complete';
    case 'NO_SHOW': return 'No-show';
    default: return status;
  }
}

export default function AppointmentsScreen() {
  const { isSignedIn, getToken, isLoaded } = useAuth();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, loadContext } = useContextStore();
  const {
    appointments,
    isAppointmentsLoading,
    appointmentsError,
    loadAppointments,
    transitionStatus,
    cancelAppointment,
  } = useAppointmentsStore();

  const { employees, loadEmployees } = useEmployeesStore();

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const hasFocusedOnceRef = useRef(false);

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current) return;
    loadContext(getTokenRef.current);
  }, [isSignedIn, loadContext]);

  // Load employees for OWNER filter
  useEffect(() => {
    if (!context || context.role !== 'OWNER' || !context.barbershopId || !getTokenRef.current) return;
    loadEmployees(getTokenRef.current, context.barbershopId);
  }, [context, loadEmployees]);

  // Load appointments when context is ready
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    loadAppointments(getTokenRef.current, context);
  }, [context, loadAppointments]);

  // Reload on focus
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return undefined;
      }

      if (!context || !getTokenRef.current) {
        return undefined;
      }

      void loadAppointments(getTokenRef.current, context);
      return undefined;
    // getToken intentionally NOT in deps
    }, [context, loadAppointments])
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    if (!getTokenRef.current) return;
    await loadContext(getTokenRef.current);
    const { context: freshContext } = useContextStore.getState();
    if (freshContext) {
      await loadAppointments(getTokenRef.current, freshContext);
      if (freshContext.role === 'OWNER' && freshContext.barbershopId) {
        await loadEmployees(getTokenRef.current, freshContext.barbershopId);
      }
    }
  }, [loadContext, loadAppointments, loadEmployees]);

  // Handle status transition
  const handleTransition = useCallback(
    async (appointmentId: string, newStatus: AppointmentStatus) => {
      if (!getTokenRef.current) return;
      try {
        await transitionStatus(getTokenRef.current, appointmentId, newStatus);
      } catch {
        // Error is handled by the store
      }
    },
    [transitionStatus],
  );

  // Handle cancel
  const handleCancel = useCallback(
    async (appointmentId: string) => {
      if (!getTokenRef.current) return;
      try {
        await cancelAppointment(getTokenRef.current, appointmentId);
      } catch {
        // Error is handled by the store
      }
    },
    [cancelAppointment],
  );

  // Client-side filtering by date
  const dateFiltered = useMemo(() => {
    return appointments.filter((a) => a.startAt.startsWith(selectedDate));
  }, [appointments, selectedDate]);

  // Employee filter for OWNER
  const filtered = useMemo(() => {
    if (!context || context.role !== 'OWNER' || !selectedEmployeeId) return dateFiltered;
    return dateFiltered.filter((a) => a.employeeId === selectedEmployeeId);
  }, [context, dateFiltered, selectedEmployeeId]);

  // Get available transitions for an appointment based on role
  const getTransitions = useCallback(
    (status: AppointmentStatus): AppointmentStatus[] => {
      if (!context) return [];
      if (context.role === 'OWNER') return OWNER_TRANSITIONS[status] ?? [];
      if (context.role === 'BARBER') return BARBER_TRANSITIONS[status] ?? [];
      return [];
    },
    [context],
  );

  const isRefreshing = isContextLoading || isAppointmentsLoading;

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  // CLIENT blocked
  if (context?.role === 'CLIENT') {
    return (
      <View style={styles.centerContainer} testID="appointments-client-blocked">
        <Text style={styles.blockedText}>
          Appointment management is available for barbershop owners and barbers only.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          testID="appointments-refresh"
        />
      }
    >
      {/* Context loading */}
      {isContextLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator testID="appointments-loading" size="large" />
          <Text style={styles.loadingText}>Loading your context…</Text>
        </View>
      )}

      {/* Context loaded */}
      {context && !isContextLoading && (
        <>
          {/* Date navigation controls */}
          <View style={styles.dateControls} testID="appointments-date-controls">
            <TouchableOpacity
              onPress={() => setSelectedDate((prev) => addDaysToDateString(prev, -1))}
              style={styles.dateButton}
              testID="appointments-date-prev"
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
              testID="appointments-date-today"
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

            <Text style={styles.dateDisplay} testID="appointments-date-display">{selectedDate}</Text>

            <TouchableOpacity
              onPress={() => setSelectedDate((prev) => addDaysToDateString(prev, 1))}
              style={styles.dateButton}
              testID="appointments-date-next"
            >
              <Text style={styles.dateButtonText}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* Employee filter (OWNER only) */}
          {context.role === 'OWNER' && employees.length > 0 && (
            <View style={styles.filterRow} testID="appointments-employee-filter">
              <TouchableOpacity
                onPress={() => setSelectedEmployeeId(null)}
                style={[
                  styles.filterChip,
                  !selectedEmployeeId && styles.filterChipActive,
                ]}
                testID="appointments-filter-all"
              >
                <Text
                  style={[
                    styles.filterChipText,
                    !selectedEmployeeId && styles.filterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {employees.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  onPress={() => setSelectedEmployeeId(emp.id)}
                  style={[
                    styles.filterChip,
                    selectedEmployeeId === emp.id && styles.filterChipActive,
                  ]}
                  testID={`appointments-filter-emp-${emp.id}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedEmployeeId === emp.id && styles.filterChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {emp.user.name ?? emp.user.email}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Loading state */}
          {isAppointmentsLoading && (
            <View style={styles.summaryCard}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Loading appointments…</Text>
            </View>
          )}

          {/* Error state */}
          {appointmentsError && (
            <View style={styles.summaryCard}>
              <Text style={styles.errorText} testID="appointments-error">
                {appointmentsError}
              </Text>
            </View>
          )}

          {/* Empty state */}
          {!isAppointmentsLoading && !appointmentsError && filtered.length === 0 && (
            <View style={styles.summaryCard} testID="appointments-empty">
              <Text style={styles.emptyHint}>No appointments for this date.</Text>
            </View>
          )}

          {/* Appointment cards */}
          {!isAppointmentsLoading && !appointmentsError && filtered.length > 0 && (
            <View style={styles.summaryCard} testID="appointments-list">
              <Text style={styles.summaryTitle}>Appointments</Text>

              {filtered.map((appt) => (
                <View key={appt.id} style={styles.appointmentCard} testID={`appointment-${appt.id}`}>
                  <View style={styles.appointmentHeader}>
                    <Text style={styles.appointmentTime}>
                      {formatRecordTime(appt.startAt) ?? '--:--'}
                    </Text>
                    <View style={[styles.statusBadge, statusBadgeStyle(appt.status)]}>
                      <Text style={styles.statusBadgeText}>{statusLabel(appt.status)}</Text>
                    </View>
                  </View>

                  <Text style={styles.appointmentClient} numberOfLines={1}>
                    {appt.client.name ?? appt.client.email}
                  </Text>
                  <Text style={styles.appointmentService} numberOfLines={1}>
                    {appt.service.name}
                  </Text>

                  {context.role === 'OWNER' && appt.employee?.user?.name && (
                    <Text style={styles.appointmentEmployee} numberOfLines={1}>
                      Barber: {appt.employee.user.name}
                    </Text>
                  )}

                  {appt.notes && (
                    <Text style={styles.appointmentNotes} numberOfLines={2}>
                      {appt.notes}
                    </Text>
                  )}

                  {/* Action buttons */}
                  {getTransitions(appt.status).length > 0 && (
                    <View style={styles.actionRow} testID={`appointment-actions-${appt.id}`}>
                      {getTransitions(appt.status).map((targetStatus) => {
                        const isCancel = targetStatus === 'CANCELLED';
                        return (
                          <TouchableOpacity
                            key={targetStatus}
                            onPress={() => {
                              if (isCancel) {
                                handleCancel(appt.id);
                              } else {
                                handleTransition(appt.id, targetStatus);
                              }
                            }}
                            style={[
                              styles.actionButtonSmall,
                              isCancel && styles.actionButtonDanger,
                            ]}
                            testID={`appointment-action-${appt.id}-${targetStatus}`}
                          >
                            <Text style={styles.actionButtonSmallText}>
                              {transitionLabel(targetStatus)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function statusBadgeStyle(status: AppointmentStatus) {
  switch (status) {
    case 'PENDING': return styles.badgePending;
    case 'CONFIRMED': return styles.badgeConfirmed;
    case 'IN_PROGRESS': return styles.badgeInProgress;
    case 'COMPLETED': return styles.badgeCompleted;
    case 'CANCELLED': return styles.badgeCancelled;
    case 'NO_SHOW': return styles.badgeNoShow;
  }
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  centerContent: {
    alignItems: 'center',
    marginTop: 16,
  },
  blockedText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
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
  emptyHint: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    width: '100%',
    maxWidth: 400,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  appointmentCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    paddingVertical: 12,
    gap: 4,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appointmentTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  badgePending: { backgroundColor: '#F5A623' },
  badgeConfirmed: { backgroundColor: '#007AFF' },
  badgeInProgress: { backgroundColor: '#FF6D00' },
  badgeCompleted: { backgroundColor: '#2E7D32' },
  badgeCancelled: { backgroundColor: '#999' },
  badgeNoShow: { backgroundColor: '#D32F2F' },
  appointmentClient: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  appointmentService: {
    fontSize: 12,
    color: '#666',
  },
  appointmentEmployee: {
    fontSize: 12,
    color: '#888',
  },
  appointmentNotes: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionButtonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  actionButtonDanger: {
    backgroundColor: '#D32F2F',
  },
  actionButtonSmallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
