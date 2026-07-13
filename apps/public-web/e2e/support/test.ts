import { createHash } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import {
  cleanupPublicBookingE2eFixture,
  provisionPublicBookingE2eFixture,
  type PublicBookingE2eFixture,
} from '../../../api/tests/support/publicBookingE2eFixture';

function buildFixtureKey(titlePath: string[]) {
  const hash = createHash('sha1').update(titlePath.join(' > ')).digest('hex');
  return `playwright-${hash.slice(0, 12)}`;
}

export const test = base.extend<{
  bookingFixture: PublicBookingE2eFixture;
}>({
  // eslint-disable-next-line no-empty-pattern
  bookingFixture: async ({}, use, testInfo) => {
    const fixtureKey = buildFixtureKey(testInfo.titlePath);
    const fixture = await provisionPublicBookingE2eFixture(fixtureKey);

    try {
      await use(fixture);
    } finally {
      await cleanupPublicBookingE2eFixture(fixtureKey);
    }
  },
});

export { expect };
