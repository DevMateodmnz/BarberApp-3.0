/**
 * Services screen — OWNER-only barbershop service catalog.
 *
 * Hidden route (href: null in _layout.tsx). Accessible via
 * "View Services" card on Home for OWNER users with a barbershop.
 * OWNER can view services and create new ones.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useServicesStore } from '@/lib/servicesStore.js';
import { formatCentsForDisplay, parseCurrencyInputToCents } from '@/lib/format.js';
import { useFlashStore } from '@/lib/flashStore.js';

export default function ServicesScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    services,
    isServicesLoading,
    servicesError,
    loadServices,
    createService,
  } = useServicesStore();

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPriceInput, setNewPriceInput] = useState('');
  const [newDurationInput, setNewDurationInput] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !getToken || context) return;
    void loadContext(getToken);
  }, [context, getToken, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context || !getToken) return;
    void loadServices(getToken, context.barbershopId);
  }, [context, getToken, loadServices]);

  function resetCreateForm() {
    setNewName('');
    setNewPriceInput('');
    setNewDurationInput('');
    setNewDescription('');
    setCreateError(null);
    setShowCreateForm(false);
  }

  async function handleCreateService() {
    setCreateError(null);

    // Validate name
    const trimmedName = newName.trim();
    if (trimmedName.length === 0) {
      setCreateError('Service name is required.');
      return;
    }

    // Validate price
    const priceCents = parseCurrencyInputToCents(newPriceInput);
    if (priceCents === null) {
      setCreateError('Enter a valid price amount.');
      return;
    }

    // Validate duration
    const durationMinutes = Number(newDurationInput);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setCreateError('Enter a valid positive duration in minutes.');
      return;
    }

    if (!context?.barbershopId) {
      setCreateError('No barbershop context available.');
      return;
    }

    setIsCreating(true);

    try {
      const description = newDescription.trim() || undefined;
      await createService(getToken, context.barbershopId, {
        name: trimmedName,
        durationMinutes,
        priceCents,
        ...(description ? { description } : {}),
      });

      resetCreateForm();
      useFlashStore.getState().setMessage('Service created successfully.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create service');
    } finally {
      setIsCreating(false);
    }
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
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Services</Text>
        <Text style={styles.subtitle}>Your barbershop service catalog.</Text>
      </View>

      {!isOwner && (
        <View style={styles.messageCard}>
          <Text style={styles.emptyText}>
            Only barbershop owners can manage the service catalog.
          </Text>
        </View>
      )}

      {isOwner && (
        <>
          {/* Add Service toggle */}
          {!showCreateForm ? (
            <TouchableOpacity
              onPress={() => setShowCreateForm(true)}
              style={styles.addButton}
              testID="services-add-button"
            >
              <Text style={styles.addButtonText}>+ Add Service</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.createCard} testID="services-create-form">
              <Text style={styles.sectionLabel}>New Service</Text>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Classic Cut"
                style={styles.input}
                testID="services-create-name"
              />

              <Text style={styles.fieldLabel}>Price (ARS)</Text>
              <TextInput
                value={newPriceInput}
                onChangeText={setNewPriceInput}
                placeholder="e.g. 5000.50"
                keyboardType="decimal-pad"
                style={styles.input}
                testID="services-create-price"
              />

              <Text style={styles.fieldLabel}>Duration (minutes)</Text>
              <TextInput
                value={newDurationInput}
                onChangeText={setNewDurationInput}
                placeholder="e.g. 30"
                keyboardType="number-pad"
                style={styles.input}
                testID="services-create-duration"
              />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="e.g. Scissors and clippers"
                style={styles.input}
                testID="services-create-description"
              />

              {createError && (
                <Text style={styles.errorText} testID="services-create-error">
                  {createError}
                </Text>
              )}

              <View style={styles.createActions}>
                <TouchableOpacity
                  onPress={() => void handleCreateService()}
                  disabled={isCreating}
                  style={[styles.submitButton, isCreating && styles.submitButtonDisabled]}
                  testID="services-create-submit"
                >
                  <Text style={styles.submitButtonText}>
                    {isCreating ? 'Creating…' : 'Create Service'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={resetCreateForm}
                  disabled={isCreating}
                  style={styles.cancelButton}
                  testID="services-create-cancel"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Service list */}
          {isServicesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Loading services…</Text>
            </View>
          )}

          {servicesError && (
            <View style={styles.messageCard}>
              <Text style={styles.errorText} testID="services-error">
                {servicesError}
              </Text>
            </View>
          )}

          {!isServicesLoading && !servicesError && services.length === 0 && (
            <View style={styles.messageCard}>
              <Text style={styles.emptyText} testID="services-empty">
                No services yet.
              </Text>
            </View>
          )}

          {!isServicesLoading && !servicesError && services.length > 0 && (
            <View style={styles.listCard} testID="services-list">
              {services.map((service) => (
                <View key={service.id} style={styles.serviceRow} testID={`service-${service.id}`}>
                  <View style={styles.serviceRowHeader}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.servicePrice}>
                      {formatCentsForDisplay(service.priceCents)}
                    </Text>
                  </View>
                  <View style={styles.serviceRowMeta}>
                    <Text style={styles.serviceDuration}>
                      {service.durationMinutes} min
                    </Text>
                    {!service.isActive && (
                      <Text style={styles.serviceInactive}>Inactive</Text>
                    )}
                  </View>
                  {service.description && (
                    <Text style={styles.serviceDescription} numberOfLines={2}>
                      {service.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        testID="services-back"
      >
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  headerCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
  },
  addButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  createCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  createActions: {
    marginTop: 16,
    gap: 8,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#999999',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#EEEEEE',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
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
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  messageCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  listCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  serviceRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    paddingVertical: 12,
    gap: 4,
  },
  serviceRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  servicePrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E7D32',
  },
  serviceRowMeta: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  serviceDuration: {
    fontSize: 12,
    color: '#666',
  },
  serviceInactive: {
    fontSize: 11,
    color: '#D32F2F',
    fontWeight: '600',
  },
  serviceDescription: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  backButton: {
    marginTop: 16,
    marginBottom: 24,
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
