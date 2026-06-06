/**
 * Summary fetchers — call backend daily summary endpoints.
 *
 * OWNER: GET /barbershops/:id/service-records/summary?date=
 * BARBER: GET /barbershops/:id/employees/:empId/service-records/summary?date=
 */
import { api, type ApiResponse, type GetToken } from './api.js';
import type { BarbershopDailySummary, EmployeeDailySummary } from './types.js';

/**
 * Fetches the OWNER's barbershop daily summary.
 *
 * @param getToken - Clerk's getToken function.
 * @param barbershopId - The barbershop ID from /me/context.
 * @param date - Date string in YYYY-MM-DD format.
 */
export async function fetchBarbershopDailySummary(
  getToken: GetToken,
  barbershopId: string,
  date: string
): Promise<BarbershopDailySummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<BarbershopDailySummary>>(
    `/barbershops/${barbershopId}/service-records/summary?date=${date}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to fetch barbershop summary');
  }
  return data.data;
}

/**
 * Fetches the BARBER's employee daily summary.
 *
 * @param getToken - Clerk's getToken function.
 * @param barbershopId - The barbershop ID from /me/context.
 * @param employeeId - The employee ID from /me/context.
 * @param date - Date string in YYYY-MM-DD format.
 */
export async function fetchEmployeeDailySummary(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  date: string
): Promise<EmployeeDailySummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<EmployeeDailySummary>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/service-records/summary?date=${date}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to fetch employee summary');
  }
  return data.data;
}