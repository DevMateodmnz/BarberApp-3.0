import { PrismaClient } from '@prisma/client';
import {
  formatScheduleExceptionProvisioningDatabaseTarget,
  parseScheduleExceptionProvisioningArgs,
} from '../lib/scheduleExceptionProvisioning.js';
import { provisionBarbershopScheduleException } from '../services/scheduleExceptionProvisioningService.js';

function formatOperationalIntervals(
  intervals: Array<{ openTime: string; closeTime: string; position: number }>
): string {
  if (intervals.length === 0) {
    return 'none';
  }

  return intervals.map((interval) => `${interval.openTime}-${interval.closeTime}`).join(', ');
}

function formatOperationalResult(
  result: Awaited<ReturnType<typeof provisionBarbershopScheduleException>>
): string {
  return [
    `Barbershop: ${result.barbershopName} (${result.barbershopId})`,
    `Timezone: ${result.timezone}`,
    `Local date: ${result.localDate}`,
    `Mode: ${result.mode}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Previous status: ${result.previousStatus}`,
    `Previous intervals: ${formatOperationalIntervals(result.previousIntervals)}`,
    `Next status: ${result.nextStatus}`,
    `Next intervals: ${formatOperationalIntervals(result.nextIntervals)}`,
    `Changed: ${result.changed ? 'yes' : 'no'}`,
  ].join('\n');
}

async function main() {
  const args = parseScheduleExceptionProvisioningArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required for schedule exception provisioning');
  }

  process.stdout.write(
    `Target environment: ${process.env.NODE_ENV ?? 'development'}\n`
  );
  process.stdout.write(
    `Target database: ${formatScheduleExceptionProvisioningDatabaseTarget(databaseUrl)}\n`
  );

  const prisma = new PrismaClient();

  try {
    const result = await provisionBarbershopScheduleException(args, prisma);
    process.stdout.write(`${formatOperationalResult(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown schedule exception provisioning failure';
  process.stderr.write(`Schedule exception provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
