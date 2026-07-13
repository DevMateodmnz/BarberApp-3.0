import { ensureTestDatabaseReady } from './support/orchestration';

export default async function globalSetup() {
  await ensureTestDatabaseReady();
}
