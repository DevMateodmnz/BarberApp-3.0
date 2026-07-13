import { PrismaClient } from '@prisma/client';
import {
  formatPublicSlugProvisioningDatabaseTarget,
  parsePublicSlugProvisioningArgs,
} from '../lib/publicSlugProvisioning.js';
import { provisionBarbershopPublicSlug } from '../services/publicSlugProvisioningService.js';

function formatOperationalResult(
  result: Awaited<ReturnType<typeof provisionBarbershopPublicSlug>>
): string {
  return [
    `Barbershop: ${result.barbershopName} (${result.barbershopId})`,
    `Mode: ${result.mode}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Previous public slug: ${result.previousPublicSlug ?? 'null'}`,
    `Canonical public slug: ${result.normalizedSlug ?? 'null'}`,
    `Next public slug: ${result.nextPublicSlug ?? 'null'}`,
    `Changed: ${result.changed ? 'yes' : 'no'}`,
  ].join('\n');
}

async function main() {
  const args = parsePublicSlugProvisioningArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required for public slug provisioning');
  }

  process.stdout.write(
    `Target environment: ${process.env.NODE_ENV ?? 'development'}\n`
  );
  process.stdout.write(
    `Target database: ${formatPublicSlugProvisioningDatabaseTarget(databaseUrl)}\n`
  );

  const prisma = new PrismaClient();

  try {
    const result = await provisionBarbershopPublicSlug(args, prisma);
    process.stdout.write(`${formatOperationalResult(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown public slug failure';
  process.stderr.write(`Public slug provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
