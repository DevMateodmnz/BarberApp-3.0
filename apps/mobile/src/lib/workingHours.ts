/**
 * Mobile API helpers for barbershop working hours.
 */
import { localizeUnknownError } from '@/i18n/errors.js';
import { api, type ApiResponse, type GetToken } from './api.js';
import type { WorkingHoursDay } from './types.js';

/**
 * Fetches the working hours schedule for a barbershop.
 *
 * GET /barbershops/:barbershopId/working-hours
 * Requires OWNER role on the backend.
 */
export async function fetchWorkingHours(
  getToken: GetToken,
  barbershopId: string,
): Promise<WorkingHoursDay[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<WorkingHoursDay[]>>(
    `/barbershops/${barbershopId}/working-hours`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch working hours'));
  }

  return data.data;
}

/**
 * Updates the working hours schedule for a barbershop.
 * Uses upsert per day — only the days you send are modified.
 *
 * PUT /barbershops/:barbershopId/working-hours
 * Body: { workingHours: WorkingHoursDay[] }
 *
 * Returns the full updated schedule (all days, sorted).
 */
export async function putWorkingHours(
  getToken: GetToken,
  barbershopId: string,
  days: WorkingHoursDay[],
): Promise<WorkingHoursDay[]> {
  const token = await getToken();
  const response = await api.put<ApiResponse<WorkingHoursDay[]>>(
    `/barbershops/${barbershopId}/working-hours`,
    { workingHours: days },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to update working hours'));
  }

  return data.data;
}
