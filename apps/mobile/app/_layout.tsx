/**
 * Root layout — wraps the app in ClerkProvider for authentication.
 *
 * Renders a friendly setup error card when the validated mobile
 * public runtime configuration is missing or invalid.
 */
import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { getMobilePublicRuntimeResult } from '@/config/publicRuntime.js';
import { AppCard, Screen } from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

const mobilePublicRuntimeResult = getMobilePublicRuntimeResult();
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: tokens.colors.primary,
    background: tokens.colors.background,
    card: tokens.colors.background,
    text: tokens.colors.textPrimary,
    border: tokens.colors.border,
    notification: tokens.colors.primaryLight,
  },
} as const;

export default function RootLayout() {
  if (!mobilePublicRuntimeResult.ok) {
    return (
      <ThemeProvider value={navigationTheme}>
        <View style={styles.appShell}>
          <StatusBar style="light" backgroundColor={tokens.colors.background} />
          <Screen>
            <View style={styles.errorContainer}>
              <AppCard variant="elevated" style={styles.errorCard}>
                <Text style={styles.errorTitle}>Mobile Configuration Error</Text>
                <Text style={styles.errorMessage}>
                  {mobilePublicRuntimeResult.error.message}
                </Text>
              </AppCard>
            </View>
          </Screen>
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={mobilePublicRuntimeResult.value.clerkPublishableKey}>
      <ThemeProvider value={navigationTheme}>
        <View style={styles.appShell}>
          <StatusBar style="light" backgroundColor={tokens.colors.background} />
          <Slot />
        </View>
      </ThemeProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing[4],
  },
  errorCard: {
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingVertical: tokens.spacing[8],
  },
  errorTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  errorMessage: {
    ...tokens.typography.variant.bodySmall,
    textAlign: 'center',
    color: tokens.colors.textSecondary,
  },
});
