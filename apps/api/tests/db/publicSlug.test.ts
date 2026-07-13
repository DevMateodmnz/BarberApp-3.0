import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  cleanupTestData,
  createTestBarbershop,
  createTestUser,
  prisma,
} from './helpers';
import { createBarbershop } from '../../src/services/barbershopService.js';

describe('Barbershop public slug constraints', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('allows multiple barbershops with null publicSlug values', async () => {
    const first = await createTestBarbershop({ name: 'Null Slug One' });
    const second = await createTestBarbershop({ name: 'Null Slug Two' });

    expect(first.barbershop.publicSlug).toBeNull();
    expect(second.barbershop.publicSlug).toBeNull();
  });

  it('stores one canonical non-null publicSlug', async () => {
    const { user: owner } = await createTestUser({ role: 'OWNER' });

    const shop = await prisma.barbershop.create({
      data: {
        ownerId: owner.id,
        name: 'Canonical Slug Shop',
        publicSlug: 'barberia-central',
      },
    });

    expect(shop.publicSlug).toBe('barberia-central');
  });

  it('rejects duplicate non-null publicSlug values', async () => {
    const firstOwner = await createTestUser({ role: 'OWNER' });
    const secondOwner = await createTestUser({ role: 'OWNER' });

    await prisma.barbershop.create({
      data: {
        ownerId: firstOwner.user.id,
        name: 'First Slug Shop',
        publicSlug: 'los-primos',
      },
    });

    await expect(
      prisma.barbershop.create({
        data: {
          ownerId: secondOwner.user.id,
          name: 'Second Slug Shop',
          publicSlug: 'los-primos',
        },
      })
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects case-variant duplicates outside the service layer', async () => {
    const firstOwner = await createTestUser({ role: 'OWNER' });
    const secondOwner = await createTestUser({ role: 'OWNER' });

    await prisma.barbershop.create({
      data: {
        ownerId: firstOwner.user.id,
        name: 'First Variant Shop',
        publicSlug: 'barberia-central',
      },
    });

    await expect(
      prisma.barbershop.create({
        data: {
          ownerId: secondOwner.user.id,
          name: 'Second Variant Shop',
          publicSlug: 'Barberia-Central',
        },
      })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
  });

  it('rejects invalid noncanonical storage via database constraint', async () => {
    const { user: owner } = await createTestUser({ role: 'OWNER' });

    await expect(
      prisma.barbershop.create({
        data: {
          ownerId: owner.id,
          name: 'Invalid Slug Shop',
          publicSlug: 'barberia--central',
        },
      })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
  });

  it('keeps the existing createBarbershop flow working without a slug', async () => {
    const owner = await createTestUser({ role: 'OWNER' });

    const shop = await createBarbershop({
      ownerId: owner.user.id,
      name: 'Existing Flow Shop',
    });

    expect(shop.publicSlug).toBeNull();
  });

  it('allows slug updates without breaking existing related rows', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Relational Shop' });

    const updated = await prisma.barbershop.update({
      where: { id: barbershop.id },
      data: { publicSlug: 'relational-shop' },
      include: { workingHours: true },
    });

    expect(updated.publicSlug).toBe('relational-shop');
    expect(updated.workingHours).toHaveLength(6);
  });
});
