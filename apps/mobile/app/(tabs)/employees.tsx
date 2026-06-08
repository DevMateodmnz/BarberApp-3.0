/**
 * Employees screen — OWNER-only barbershop employee roster.
 *
 * Hidden route (href: null in _layout.tsx). Accessible via
 * "View Employees" card on Home for OWNER users with a barbershop.
 * OWNER can view, deactivate, and reactivate employees.
 */
import { useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useContextStore } from '@/lib/store.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import { useFlashStore } from '@/lib/flashStore.js';
import type { EmployeeListItem } from '@/lib/types.js';

export default function EmployeesScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    employees,
    isEmployeesLoading,
    employeesError,
    loadEmployees,
    deactivateEmployee,
    reactivateEmployee,
  } = useEmployeesStore();

  useEffect(() => {
    if (!isSignedIn || !getToken || context) return;
    void loadContext(getToken);
  }, [context, getToken, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context || !getToken) return;
    void loadEmployees(getToken, context.barbershopId);
  }, [context, getToken, loadEmployees]);

  const handleRefresh = useCallback(() => {
    if (!getToken || !context?.barbershopId) return;
    void loadEmployees(getToken, context.barbershopId);
  }, [getToken, context?.barbershopId, loadEmployees]);

  function handleDeactivate(employee: EmployeeListItem) {
    if (!context?.barbershopId) return;

    Alert.alert(
      'Deactivate employee?',
      `${employee.user.name ?? employee.user.email} will no longer be able to record services.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => {
            deactivateEmployee(getToken, context.barbershopId!, employee.id)
              .then(() => {
                useFlashStore.getState().setMessage('Employee deactivated.');
              })
              .catch((err: unknown) => {
                useFlashStore.getState().setMessage(
                  err instanceof Error ? err.message : 'Failed to deactivate employee',
                );
              });
          },
        },
      ],
    );
  }

  function handleReactivate(employee: EmployeeListItem) {
    if (!context?.barbershopId) return;

    reactivateEmployee(getToken, context.barbershopId, employee.id)
      .then(() => {
        useFlashStore.getState().setMessage('Employee reactivated.');
      })
      .catch((err: unknown) => {
        useFlashStore.getState().setMessage(
          err instanceof Error ? err.message : 'Failed to reactivate employee',
        );
      });
  }

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isContextLoading && !context) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading your context…</Text>
      </View>
    );
  }

  if (contextError && !context) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>{contextError}</Text>
      </View>
    );
  }

  if (!context) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.emptyText}>No context available yet.</Text>
      </View>
    );
  }

  const isOwner = context.role === 'OWNER' && !!context.barbershopId;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isEmployeesLoading}
          onRefresh={handleRefresh}
          testID="employees-refresh"
        />
      }
    >
      <View style={styles.headerCard}>
        <Text style={styles.title}>Employees</Text>
        <Text style={styles.subtitle}>Your barbershop employee roster.</Text>
      </View>

      {!isOwner && (
        <View style={styles.messageCard}>
          <Text style={styles.emptyText}>
            Only barbershop owners can manage the employee roster.
          </Text>
        </View>
      )}

      {isOwner && (
        <>
          {isEmployeesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Loading employees…</Text>
            </View>
          )}

          {employeesError && (
            <View style={styles.messageCard}>
              <Text style={styles.errorText} testID="employees-error">{employeesError}</Text>
            </View>
          )}

          {!isEmployeesLoading && !employeesError && employees.length === 0 && (
            <View style={styles.messageCard}>
              <Text style={styles.emptyText} testID="employees-empty">
                No employees found.
              </Text>
            </View>
          )}

          {!isEmployeesLoading && !employeesError && employees.length > 0 && (
            <View style={styles.listCard} testID="employees-list">
              {employees.map((employee) => (
                <View key={employee.id} style={styles.employeeRow} testID={`employee-${employee.id}`}>
                  <View style={styles.employeeRowHeader}>
                    <Text style={styles.employeeName}>
                      {employee.user.name ?? employee.user.email}
                    </Text>
                    <Text style={employee.isActive ? styles.activeBadge : styles.inactiveBadge}>
                      {employee.isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Text style={styles.employeeEmail}>{employee.user.email}</Text>
                  <Text style={styles.employeeRole}>{employee.user.role}</Text>
                  <View style={styles.employeeRowActions}>
                    {employee.isActive ? (
                      <TouchableOpacity
                        onPress={() => handleDeactivate(employee)}
                        style={styles.deactivateButton}
                        testID={`employee-deactivate-${employee.id}`}
                      >
                        <Text style={styles.deactivateButtonText}>Deactivate</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleReactivate(employee)}
                        style={styles.reactivateButton}
                        testID={`employee-reactivate-${employee.id}`}
                      >
                        <Text style={styles.reactivateButtonText}>Reactivate</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="employees-back">
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 24, alignItems: 'center' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FFFFFF' },
  headerCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6 },
  loadingText: { fontSize: 14, color: '#666', marginTop: 8 },
  errorText: { fontSize: 14, color: '#D32F2F', textAlign: 'center', marginTop: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
  messageCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  listCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  employeeRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD', paddingVertical: 12, gap: 6 },
  employeeRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  employeeName: { fontSize: 14, fontWeight: '600', color: '#333', flex: 1 },
  activeBadge: { fontSize: 11, color: '#2E7D32', fontWeight: '600' },
  inactiveBadge: { fontSize: 11, color: '#D32F2F', fontWeight: '600' },
  employeeEmail: { fontSize: 12, color: '#666' },
  employeeRole: { fontSize: 12, color: '#999' },
  employeeRowActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  deactivateButton: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: '#FFEBEE' },
  deactivateButtonText: { fontSize: 12, color: '#D32F2F', fontWeight: '600' },
  reactivateButton: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E8F5E9' },
  reactivateButtonText: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  backButton: { marginTop: 16, marginBottom: 24, backgroundColor: '#333333', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, width: '100%', maxWidth: 400, alignItems: 'center' },
  backButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
