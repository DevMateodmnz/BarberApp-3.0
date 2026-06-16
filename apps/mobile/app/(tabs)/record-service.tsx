import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

import { AppButton, AppCard, EmptyState, Screen, ScreenHeader } from '@/components/ui/index.js';
import { ServiceRecordCreateSection } from '@/components/ServiceRecordCreateSection.js';
import { useContextStore } from '@/lib/store.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { tokens } from '@/theme/index.js';

export default function RecordServiceScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  // Stabilize getToken via ref — Clerk Expo recreates getToken every render,
  // which causes infinite useEffect re-fire loops when used as a dep.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading, error, loadContext } = useContextStore();

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  const handleRecordCreated = useCallback(async () => {
    useFlashStore.getState().setMessage('Service record created successfully.');
    router.back();
  }, [router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isLoading && !context) {
    return (
      <Screen>
        <View style={styles.centerContent}>
          <AppCard variant="outlined" style={styles.stateCard}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text style={styles.mutedText}>Loading your context…</Text>
          </AppCard>
        </View>
      </Screen>
    );
  }

  if (error && !context) {
    return (
      <Screen>
        <View style={styles.centerContent}>
          <AppCard variant="outlined" style={styles.stateCard}>
            <Text style={styles.errorText}>{error}</Text>
          </AppCard>
        </View>
      </Screen>
    );
  }

  if (!context) {
    return (
      <Screen>
        <View style={styles.centerContent}>
          <EmptyState
            title="No context available"
            message="No context available yet."
          />
        </View>
      </Screen>
    );
  }

  const canOwnerCreate = context.role === 'OWNER' && !!context.barbershopId;
  const canBarberCreate = context.role === 'BARBER' && !!context.barbershopId && !!context.employeeId;

  return (
    <Screen scrollable testID="record-service-screen">
      <ScreenHeader
        title="Record Service"
        subtitle="Add a completed service record"
      />

      {canOwnerCreate && (
        <ServiceRecordCreateSection
          mode="OWNER"
          barbershopId={context.barbershopId!}
          getToken={getTokenRef.current}
          onRecordCreated={handleRecordCreated}
        />
      )}

      {canBarberCreate && (
        <ServiceRecordCreateSection
          mode="BARBER"
          barbershopId={context.barbershopId!}
          employeeId={context.employeeId!}
          getToken={getTokenRef.current}
          onRecordCreated={handleRecordCreated}
        />
      )}

      {context.role === 'CLIENT' && (
        <AppCard variant="outlined" style={styles.messageCard}>
          <Text style={styles.messageText}>
            Only owners and barbers can record completed services.
          </Text>
        </AppCard>
      )}

      {(context.role === 'OWNER' || context.role === 'BARBER') && !canOwnerCreate && !canBarberCreate && (
        <AppCard variant="outlined" style={styles.messageCard}>
          <Text style={styles.messageText}>
            {context.role === 'OWNER'
              ? 'No barbershop is linked to your account yet.'
              : 'No employee context is linked to your account yet.'}
          </Text>
        </AppCard>
      )}

      <AppButton
        testID="record-service-back"
        title="Back to Home"
        variant="ghost"
        size="md"
        onPress={() => router.back()}
        style={styles.backButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing[4],
  },
  stateCard: {
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  messageCard: {
    marginTop: tokens.spacing[4],
  },
  mutedText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  messageText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  backButton: {
    width: '100%',
    marginTop: tokens.spacing[4],
    marginBottom: tokens.spacing[6],
  },
});
