import { api, type ApiResponse, type GetToken } from './api.js';
import type { Service } from './types.js';

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
    throw new Error(data.error?.message ?? 'Failed to fetch employee services');
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
    throw new Error(data.error?.message ?? 'Failed to fetch assigned services');
  }

  return data.data;
}
