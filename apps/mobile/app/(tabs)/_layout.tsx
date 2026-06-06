/**
 * Protected tabs layout — shown when user is signed in.
 *
 * Minimal single-tab layout for PR-028A.
 * Will be expanded with role-based tabs in later PRs.
 */
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
    </Tabs>
  );
}