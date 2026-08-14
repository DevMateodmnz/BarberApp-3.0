/**
 * Protected tabs layout — role-aware daily navigation for signed-in users.
 *
 * Primary tabs:
 * - OWNER: Home, Appointments, Record, Manage
 * - BARBER: Home, Appointments, Record
 *
 * Secondary management routes stay inside the tabs group but are hidden from
 * the tab bar with `href: null`.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, Screen } from '@/components/ui/index.js';
import {
  MOBILE_SECONDARY_ROUTES,
  getPrimaryDestinationByRouteName,
  resolvePrimaryDestinationCopy,
} from '@/lib/mobileNavigation.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import { useContextStore } from '@/lib/store.js';
import { tokens } from '@/theme/index.js';

export default function TabLayout() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const { t } = useTranslation();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const clearEmployeeInvitations = useEmployeesStore((state) => state.clearEmployeeInvitations);
  const {
    context,
    isLoading,
    error,
    loadContext,
    bootstrapAuthenticatedContext,
    bootstrapStatus,
    activeClerkUserId,
    clearContext,
  } = useContextStore();

  useEffect(() => {
    if (!isSignedIn || !userId) {
      clearContext();
      clearEmployeeInvitations();
      return;
    }

    if (activeClerkUserId && activeClerkUserId !== userId) {
      clearContext();
      clearEmployeeInvitations();
      return;
    }

    if (
      !context
      && !isLoading
      && bootstrapStatus === 'idle'
      && getTokenRef.current
    ) {
      void bootstrapAuthenticatedContext({
        clerkUserId: userId,
        getToken: getTokenRef.current,
      });
    }
  }, [
    activeClerkUserId,
    bootstrapAuthenticatedContext,
    bootstrapStatus,
    clearContext,
    clearEmployeeInvitations,
    context,
    isLoading,
    isSignedIn,
    userId,
  ]);

  if (!isLoaded) {
    return <TabsStateCard message={t('runtime.loadingAppMessage')} testID="tabs-loading" />;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!context) {
    if (error) {
      return (
        <TabsStateCard
          testID="tabs-error"
          message={error}
          action={
            bootstrapStatus === 'retryable_error'
              ? (
                  <AppButton
                    testID="tabs-error-retry"
                    title={t('common.actions.retry')}
                    variant="secondary"
                    onPress={() => {
                      if (!getTokenRef.current) {
                        return;
                      }

                      if (userId) {
                        void bootstrapAuthenticatedContext({
                          clerkUserId: userId,
                          getToken: getTokenRef.current,
                        });
                        return;
                      }

                      void loadContext(getTokenRef.current);
                    }}
                  />
                )
              : undefined
          }
        />
      );
    }

    return <TabsStateCard message={t('runtime.loadingContext')} testID="tabs-context-loading" />;
  }

  const role = context.role;
  const ownerOnlyRole = role === 'OWNER';
  const workerRole = role === 'OWNER' || role === 'BARBER';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: tokens.colors.primaryLight,
        tabBarInactiveTintColor: tokens.colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={buildPrimaryTabOptions('index', t)}
      />

      <Tabs.Protected guard={workerRole}>
        <Tabs.Screen
          name="appointments"
          options={buildPrimaryTabOptions('appointments', t)}
        />
        <Tabs.Screen
          name="appointments-create"
          options={{
            title: t('appointmentCreation.title'),
            href: null,
            tabBarAccessibilityLabel: t('appointmentCreation.accessibility.openCreate'),
          }}
        />
        <Tabs.Screen
          name="appointments-reschedule"
          options={{
            title: t('appointments.rescheduleAction'),
            href: null,
            tabBarAccessibilityLabel: t('appointments.rescheduleAction'),
          }}
        />
        <Tabs.Screen
          name="appointment-detail"
          options={{
            title: t('appointments.detailTitle'),
            href: null,
            tabBarAccessibilityLabel: t('appointments.detailTitle'),
          }}
        />
        <Tabs.Screen
          name="customers"
          options={{
            title: t('customers.title'),
            href: null,
            tabBarAccessibilityLabel: t('customers.accessibility.openDirectory'),
          }}
        />
        <Tabs.Screen
          name="customer-detail"
          options={{
            title: t('customers.detailTitle'),
            href: null,
            tabBarAccessibilityLabel: t('customers.accessibility.openCustomerDetail'),
          }}
        />
        <Tabs.Screen
          name="record-service"
          options={buildPrimaryTabOptions('record-service', t)}
        />
        <Tabs.Screen
          name="commissions"
          options={{
            title: t('navigation.commissions'),
            href: null,
            tabBarAccessibilityLabel: t('navigation.accessibility.commissions'),
          }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={ownerOnlyRole}>
        <Tabs.Screen
          name="manage"
          options={buildPrimaryTabOptions('manage', t)}
        />
        <Tabs.Screen
          name="notification-detail"
          options={{
            title: t('notificationsOperations.detailTitle'),
            href: null,
            tabBarAccessibilityLabel: t('notificationsOperations.accessibility.openDetail'),
          }}
        />
        <Tabs.Screen
          name="payment-review-detail"
          options={{
            title: t('paymentsSettings.reviews.detailTitle'),
            href: null,
            tabBarAccessibilityLabel: t('paymentsSettings.reviews.detailTitle'),
          }}
        />
        <Tabs.Screen
          name="qa-runtime"
          options={{
            title: t('runtime.physicalQa.panelTitle'),
            href: null,
            tabBarAccessibilityLabel: t(
              'runtime.physicalQa.openAccessibility',
            ),
          }}
        />
        {MOBILE_SECONDARY_ROUTES.map((route) => ({ route, title: t(route.titleKey), a11y: t(route.accessibilityLabelKey) })).map(({ route, title, a11y }) => (
          <Tabs.Screen
            key={route.tabRouteName}
            name={route.tabRouteName}
            options={{
              title,
              href: null,
              tabBarAccessibilityLabel: a11y,
            }}
          />
        ))}
      </Tabs.Protected>

    </Tabs>
  );
}

function buildPrimaryTabOptions(
  routeName: 'index' | 'appointments' | 'record-service' | 'manage',
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const destination = getPrimaryDestinationByRouteName(routeName);
  const copy = resolvePrimaryDestinationCopy(destination, t);
  const isPrimaryAction = destination.isPrimaryAction;

  return {
    title: copy.title,
    tabBarAccessibilityLabel: copy.accessibilityLabel,
    tabBarLabel: ({ focused, color }: { focused: boolean; color: string }) => (
      <Text
        style={[
          styles.tabBarLabel,
          focused && styles.tabBarLabelFocused,
          isPrimaryAction && styles.tabBarLabelPrimary,
          { color: focused ? color : tokens.colors.textSecondary },
        ]}
      >
        {copy.tabLabel}
      </Text>
    ),
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => (
      <View
        style={[
          styles.tabIconContainer,
          isPrimaryAction && styles.primaryTabIconContainer,
          focused ? styles.tabIconContainerFocused : styles.tabIconContainerDefault,
          isPrimaryAction && focused ? styles.primaryTabIconContainerFocused : null,
        ]}
      >
        <Ionicons
          color={isPrimaryAction && focused ? tokens.colors.textInverse : color}
          name={(focused ? destination.icon.selected : destination.icon.default) as never}
          size={isPrimaryAction ? 22 : 20}
        />
      </View>
    ),
    tabBarItemStyle: isPrimaryAction ? styles.primaryTabItem : styles.tabBarItem,
  };
}

function TabsStateCard({
  message,
  action,
  testID,
}: {
  message: string;
  action?: ReactNode;
  testID: string;
}) {
  return (
    <Screen testID={testID}>
      <View style={styles.stateContainer}>
        <AppCard variant="outlined" style={styles.stateCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.stateMessage}>{message}</Text>
          {action}
        </AppCard>
      </View>
    </Screen>
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
    elevation: 0,
    height: 74,
    paddingBottom: tokens.layout.compactControlGap,
    paddingTop: tokens.layout.compactControlGap,
    shadowOpacity: 0,
  },
  tabBarItem: {
    paddingVertical: tokens.spacing[1],
  },
  primaryTabItem: {
    paddingVertical: 0,
  },
  tabBarLabel: {
    ...tokens.typography.variant.caption,
    fontWeight: tokens.typography.weight.medium,
  },
  tabBarLabelFocused: {
    color: tokens.colors.textPrimary,
  },
  tabBarLabelPrimary: {
    fontWeight: tokens.typography.weight.semibold,
  },
  tabIconContainer: {
    alignItems: 'center',
    borderRadius: tokens.radius.full,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  tabIconContainerDefault: {
    backgroundColor: 'transparent',
  },
  tabIconContainerFocused: {
    backgroundColor: tokens.colors.surfaceVariant,
  },
  primaryTabIconContainer: {
    height: 42,
    width: 42,
  },
  primaryTabIconContainerFocused: {
    backgroundColor: tokens.colors.primary,
  },
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.layout.screenHorizontalPadding,
  },
  stateCard: {
    alignItems: 'center',
    gap: tokens.layout.relatedCardGap,
    paddingVertical: tokens.spacing[8],
  },
  stateMessage: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
});
