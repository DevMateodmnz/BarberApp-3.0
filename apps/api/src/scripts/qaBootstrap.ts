import { PrismaClient } from '@prisma/client';

import {
  assertSafeLocalDatabaseUrl,
  getLocalQaConfigPath,
  loadEnvFileIfPresent,
  readQaBootstrapConfig,
} from '../lib/qaBootstrap.js';
import {
  bootstrapLocalQaAccounts,
  formatQaBootstrapResult,
} from '../services/qaBootstrapService.js';

async function main() {
  loadEnvFileIfPresent(getLocalQaConfigPath());

  const config = readQaBootstrapConfig();
  assertSafeLocalDatabaseUrl(config.databaseUrl, config.allowNonLocalDatabase);

  const prisma = new PrismaClient();

  try {
    const result = await bootstrapLocalQaAccounts(prisma, config);
    process.stdout.write('QA bootstrap completed successfully.\n');
    process.stdout.write(`${formatQaBootstrapResult(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown QA bootstrap failure';
  process.stderr.write(`QA bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
