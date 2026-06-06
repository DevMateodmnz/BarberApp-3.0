/**
 * Auth layout — wraps sign-in screens.
 * Uses a plain Stack without tab navigation.
 */
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}