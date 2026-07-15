import { localizeUnknownError } from '@/i18n/errors.js';
import { api, type ApiResponse, type GetToken } from './api.js';
import type { EmployeeScheduleDetail } from './types.js';

export interface UpdateEmployeeSchedulePayload {
  mode: 'INHERIT_BARBERSHOP' | 'CUSTOM';
  weeklyIntervals: Array<{
    dayOfWeek: number;
    start: string;
    end: string;
  }>;
  expectedUpdatedAt?: string;
}

export interface UpsertEmployeeScheduleExceptionPayload {
  type: 'FULL_DAY_OFF' | 'CUSTOM_HOURS';
  reason?: string;
  intervals?: Array<{
    start: string;
    end: string;
  }>;
}

function unwrapResponse(data: ApiResponse<EmployeeScheduleDetail>, fallback: string): EmployeeScheduleDetail {
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? fallback));
  }

  return data.data;
}

export async function fetchEmployeeSchedule(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
): Promise<EmployeeScheduleDetail> {
  const token = await getToken();
  const response = await api.get<ApiResponse<EmployeeScheduleDetail>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/schedule`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return unwrapResponse(response.data, 'Failed to fetch employee schedule');
}

export async function putEmployeeSchedule(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  payload: UpdateEmployeeSchedulePayload,
): Promise<EmployeeScheduleDetail> {
  const token = await getToken();
  const response = await api.put<ApiResponse<EmployeeScheduleDetail>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/schedule`,
    payload,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return unwrapResponse(response.data, 'Failed to update employee schedule');
}

export async function putEmployeeScheduleException(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  localDate: string,
  payload: UpsertEmployeeScheduleExceptionPayload,
): Promise<EmployeeScheduleDetail> {
  const token = await getToken();
  const response = await api.put<ApiResponse<EmployeeScheduleDetail>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/schedule/exceptions/${localDate}`,
    payload,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return unwrapResponse(response.data, 'Failed to update employee schedule exception');
}

export async function deleteEmployeeScheduleException(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  localDate: string,
): Promise<EmployeeScheduleDetail> {
  const token = await getToken();
  const response = await api.delete<ApiResponse<EmployeeScheduleDetail>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/schedule/exceptions/${localDate}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return unwrapResponse(response.data, 'Failed to delete employee schedule exception');
}
