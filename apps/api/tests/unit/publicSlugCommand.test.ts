import { describe, expect, it } from 'vitest';
import {
  formatPublicSlugProvisioningDatabaseTarget,
  parsePublicSlugProvisioningArgs,
} from '../../src/lib/publicSlugProvisioning.js';

describe('parsePublicSlugProvisioningArgs', () => {
  it('parses slug assignment arguments', () => {
    expect(
      parsePublicSlugProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--slug',
        'Barbería Central',
        '--dry-run',
      ])
    ).toEqual({
      barbershopId: 'shop_123',
      dryRun: true,
      mode: 'assign',
      slugInput: 'Barbería Central',
    });
  });

  it('parses unpublish arguments', () => {
    expect(
      parsePublicSlugProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--unpublish',
      ])
    ).toEqual({
      barbershopId: 'shop_123',
      dryRun: false,
      mode: 'unpublish',
    });
  });

  it('rejects a missing barbershop id', () => {
    expect(() =>
      parsePublicSlugProvisioningArgs(['--slug', 'barberia-central'])
    ).toThrow(/barbershop-id/i);
  });

  it('rejects providing both slug and unpublish', () => {
    expect(() =>
      parsePublicSlugProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--slug',
        'barberia-central',
        '--unpublish',
      ])
    ).toThrow(/exactly one/i);
  });

  it('rejects providing neither slug nor unpublish', () => {
    expect(() =>
      parsePublicSlugProvisioningArgs(['--barbershop-id', 'shop_123'])
    ).toThrow(/exactly one/i);
  });

  it('rejects unknown flags', () => {
    expect(() =>
      parsePublicSlugProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--slug',
        'barberia-central',
        '--wat',
      ])
    ).toThrow(/unknown argument/i);
  });

  it('rejects missing flag values', () => {
    expect(() =>
      parsePublicSlugProvisioningArgs(['--barbershop-id'])
    ).toThrow(/requires a value/i);
  });

  it('rejects empty slug values', () => {
    expect(() =>
      parsePublicSlugProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--slug',
        '   ',
      ])
    ).toThrow(/empty/i);
  });
});

describe('formatPublicSlugProvisioningDatabaseTarget', () => {
  it('masks credentials while preserving enough operator context', () => {
    expect(
      formatPublicSlugProvisioningDatabaseTarget(
        'postgresql://postgres:postgres@localhost:5433/barberapp_test'
      )
    ).toBe('postgresql://localhost:5433/barberapp_test');
  });
});
