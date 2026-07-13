import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { normalizePublicSlug } from '../lib/publicSlug.js';

type PublicSlugProvisioningDatabase = Pick<
  PrismaClient,
  'barbershop'
>;

export type ProvisionBarbershopPublicSlugInput =
  | {
      barbershopId: string;
      dryRun: boolean;
      mode: 'assign';
      slugInput: string;
    }
  | {
      barbershopId: string;
      dryRun: boolean;
      mode: 'unpublish';
    };

export interface ProvisionBarbershopPublicSlugResult {
  barbershopId: string;
  barbershopName: string;
  changed: boolean;
  dryRun: boolean;
  mode: 'assign' | 'unpublish';
  nextPublicSlug: string | null;
  normalizedSlug: string | null;
  previousPublicSlug: string | null;
}

export async function provisionBarbershopPublicSlug(
  input: ProvisionBarbershopPublicSlugInput,
  db: PublicSlugProvisioningDatabase = prisma
): Promise<ProvisionBarbershopPublicSlugResult> {
  const barbershop = await db.barbershop.findUnique({
    where: { id: input.barbershopId },
    select: {
      id: true,
      name: true,
      publicSlug: true,
    },
  });

  if (!barbershop) {
    throw new NotFoundError('Barbershop');
  }

  if (input.mode === 'unpublish') {
    const changed = barbershop.publicSlug !== null;

    if (changed && !input.dryRun) {
      await db.barbershop.update({
        where: { id: barbershop.id },
        data: { publicSlug: null },
      });
    }

    return {
      barbershopId: barbershop.id,
      barbershopName: barbershop.name,
      changed,
      dryRun: input.dryRun,
      mode: 'unpublish',
      nextPublicSlug: null,
      normalizedSlug: null,
      previousPublicSlug: barbershop.publicSlug,
    };
  }

  const normalizedSlug = normalizePublicSlug(input.slugInput);
  const collision = await db.barbershop.findFirst({
    where: {
      id: { not: barbershop.id },
      publicSlug: normalizedSlug,
    },
    select: { id: true },
  });

  if (collision) {
    throw new ConflictError(
      'Public slug is already assigned to another barbershop'
    );
  }

  const changed = barbershop.publicSlug !== normalizedSlug;

  if (changed && !input.dryRun) {
    await db.barbershop.update({
      where: { id: barbershop.id },
      data: { publicSlug: normalizedSlug },
    });
  }

  return {
    barbershopId: barbershop.id,
    barbershopName: barbershop.name,
    changed,
    dryRun: input.dryRun,
    mode: 'assign',
    nextPublicSlug: normalizedSlug,
    normalizedSlug,
    previousPublicSlug: barbershop.publicSlug,
  };
}
