/**
 * Home screen — protected, shown when user is signed in.
 *
 * Loads user context from backend (/me/context) on mount.
 * Displays role, barbershop name (if present), and employee name.
 * Shows loading spinner while fetching, error message on failure.
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useContextStore } from '@/lib/store.js';

export default function HomeScreen() {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { context, isLoading, error, loadContext } = useContextStore();

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getToken) return;
    loadContext(getToken);
  }, [isSignedIn, getToken, loadContext]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>BarberApp</Text>

      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator testID="home-loading" size="large" />
          <Text style={styles.loadingText}>Loading your context…</Text>
        </View>
      )}

      {error && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText} testID="home-error">
            {error}
          </Text>
        </View>
      )}

      {context && !isLoading && !error && (
        <View style={styles.contextCard} testID="home-context">
          <Text style={styles.roleLabel}>
            Role: <Text style={styles.roleValue}>{context.role}</Text>
          </Text>

          {context.barbershopName && (
            <Text style={styles.detailText} testID="home-barbershop-name">
              Barbershop: {context.barbershopName}
            </Text>
          )}

          {context.employeeName && (
            <Text style={styles.detailText} testID="home-employee-name">
              Employee: {context.employeeName}
            </Text>
          )}

          {(context.role === 'OWNER' || context.role === 'BARBER') &&
            !context.barbershopName && (
              <Text style={styles.emptyHint} testID="home-no-context">
                No barbershop assigned yet.
              </Text>
            )}
        </View>
      )}
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
  centerContent: {
    alignItems: 'center',
    marginTop: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
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
  contextCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  roleLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  roleValue: {
    fontWeight: '700',
    color: '#007AFF',
  },
  detailText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
});