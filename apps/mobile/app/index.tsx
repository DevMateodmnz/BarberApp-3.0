/**
 * Index screen — auth gate.
 *
 * Redirects to the appropriate screen based on authentication state:
 * - Signed in → /(tabs) home
 * - Signed out → /(auth)/sign-in
 */
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';

import { AppCard, Screen } from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const { t } = useTranslation();

  // Show nothing while Clerk is initializing
  if (!isLoaded) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <AppCard variant="elevated" style={styles.loadingCard}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text style={styles.loadingTitle}>{t('runtime.loadingAppTitle')}</Text>
            <Text style={styles.loadingMessage}>
              {t('runtime.loadingAppMessage')}
            </Text>
          </AppCard>
        </View>
      </Screen>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing[4],
  },
  loadingCard: {
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingVertical: tokens.spacing[8],
  },
  loadingTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  loadingMessage: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
});
