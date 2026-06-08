/**
 * Mobile API helpers for barbershop services.
 */
import { api, type ApiResponse, type GetToken } from './api.js';
import type { Service } from './types.js';

/**
 * Fetches all active services for a barbershop (OWNER view).
 *
 * GET /barbershops/:barbershopId/services
 * Requires OWNER role on the backend.
 */
export async function fetchBarbershopServices(
  getToken: GetToken,
  barbershopId: string,
): Promise<Service[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<Service[]>>(
    `/barbershops/${barbershopId}/services`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to fetch services');
  }

  return data.data;
}
