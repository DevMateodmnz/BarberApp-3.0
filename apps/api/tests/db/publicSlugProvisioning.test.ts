import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../src/lib/errors.js';
import {
  cleanupTestData,
  createTestBarbershop,
  prisma,
} from './helpers';
import { provisionBarbershopPublicSlug } from '../../src/services/publicSlugProvisioningService.js';

describe('public slug provisioning service', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('assigns a canonical slug to an existing barbershop', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Provision Shop' });

    const result = await provisionBarbershopPublicSlug({
      barbershopId: barbershop.id,
      dryRun: false,
      mode: 'assign',
      slugInput: 'barberia-central',
    });

    expect(result.previousPublicSlug).toBeNull();
    expect(result.nextPublicSlug).toBe('barberia-central');
    expect(result.normalizedSlug).toBe('barberia-central');
    expect(result.changed).toBe(true);

    const persisted = await prisma.barbershop.findUniqueOrThrow({
      where: { id: barbershop.id },
      select: { publicSlug: true },
    });
    expect(persisted.publicSlug).toBe('barberia-central');
  });

  it('normalizes before assignment', async () => {
    const { barbershop } = await createTestBarbershop({
      name: 'Normalized Provision Shop',
    });

    const result = await provisionBarbershopPublicSlug({
      barbershopId: barbershop.id,
      dryRun: false,
      mode: 'assign',
      slugInput: '  Barbería Central  ',
    });

    expect(result.normalizedSlug).toBe('barberia-central');

    const persisted = await prisma.barbershop.findUniqueOrThrow({
      where: { id: barbershop.id },
      select: { publicSlug: true },
    });
    expect(persisted.publicSlug).toBe('barberia-central');
  });

  it('rejects reserved slugs', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Reserved Shop' });

    await expect(
      provisionBarbershopPublicSlug({
        barbershopId: barbershop.id,
        dryRun: false,
        mode: 'assign',
        slugInput: 'api',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects invalid slugs', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Invalid Shop' });

    await expect(
      provisionBarbershopPublicSlug({
        barbershopId: barbershop.id,
        dryRun: false,
        mode: 'assign',
        slugInput: '!!!',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects slug collisions with another barbershop', async () => {
    const { barbershop: first } = await createTestBarbershop({ name: 'First Shop' });
    const { barbershop: second } = await createTestBarbershop({ name: 'Second Shop' });

    await provisionBarbershopPublicSlug({
      barbershopId: first.id,
      dryRun: false,
      mode: 'assign',
      slugInput: 'los-primos',
    });

    await expect(
      provisionBarbershopPublicSlug({
        barbershopId: second.id,
        dryRun: false,
        mode: 'assign',
        slugInput: 'los-primos',
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a missing barbershop id target', async () => {
    await expect(
      provisionBarbershopPublicSlug({
        barbershopId: 'missing-shop-id',
        dryRun: false,
        mode: 'assign',
        slugInput: 'barberia-central',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('dry run validates without persisting', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Dry Run Shop' });

    const result = await provisionBarbershopPublicSlug({
      barbershopId: barbershop.id,
      dryRun: true,
      mode: 'assign',
      slugInput: 'dry-run-shop',
    });

    expect(result.changed).toBe(true);
    expect(result.nextPublicSlug).toBe('dry-run-shop');

    const persisted = await prisma.barbershop.findUniqueOrThrow({
      where: { id: barbershop.id },
      select: { publicSlug: true },
    });
    expect(persisted.publicSlug).toBeNull();
  });

  it('unpublishes by setting publicSlug to null', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Published Shop' });

    await prisma.barbershop.update({
      where: { id: barbershop.id },
      data: { publicSlug: 'published-shop' },
    });

    const result = await provisionBarbershopPublicSlug({
      barbershopId: barbershop.id,
      dryRun: false,
      mode: 'unpublish',
    });

    expect(result.previousPublicSlug).toBe('published-shop');
    expect(result.nextPublicSlug).toBeNull();

    const persisted = await prisma.barbershop.findUniqueOrThrow({
      where: { id: barbershop.id },
      select: { publicSlug: true },
    });
    expect(persisted.publicSlug).toBeNull();
  });

  it('keeps repeated unpublish operations deterministic', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Already Hidden' });

    const result = await provisionBarbershopPublicSlug({
      barbershopId: barbershop.id,
      dryRun: false,
      mode: 'unpublish',
    });

    expect(result.previousPublicSlug).toBeNull();
    expect(result.nextPublicSlug).toBeNull();
    expect(result.changed).toBe(false);
  });
});
