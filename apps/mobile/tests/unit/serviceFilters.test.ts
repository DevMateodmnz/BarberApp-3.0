/**
 * Unit tests for service filters — PR-049A
 */
import { describe, it, expect } from 'vitest';
import { filterServicesByStatus, filterServicesByName, getServiceStatusCounts } from '../../src/lib/serviceFilters.js';
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

describe('getServiceStatusCounts', () => {
  it('returns correct counts for mixed active/inactive services', () => {
    const result = getServiceStatusCounts(allServices);
    expect(result).toEqual({ ACTIVE: 2, INACTIVE: 2, ALL: 4 });
  });

  it('returns zero counts for empty services array', () => {
    const result = getServiceStatusCounts([]);
    expect(result).toEqual({ ACTIVE: 0, INACTIVE: 0, ALL: 0 });
  });

  it('returns all services as active when every one is active', () => {
    const result = getServiceStatusCounts([activeA, activeB]);
    expect(result).toEqual({ ACTIVE: 2, INACTIVE: 0, ALL: 2 });
  });

  it('returns all services as inactive when every one is inactive', () => {
    const result = getServiceStatusCounts([inactiveC, inactiveD]);
    expect(result).toEqual({ ACTIVE: 0, INACTIVE: 2, ALL: 2 });
  });
});

describe('filterServicesByName', () => {
  it('empty query returns all provided services', () => {
    expect(filterServicesByName(allServices, '')).toEqual(allServices);
  });

  it('whitespace-only query returns all provided services', () => {
    expect(filterServicesByName(allServices, '   ')).toEqual(allServices);
  });

  it('matches service name case-insensitively', () => {
    const result = filterServicesByName(allServices, 'SERVICE A');
    expect(result).toEqual([activeA]);
  });

  it('partial substring match works', () => {
    const result = filterServicesByName(allServices, 'erv');
    expect(result).toEqual(allServices);
  });

  it('query with no matches returns empty array', () => {
    expect(filterServicesByName(allServices, 'zzz')).toEqual([]);
  });

  it('combines with ACTIVE filter to return only matching active services', () => {
    const result = filterServicesByName(
      filterServicesByStatus(allServices, 'ACTIVE'),
      'Service',
    );
    expect(result).toEqual([activeA, activeB]);
  });

  it('combines with INACTIVE filter to return only matching inactive services', () => {
    const result = filterServicesByName(
      filterServicesByStatus(allServices, 'INACTIVE'),
      'Service',
    );
    expect(result).toEqual([inactiveC, inactiveD]);
  });

  it('combines with ALL filter to return all matching services', () => {
    const result = filterServicesByName(
      filterServicesByStatus(allServices, 'ALL'),
      'Service c',
    );
    expect(result).toEqual([inactiveC]);
  });
});
