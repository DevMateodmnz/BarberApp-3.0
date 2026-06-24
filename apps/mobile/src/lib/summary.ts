/**
 * Summary fetchers — call backend daily summary endpoints.
 *
 * OWNER: GET /barbershops/:id/service-records/summary?date=
 * BARBER: GET /barbershops/:id/employees/:empId/service-records/summary?date=
 */
import { api, type ApiResponse, type GetToken } from './api.js';
import type { BarbershopDailySummary, EmployeeDailySummary, SummaryQuery } from './types.js';
import { localizeUnknownError } from '@/i18n/errors.js';

function toSummaryParams(query: string | SummaryQuery): Record<string, string> {
  if (typeof query === 'string') {
    return { date: query };
  }

  const params: Record<string, string> = {};
  if (query.date) params.date = query.date;
  if (query.period) params.period = query.period;
  if (query.employeeId) params.employeeId = query.employeeId;
  return params;
}

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
  query: string | SummaryQuery
): Promise<BarbershopDailySummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<BarbershopDailySummary>>(
    `/barbershops/${barbershopId}/service-records/summary`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: toSummaryParams(query),
    }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch barbershop summary'));
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
  query: string | SummaryQuery
): Promise<EmployeeDailySummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<EmployeeDailySummary>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/service-records/summary`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: toSummaryParams(query),
    }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch employee summary'));
  }
  return data.data;
}
