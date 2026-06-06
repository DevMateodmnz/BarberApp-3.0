/**
 * Home screen — protected, shown when user is signed in.
 *
 * Minimal home screen for PR-028A.
 * Displays authenticated user info. Dashboard and summaries
 * will be added in later PRs.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';

export default function HomeScreen() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isSignedIn) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>BarberApp</Text>
      <Text style={styles.welcome}>
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </Text>
      <Text style={styles.hint}>
        Signed in as {user?.primaryEmailAddress?.emailAddress ?? 'unknown'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  welcome: {
    fontSize: 18,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#666',
  },
});