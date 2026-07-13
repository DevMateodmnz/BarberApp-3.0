import process from 'node:process';
import {
  cleanupAllPublicBookingE2eFixtures,
  cleanupPublicBookingE2eFixture,
  provisionPublicBookingE2eFixture,
} from './publicBookingE2eFixture';

async function main() {
  const mode = process.argv[2];
  const key = process.argv[3];

  if (mode === 'setup') {
    if (!key) {
      throw new Error('setup mode requires a deterministic fixture key');
    }

    const fixture = await provisionPublicBookingE2eFixture(key);
    console.log(JSON.stringify(fixture));
    return;
  }

  if (mode === 'cleanup') {
    if (!key) {
      throw new Error('cleanup mode requires a deterministic fixture key');
    }

    await cleanupPublicBookingE2eFixture(key);
    return;
  }

  if (mode === 'cleanup-all') {
    await cleanupAllPublicBookingE2eFixtures();
    return;
  }

  throw new Error(
    'Usage: tsx tests/support/publicBookingE2eFixture.cli.ts <setup|cleanup|cleanup-all> [key]'
  );
}

void main();
