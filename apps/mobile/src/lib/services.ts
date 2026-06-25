/**
 * Mobile API helpers for barbershop services.
 */
import { localizeUnknownError } from '@/i18n/errors.js';
import { api, type ApiResponse, type GetToken } from './api.js';
import type { CreateServiceInput, Service, UpdateServiceInput } from './types.js';

/**
 * Options for fetching barbershop services.
 */
export interface FetchServicesOptions {
  /** When true, includes inactive services (default: false for backward compat). */
  includeInactive?: boolean;
}

/**
 * Fetches services for a barbershop (OWNER view).
 *
 * GET /barbershops/:barbershopId/services?includeInactive=true
 * Requires OWNER role on the backend.
 */
export async function fetchBarbershopServices(
  getToken: GetToken,
  barbershopId: string,
  options: FetchServicesOptions = {},
): Promise<Service[]> {
  const token = await getToken();
  const params: Record<string, string> = {};
  if (options.includeInactive) {
    params.includeInactive = 'true';
  }
  const response = await api.get<ApiResponse<Service[]>>(
    `/barbershops/${barbershopId}/services`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params,
    },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch services'));
  }

  return data.data;
}

/**
 * Creates a new service for a barbershop (OWNER only).
 *
 * POST /barbershops/:barbershopId/services
 */
export async function createBarbershopService(
  getToken: GetToken,
  barbershopId: string,
  input: CreateServiceInput,
): Promise<Service> {
  const token = await getToken();
  const response = await api.post<ApiResponse<Service>>(
    `/barbershops/${barbershopId}/services`,
    input,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to create service'));
  }

  return data.data;
}

/**
 * Updates an existing service (OWNER only).
 *
 * PATCH /barbershops/:barbershopId/services/:serviceId
 */
export async function updateBarbershopService(
  getToken: GetToken,
  barbershopId: string,
  serviceId: string,
  input: UpdateServiceInput,
): Promise<Service> {
  const token = await getToken();
  const response = await api.patch<ApiResponse<Service>>(
    `/barbershops/${barbershopId}/services/${serviceId}`,
    input,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to update service'));
  }

  return data.data;
}
