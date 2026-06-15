/**
 * Protected tabs layout — shown when user is signed in.
 *
 * Minimal single-tab layout for PR-028A.
 * Hidden detail routes can live inside this group without becoming visible tabs.
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
