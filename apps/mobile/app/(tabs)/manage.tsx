import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ManageContent } from '@/components/ManageContent.js';
import { AppCard, EmptyState, Screen } from '@/components/ui/index.js';
import { useContextStore } from '@/lib/store.js';
import { tokens } from '@/theme/index.js';

export default function ManageScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useTranslation();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading, error, loadContext } = useContextStore();

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isLoading && !context) {
    return (
      <Screen>
        <View style={styles.centerContent}>
          <AppCard variant="outlined" style={styles.stateCard}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text style={styles.mutedText}>{t('runtime.loadingContext')}</Text>
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
            title={t('common.states.noContextTitle')}
            message={t('common.states.noContextMessage')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable testID="manage-screen">
      <ManageContent
        isOwner={context.role === 'OWNER'}
        onNotifications={() => router.push('/(tabs)/notifications')}
        onServices={() => router.push('/(tabs)/services')}
        onEmployees={() => router.push('/(tabs)/employees')}
        onWorkingHours={() => router.push('/(tabs)/working-hours')}
        onOpenLanguageSettings={() => router.push('/language')}
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
  mutedText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
});
