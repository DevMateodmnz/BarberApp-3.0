/**
 * Pure helpers for filtering service lists on the mobile client.
 *
 * No API calls — operates on already-loaded Service[] data.
 */
import type { Service } from './types.js';

export type ServiceStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

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
