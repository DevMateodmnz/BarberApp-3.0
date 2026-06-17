/**
 * Root layout — wraps the app in ClerkProvider for authentication.
 *
 * Reads EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY from environment.
 * Shows a clear error message if the key is missing in development.
 */
import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard, Screen } from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
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
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <ThemeProvider value={navigationTheme}>
        <View style={styles.appShell}>
          <StatusBar style="light" backgroundColor={tokens.colors.background} />
          <Screen>
            <View style={styles.errorContainer}>
              <AppCard variant="elevated" style={styles.errorCard}>
                <Text style={styles.errorTitle}>Missing Clerk Key</Text>
                <Text style={styles.errorMessage}>
                  Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env.local file.
                </Text>
              </AppCard>
            </View>
          </Screen>
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
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
