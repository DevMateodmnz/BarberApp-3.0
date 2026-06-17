/**
 * Auth layout — wraps sign-in screens.
 * Uses a plain Stack without tab navigation.
 */
import { Stack } from 'expo-router';

import { tokens } from '@/theme/index.js';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: tokens.colors.background,
        },
      }}
    />
  );
}
