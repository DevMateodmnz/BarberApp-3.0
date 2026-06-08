/**
 * Unit tests for service filters — PR-049A
 */
import { describe, it, expect } from 'vitest';
import { filterServicesByStatus } from '../../src/lib/serviceFilters.js';
import type { Service } from '../../src/lib/types.js';

function svc(id: string, isActive: boolean): Service {
  return {
    id,
    name: `Service ${id}`,
    durationMinutes: 30,
    priceCents: 1000,
    currency: 'ARS',
    isActive,
    description: null,
  };
}

const activeA = svc('a', true);
const activeB = svc('b', true);
const inactiveC = svc('c', false);
const inactiveD = svc('d', false);
const allServices: Service[] = [activeA, inactiveC, activeB, inactiveD];

describe('filterServicesByStatus', () => {
  it('ACTIVE returns only active services', () => {
    const result = filterServicesByStatus(allServices, 'ACTIVE');
    expect(result).toEqual([activeA, activeB]);
  });

  it('INACTIVE returns only inactive services', () => {
    const result = filterServicesByStatus(allServices, 'INACTIVE');
    expect(result).toEqual([inactiveC, inactiveD]);
  });

  it('ALL returns all services unchanged', () => {
    const result = filterServicesByStatus(allServices, 'ALL');
    expect(result).toEqual(allServices);
  });

  it('ACTIVE on empty array returns empty', () => {
    expect(filterServicesByStatus([], 'ACTIVE')).toEqual([]);
  });

  it('INACTIVE on empty array returns empty', () => {
    expect(filterServicesByStatus([], 'INACTIVE')).toEqual([]);
  });

  it('ALL on empty array returns empty', () => {
    expect(filterServicesByStatus([], 'ALL')).toEqual([]);
  });

  it('ACTIVE on all-inactive returns empty', () => {
    expect(filterServicesByStatus([inactiveC, inactiveD], 'ACTIVE')).toEqual([]);
  });

  it('INACTIVE on all-active returns empty', () => {
    expect(filterServicesByStatus([activeA, activeB], 'INACTIVE')).toEqual([]);
  });
});
