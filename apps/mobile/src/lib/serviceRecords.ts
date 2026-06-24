import { api, type ApiResponse, type GetToken } from './api.js';
import type { CreateServiceRecordInput, ServiceRecord } from './types.js';
import { localizeUnknownError } from '@/i18n/errors.js';

export async function createServiceRecord(
  getToken: GetToken,
  barbershopId: string,
  input: CreateServiceRecordInput
): Promise<ServiceRecord> {
  const token = await getToken();
  const response = await api.post<ApiResponse<ServiceRecord>>(
    `/barbershops/${barbershopId}/service-records`,
    input,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to create service record'));
  }

  return data.data;
}

/**
 * Fetches service records for a barbershop on a given date (OWNER view).
 *
 * GET /barbershops/:barbershopId/service-records?date=YYYY-MM-DD
 */
export async function fetchBarbershopRecords(
  getToken: GetToken,
  barbershopId: string,
  date: string,
): Promise<ServiceRecord[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<ServiceRecord[]>>(
    `/barbershops/${barbershopId}/service-records`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: { date },
    },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch service records'));
  }

  return data.data;
}

/**
 * Fetches service records for a specific employee on a given date (BARBER view).
 *
 * GET /barbershops/:barbershopId/employees/:employeeId/service-records?date=YYYY-MM-DD
 */
export async function fetchEmployeeRecords(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  date: string,
): Promise<ServiceRecord[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<ServiceRecord[]>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/service-records`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: { date },
    },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch employee records'));
  }

  return data.data;
}
