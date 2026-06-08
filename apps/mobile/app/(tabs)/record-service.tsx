import { useCallback, useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ServiceRecordCreateSection } from '@/components/ServiceRecordCreateSection.js';
import { useContextStore } from '@/lib/store.js';
import { useFlashStore } from '@/lib/flashStore.js';

export default function RecordServiceScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { context, isLoading, error, loadContext } = useContextStore();

  useEffect(() => {
    if (!isSignedIn || !getToken || context) return;
    void loadContext(getToken);
  }, [context, getToken, isSignedIn, loadContext]);

  const handleRecordCreated = useCallback(async () => {
    useFlashStore.getState().setMessage('Service record created successfully.');
    router.back();
  }, [router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isLoading && !context) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading your context…</Text>
      </View>
    );
  }

  if (error && !context) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>{error}</Text>
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

  const canOwnerCreate = context.role === 'OWNER' && !!context.barbershopId;
  const canBarberCreate = context.role === 'BARBER' && !!context.barbershopId && !!context.employeeId;

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Record Service</Text>
        <Text style={styles.subtitle}>Add a completed service record from your phone.</Text>
      </View>

      {canOwnerCreate && (
        <ServiceRecordCreateSection
          mode="OWNER"
          barbershopId={context.barbershopId!}
          getToken={getToken}
          onRecordCreated={handleRecordCreated}
        />
      )}

      {canBarberCreate && (
        <ServiceRecordCreateSection
          mode="BARBER"
          barbershopId={context.barbershopId!}
          employeeId={context.employeeId!}
          getToken={getToken}
          onRecordCreated={handleRecordCreated}
        />
      )}

      {context.role === 'CLIENT' && (
        <View style={styles.messageCard}>
          <Text style={styles.emptyText}>Only owners and barbers can record completed services.</Text>
        </View>
      )}

      {(context.role === 'OWNER' || context.role === 'BARBER') && !canOwnerCreate && !canBarberCreate && (
        <View style={styles.messageCard}>
          <Text style={styles.emptyText}>
            {context.role === 'OWNER'
              ? 'No barbershop is linked to your account yet.'
              : 'No employee context is linked to your account yet.'}
          </Text>
        </View>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="record-service-back">
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
  messageCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
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
