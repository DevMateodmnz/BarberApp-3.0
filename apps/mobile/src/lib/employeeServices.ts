import { api, type ApiResponse, type GetToken } from './api.js';
import type { Service } from './types.js';
import { localizeUnknownError } from '@/i18n/errors.js';

export async function fetchEmployeeServices(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string
): Promise<Service[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<Service[]>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/services`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch employee services'));
  }

  return data.data;
}

export async function fetchMyAssignedServices(
  getToken: GetToken,
  barbershopId: string
): Promise<Service[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<Service[]>>(
    `/barbershops/${barbershopId}/me/services`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch assigned services'));
  }

  return data.data;
}

/**
 * Assigns a service to an employee. OWNER only.
 *
 * POST /barbershops/:barbershopId/employees/:employeeId/services
 */
export async function assignEmployeeService(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  serviceId: string,
): Promise<void> {
  const token = await getToken();
  const response = await api.post<ApiResponse<unknown>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/services`,
    { serviceId },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to assign service'));
  }
}

/**
 * Unassigns a service from an employee. OWNER only.
 *
 * DELETE /barbershops/:barbershopId/employees/:employeeId/services/:serviceId
 */
export async function unassignEmployeeService(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  serviceId: string,
): Promise<void> {
  const token = await getToken();
  const response = await api.delete<ApiResponse<{ message: string }>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/services/${serviceId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to unassign service'));
  }
}
