/**
 * Root layout — wraps the app in ClerkProvider for authentication.
 *
 * Reads EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY from environment.
 * Shows a clear error message if the key is missing in development.
 */
import { ClerkProvider } from '@clerk/clerk-expo';
import { Slot } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Missing Clerk Key</Text>
        <Text style={styles.errorMessage}>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env.local file.
        </Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Slot />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
});