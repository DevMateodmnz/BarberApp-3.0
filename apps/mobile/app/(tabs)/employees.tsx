/**
 * Employees screen — OWNER-only barbershop employee roster.
 *
 * Hidden route (href: null in _layout.tsx). Accessible via
 * "View Employees" card on Home for OWNER users with a barbershop.
 * OWNER can view, deactivate, and reactivate employees.
 */
import { useEffect, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useContextStore } from '@/lib/store.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import { useServicesStore } from '@/lib/servicesStore.js';
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
    createEmployee,
    assignedServices,
    isAssignmentsLoading,
    selectedEmployeeIdForAssignments,
    loadAssignments,
    assignService,
    unassignService,
    clearAssignments,
  } = useEmployeesStore();

  const { services: allServices, loadServices } = useServicesStore();

  useEffect(() => {
    if (!isSignedIn || !getToken || context) return;
    void loadContext(getToken);
  }, [context, getToken, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context || !getToken) return;
    void loadEmployees(getToken, context.barbershopId);
  }, [context, getToken, loadEmployees]);

  // Add employee form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function resetAddForm() {
    setNewUserId('');
    setCreateError(null);
    setShowAddForm(false);
  }

  async function handleCreateEmployee() {
    setCreateError(null);

    const userId = newUserId.trim();
    if (userId.length === 0) {
      setCreateError('User ID is required.');
      return;
    }

    if (!context?.barbershopId) {
      setCreateError('No barbershop context available.');
      return;
    }

    setIsCreating(true);

    try {
      await createEmployee(getToken, context.barbershopId, userId);
      resetAddForm();
      useFlashStore.getState().setMessage('Employee added successfully.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to add employee');
    } finally {
      setIsCreating(false);
    }
  }

  function handleToggleAssignments(employeeId: string) {
    if (selectedEmployeeIdForAssignments === employeeId) {
      clearAssignments();
      return;
    }
    if (!context?.barbershopId || !getToken) return;
    // Ensure all services are loaded
    void loadServices(getToken, context.barbershopId);
    void loadAssignments(getToken, context.barbershopId, employeeId);
  }

  const unassignedServices = useMemo(
    () =>
      allServices.filter(
        (s) => s.isActive && !assignedServices.some((a) => a.id === s.id),
      ),
    [allServices, assignedServices],
  );

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
          {/* Add Employee toggle */}
          {!showAddForm ? (
            <TouchableOpacity
              onPress={() => setShowAddForm(true)}
              style={styles.addButton}
              testID="employees-add-button"
            >
              <Text style={styles.addButtonText}>+ Add Employee</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.createCard} testID="employees-add-form">
              <Text style={styles.sectionLabel}>New Employee</Text>
              <Text style={styles.helpText}>
                Enter the Clerk user ID of an existing user to add them as an employee.
              </Text>

              <Text style={styles.fieldLabel}>User ID</Text>
              <TextInput
                value={newUserId}
                onChangeText={setNewUserId}
                placeholder="e.g. user_<clerk-id>..."
                style={styles.input}
                testID="employees-add-userid"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {createError && (
                <Text style={styles.errorText} testID="employees-add-error">{createError}</Text>
              )}

              <View style={styles.createActions}>
                <TouchableOpacity
                  onPress={() => void handleCreateEmployee()}
                  disabled={isCreating}
                  style={[styles.submitButton, isCreating && styles.submitButtonDisabled]}
                  testID="employees-add-submit"
                >
                  <Text style={styles.submitButtonText}>
                    {isCreating ? 'Adding…' : 'Add Employee'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={resetAddForm}
                  disabled={isCreating}
                  style={styles.cancelButton}
                  testID="employees-add-cancel"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                    <TouchableOpacity
                      onPress={() => handleToggleAssignments(employee.id)}
                      style={styles.manageServicesButton}
                      testID={`employee-manage-services-${employee.id}`}
                    >
                      <Text style={styles.manageServicesButtonText}>
                        {selectedEmployeeIdForAssignments === employee.id ? 'Hide Services' : 'Manage Services'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Expanded assignment section */}
                  {selectedEmployeeIdForAssignments === employee.id && (
                    <View style={styles.assignmentSection} testID={`employee-assignments-${employee.id}`}>
                      {isAssignmentsLoading && (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator size="small" />
                          <Text style={styles.loadingText}>Loading assignments…</Text>
                        </View>
                      )}

                      {!isAssignmentsLoading && (
                        <>
                          <Text style={styles.assignmentTitle}>Assigned Services</Text>
                          {assignedServices.length === 0 ? (
                            <Text style={styles.emptyHint}>No services assigned.</Text>
                          ) : (
                            assignedServices.map((svc) => (
                              <View key={svc.id} style={styles.assignmentRow}>
                                <Text style={styles.assignmentName}>{svc.name}</Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    if (!context?.barbershopId) return;
                                    void unassignService(getToken, context.barbershopId, employee.id, svc.id);
                                  }}
                                  style={styles.unassignButton}
                                  testID={`employee-unassign-${employee.id}-${svc.id}`}
                                >
                                  <Text style={styles.unassignButtonText}>Remove</Text>
                                </TouchableOpacity>
                              </View>
                            ))
                          )}

                          <Text style={[styles.assignmentTitle, { marginTop: 12 }]}>Available Services</Text>
                          {unassignedServices.length === 0 ? (
                            <Text style={styles.emptyHint}>All active services are assigned.</Text>
                          ) : (
                            unassignedServices.map((svc) => (
                              <View key={svc.id} style={styles.assignmentRow}>
                                <Text style={styles.assignmentName}>{svc.name}</Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    if (!context?.barbershopId) return;
                                    void assignService(getToken, context.barbershopId, employee.id, svc.id);
                                  }}
                                  style={styles.assignButton}
                                  testID={`employee-assign-${employee.id}-${svc.id}`}
                                >
                                  <Text style={styles.assignButtonText}>Assign</Text>
                                </TouchableOpacity>
                              </View>
                            ))
                          )}
                        </>
                      )}
                    </View>
                  )}
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
  addButton: { marginTop: 16, backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, width: '100%', maxWidth: 400, alignItems: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  createCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  helpText: { fontSize: 13, color: '#666', marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CCCCCC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#333' },
  createActions: { marginTop: 16, gap: 8 },
  submitButton: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#999999' },
  submitButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  cancelButton: { backgroundColor: '#EEEEEE', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cancelButtonText: { color: '#666', fontSize: 14 },
  manageServicesButton: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E3F2FD' },
  manageServicesButtonText: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  assignmentSection: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD' },
  assignmentTitle: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 4 },
  assignmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  assignmentName: { fontSize: 13, color: '#333', flex: 1 },
  assignButton: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, backgroundColor: '#E8F5E9' },
  assignButtonText: { fontSize: 11, color: '#2E7D32', fontWeight: '600' },
  unassignButton: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, backgroundColor: '#FFEBEE' },
  unassignButtonText: { fontSize: 11, color: '#D32F2F', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#999', fontStyle: 'italic' },
});
