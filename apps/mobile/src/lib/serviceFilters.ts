/**
 * Pure helpers for filtering service lists on the mobile client.
 *
 * No API calls — operates on already-loaded Service[] data.
 */
import type { Service } from './types.js';

export type ServiceStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

export interface ServiceStatusCounts {
  ACTIVE: number;
  INACTIVE: number;
  ALL: number;
}

export const SERVICE_STATUS_FILTERS: readonly ServiceStatusFilter[] = [
  'ACTIVE',
  'INACTIVE',
  'ALL',
] as const;

/**
 * Filters a list of services by their isActive status.
 *
 * - 'ACTIVE'  → only services where isActive === true
 * - 'INACTIVE' → only services where isActive === false
 * - 'ALL'      → all services (no filter)
 */
export function filterServicesByStatus(
  services: readonly Service[],
  filter: ServiceStatusFilter,
): Service[] {
  switch (filter) {
    case 'ACTIVE':
      return services.filter((s) => s.isActive);
    case 'INACTIVE':
      return services.filter((s) => !s.isActive);
    case 'ALL':
      return [...services];
  }
}

/**
 * Counts services by their isActive status from the full loaded array.
 *
 * Returns { ACTIVE, INACTIVE, ALL } where ALL is the total length.
 */
export function getServiceStatusCounts(
  services: readonly Service[],
): ServiceStatusCounts {
  let active = 0;
  let inactive = 0;

  for (const s of services) {
    if (s.isActive) {
      active++;
    } else {
      inactive++;
    }
  }

  return {
    ACTIVE: active,
    INACTIVE: inactive,
    ALL: active + inactive,
  };
}

/**
 * Filters a list of services by name search query.
 *
 * - Case-insensitive substring match on service.name.
 * - Trims leading/trailing whitespace from the query.
 * - Empty or whitespace-only query returns all services unchanged.
 */
export function filterServicesByName(
  services: readonly Service[],
  query: string,
): Service[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [...services];

  const lower = trimmed.toLowerCase();
  return services.filter((s) => s.name.toLowerCase().includes(lower));
}
