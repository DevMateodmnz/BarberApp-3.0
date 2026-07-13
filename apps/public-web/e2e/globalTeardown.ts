import {
  cleanupAllPublicBookingE2eFixtures,
} from '../../api/tests/support/publicBookingE2eFixture';
import {
  clearState,
  stopPostgresTestIfStarted,
} from './support/orchestration';

export default async function globalTeardown() {
  await cleanupAllPublicBookingE2eFixtures();
  await stopPostgresTestIfStarted();
  clearState();
}
