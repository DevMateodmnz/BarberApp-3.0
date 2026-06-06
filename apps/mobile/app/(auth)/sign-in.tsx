/**
 * Sign-in screen — entry point for unauthenticated users.
 *
 * Minimal implementation using Clerk's useSignIn hook.
 * Will be styled and expanded in later PRs.
 */
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';

export default function SignInScreen() {
  const { isLoaded, signIn } = useSignIn();

  if (!isLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="sign-in-loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BarberApp</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>
      {signIn && (
        <Pressable
          style={styles.button}
          onPress={() => {
            // Navigate to Clerk's hosted sign-in page
            // This will be replaced with a proper sign-in flow in later PRs
            try {
              signIn.create({ strategy: 'ticket', ticket: '' });
            } catch {
              // Expected to fail without a valid ticket —
              // the full sign-in form will be added in PR-028B+
            }
          }}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});