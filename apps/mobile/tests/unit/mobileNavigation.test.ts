import { beforeEach, describe, expect, it } from 'vitest';

import {
  MOBILE_PRIMARY_DESTINATIONS,
  PRIMARY_ACTION_DESTINATION_ID,
  canAccessTabRoute,
  getPrimaryDestinationsForRole,
  resolvePrimaryDestinationCopy,
} from '@/lib/mobileNavigation.js';
import { SUPPORTED_LOCALES, mobileLocalizationRuntime } from '@/i18n/index.js';

const ownerIds = ['home', 'appointments', 'record', 'manage'];
const barberIds = ['home', 'appointments', 'record'];

describe('mobileNavigation', () => {
  beforeEach(async () => {
    await mobileLocalizationRuntime.bootstrap();
    await mobileLocalizationRuntime.i18n.changeLanguage('en');
  });

  it('returns ordered OWNER destinations', () => {
    expect(getPrimaryDestinationsForRole('OWNER').map((destination) => destination.id)).toEqual(ownerIds);
  });

  it('returns ordered BARBER destinations without Manage', () => {
    expect(getPrimaryDestinationsForRole('BARBER').map((destination) => destination.id)).toEqual(barberIds);
    expect(getPrimaryDestinationsForRole('BARBER').some((destination) => destination.id === 'manage')).toBe(false);
  });

  it('keeps Record as the single primary action', () => {
    const primaryActions = MOBILE_PRIMARY_DESTINATIONS.filter((destination) => destination.isPrimaryAction);
    expect(PRIMARY_ACTION_DESTINATION_ID).toBe('record');
    expect(primaryActions).toHaveLength(1);
    expect(primaryActions[0]?.id).toBe('record');
  });

  it('has no duplicate destination ids or routes', () => {
    const ids = MOBILE_PRIMARY_DESTINATIONS.map((destination) => destination.id);
    const routes = MOBILE_PRIMARY_DESTINATIONS.map((destination) => destination.route);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('does not expose role tabs while the context is unresolved', () => {
    expect(getPrimaryDestinationsForRole(null)).toEqual([]);
    expect(getPrimaryDestinationsForRole(undefined)).toEqual([]);
  });

  it('guards owner-only management routes for BARBER and unresolved roles', () => {
    expect(canAccessTabRoute('manage', 'OWNER')).toBe(true);
    expect(canAccessTabRoute('manage', 'BARBER')).toBe(false);
    expect(canAccessTabRoute('services', 'BARBER')).toBe(false);
    expect(canAccessTabRoute('employees', 'BARBER')).toBe(false);
    expect(canAccessTabRoute('working-hours', 'BARBER')).toBe(false);
    expect(canAccessTabRoute('manage', null)).toBe(false);
  });

  it('keeps stable route identifiers across all locales while labels change through translations', async () => {
    const baseRoutes = getPrimaryDestinationsForRole('OWNER').map((destination) => destination.route);
    const baseIds = getPrimaryDestinationsForRole('OWNER').map((destination) => destination.id);

    for (const locale of SUPPORTED_LOCALES) {
      await mobileLocalizationRuntime.i18n.changeLanguage(locale);
      const ownerDestinations = getPrimaryDestinationsForRole('OWNER');
      const copies = ownerDestinations.map((destination) =>
        resolvePrimaryDestinationCopy(destination, (key, options) => mobileLocalizationRuntime.i18n.t(key, options)),
      );

      expect(ownerDestinations.map((destination) => destination.route)).toEqual(baseRoutes);
      expect(ownerDestinations.map((destination) => destination.id)).toEqual(baseIds);
      expect(copies.map((copy) => copy.tabLabel).every((label) => label.length > 0)).toBe(true);
      expect(copies.map((copy) => copy.accessibilityLabel).every((label) => label.length > 0)).toBe(true);
      expect(copies.map((copy) => copy.tabLabel)).not.toEqual(baseIds);
    }
  });

  it('updates translated labels when the language changes at runtime', async () => {
    const recordDestination = getPrimaryDestinationsForRole('OWNER').find((destination) => destination.id === 'record');
    if (!recordDestination) {
      throw new Error('Missing record destination');
    }

    await mobileLocalizationRuntime.i18n.changeLanguage('en');
    const englishCopy = resolvePrimaryDestinationCopy(
      recordDestination,
      (key, options) => mobileLocalizationRuntime.i18n.t(key, options),
    );

    await mobileLocalizationRuntime.i18n.changeLanguage('de');
    const germanCopy = resolvePrimaryDestinationCopy(
      recordDestination,
      (key, options) => mobileLocalizationRuntime.i18n.t(key, options),
    );

    expect(englishCopy.tabLabel).toBe('Record');
    expect(germanCopy.tabLabel).toBe('Erfassen');
    expect(germanCopy.accessibilityLabel).toContain('Tab');
  });
});
