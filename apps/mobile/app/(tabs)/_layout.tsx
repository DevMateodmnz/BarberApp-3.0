/**
 * Protected tabs layout — shown when user is signed in.
 *
 * Minimal single-tab layout for PR-028A.
 * Hidden detail routes can live inside this group without becoming visible tabs.
 */
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { tokens } from '@/theme/index.js';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: tokens.colors.primaryLight,
        tabBarInactiveTintColor: tokens.colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? 'home' : 'home-outline'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="record-service"
        options={{
          title: 'Record Service',
          href: null,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          href: null,
        }}
      />
      <Tabs.Screen
        name="employees"
        options={{
          title: 'Employees',
          href: null,
        }}
      />
      <Tabs.Screen
        name="working-hours"
        options={{
          title: 'Working Hours',
          href: null,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Appointments',
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: tokens.colors.background,
  },
  tabBar: {
    backgroundColor: tokens.colors.surface,
    borderTopColor: tokens.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.spacing[2],
    paddingBottom: tokens.spacing[2],
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarLabel: {
    ...tokens.typography.variant.caption,
    fontWeight: tokens.typography.weight.medium,
  },
  tabBarIcon: {
    marginBottom: tokens.spacing[1],
  },
});
