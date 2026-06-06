/**
 * Index screen — auth gate.
 *
 * Redirects to the appropriate screen based on authentication state:
 * - Signed in → /(tabs) home
 * - Signed out → /(auth)/sign-in
 */
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show nothing while Clerk is initializing
  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}