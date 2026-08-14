import type { UserRole } from '@/lib/types.js';

export type MobilePrimaryDestinationId = 'home' | 'appointments' | 'record' | 'manage';
export type MobileSecondaryRouteId = 'services' | 'employees' | 'workingHours' | 'notifications' | 'promotions';
export type TabRouteName =
  | 'index'
  | 'appointments'
  | 'record-service'
  | 'manage'
  | 'notifications'
  | 'notification-detail'
  | 'promotions'
  | 'services'
  | 'employees'
  | 'working-hours'
  | 'commissions';

export type TranslationResolver = (key: string, options?: Record<string, unknown>) => string;

export interface MobilePrimaryDestination {
  id: MobilePrimaryDestinationId;
  tabRouteName: Extract<TabRouteName, 'index' | 'appointments' | 'record-service' | 'manage'>;
  route: '/(tabs)' | '/(tabs)/appointments' | '/(tabs)/record-service' | '/(tabs)/manage';
  icon: {
    default: string;
    selected: string;
  };
  tabLabelKey: string;
  titleKey: string;
  accessibilityLabelKey: string;
  allowedRoles: readonly UserRole[];
  order: number;
  isPrimaryAction: boolean;
}

export interface MobileSecondaryRoute {
  id: MobileSecondaryRouteId;
  tabRouteName: Extract<TabRouteName, 'services' | 'employees' | 'working-hours' | 'notifications' | 'promotions'>;
  route: '/(tabs)/services' | '/(tabs)/employees' | '/(tabs)/working-hours' | '/(tabs)/notifications' | '/(tabs)/promotions';
  titleKey: string;
  accessibilityLabelKey: string;
  allowedRoles: readonly UserRole[];
}

export const PRIMARY_ACTION_DESTINATION_ID: MobilePrimaryDestinationId = 'record';

export const MOBILE_PRIMARY_DESTINATIONS: readonly MobilePrimaryDestination[] = [
  {
    id: 'home',
    tabRouteName: 'index',
    route: '/(tabs)',
    icon: { default: 'home-outline', selected: 'home' },
    tabLabelKey: 'navigation.tabs.home',
    titleKey: 'navigation.home',
    accessibilityLabelKey: 'navigation.accessibility.homeTab',
    allowedRoles: ['OWNER', 'BARBER', 'CLIENT'],
    order: 1,
    isPrimaryAction: false,
  },
  {
    id: 'appointments',
    tabRouteName: 'appointments',
    route: '/(tabs)/appointments',
    icon: { default: 'calendar-outline', selected: 'calendar' },
    tabLabelKey: 'navigation.tabs.appointments',
    titleKey: 'navigation.appointments',
    accessibilityLabelKey: 'navigation.accessibility.appointmentsTab',
    allowedRoles: ['OWNER', 'BARBER'],
    order: 2,
    isPrimaryAction: false,
  },
  {
    id: 'record',
    tabRouteName: 'record-service',
    route: '/(tabs)/record-service',
    icon: { default: 'add-circle-outline', selected: 'add-circle' },
    tabLabelKey: 'navigation.tabs.record',
    titleKey: 'navigation.recordService',
    accessibilityLabelKey: 'navigation.accessibility.recordTab',
    allowedRoles: ['OWNER', 'BARBER'],
    order: 3,
    isPrimaryAction: true,
  },
  {
    id: 'manage',
    tabRouteName: 'manage',
    route: '/(tabs)/manage',
    icon: { default: 'briefcase-outline', selected: 'briefcase' },
    tabLabelKey: 'navigation.tabs.manage',
    titleKey: 'navigation.manage',
    accessibilityLabelKey: 'navigation.accessibility.manageTab',
    allowedRoles: ['OWNER'],
    order: 4,
    isPrimaryAction: false,
  },
] as const;

export const MOBILE_SECONDARY_ROUTES: readonly MobileSecondaryRoute[] = [
  {
    id: 'notifications',
    tabRouteName: 'notifications',
    route: '/(tabs)/notifications',
    titleKey: 'navigation.notifications',
    accessibilityLabelKey: 'navigation.accessibility.notifications',
    allowedRoles: ['OWNER'],
  },
  {
    id: 'promotions',
    tabRouteName: 'promotions',
    route: '/(tabs)/promotions',
    titleKey: 'navigation.promotions',
    accessibilityLabelKey: 'navigation.accessibility.promotions',
    allowedRoles: ['OWNER'],
  },
  {
    id: 'services',
    tabRouteName: 'services',
    route: '/(tabs)/services',
    titleKey: 'navigation.services',
    accessibilityLabelKey: 'navigation.accessibility.services',
    allowedRoles: ['OWNER'],
  },
  {
    id: 'employees',
    tabRouteName: 'employees',
    route: '/(tabs)/employees',
    titleKey: 'navigation.employees',
    accessibilityLabelKey: 'navigation.accessibility.employees',
    allowedRoles: ['OWNER'],
  },
  {
    id: 'workingHours',
    tabRouteName: 'working-hours',
    route: '/(tabs)/working-hours',
    titleKey: 'navigation.workingHours',
    accessibilityLabelKey: 'navigation.accessibility.workingHours',
    allowedRoles: ['OWNER'],
  },
] as const;

export function getPrimaryDestinationsForRole(role: UserRole | null | undefined): MobilePrimaryDestination[] {
  if (!role) {
    return [];
  }

  return MOBILE_PRIMARY_DESTINATIONS
    .filter((destination) => destination.allowedRoles.includes(role))
    .sort((left, right) => left.order - right.order);
}

export function getSecondaryRoutesForRole(role: UserRole | null | undefined): MobileSecondaryRoute[] {
  if (!role) {
    return [];
  }

  return MOBILE_SECONDARY_ROUTES.filter((route) => route.allowedRoles.includes(role));
}

export function getPrimaryDestinationByRouteName(
  routeName: MobilePrimaryDestination['tabRouteName'],
): MobilePrimaryDestination {
  const destination = MOBILE_PRIMARY_DESTINATIONS.find((candidate) => candidate.tabRouteName === routeName);
  if (!destination) {
    throw new Error(`Unknown primary destination: ${routeName}`);
  }

  return destination;
}

export function canAccessTabRoute(routeName: TabRouteName, role: UserRole | null | undefined): boolean {
  if (routeName === 'index') {
    return role !== null && role !== undefined;
  }

  if (routeName === 'notification-detail') {
    return role === 'OWNER';
  }

  if (routeName === 'commissions') {
    return role === 'OWNER' || role === 'BARBER';
  }

  const primaryDestination = MOBILE_PRIMARY_DESTINATIONS.find(
    (destination) => destination.tabRouteName === routeName,
  );
  if (primaryDestination) {
    return !!role && primaryDestination.allowedRoles.includes(role);
  }

  const secondaryRoute = MOBILE_SECONDARY_ROUTES.find((candidate) => candidate.tabRouteName === routeName);
  if (secondaryRoute) {
    return !!role && secondaryRoute.allowedRoles.includes(role);
  }

  return false;
}

export function resolvePrimaryDestinationCopy(
  destination: MobilePrimaryDestination,
  resolve: TranslationResolver,
) {
  return {
    tabLabel: resolve(destination.tabLabelKey),
    title: resolve(destination.titleKey),
    accessibilityLabel: resolve(destination.accessibilityLabelKey),
  };
}
