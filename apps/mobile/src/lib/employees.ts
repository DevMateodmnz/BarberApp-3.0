import { api, type ApiResponse, type GetToken } from './api.js';
import type { EmployeeListItem } from './types.js';

export async function fetchEmployees(
  getToken: GetToken,
  barbershopId: string
): Promise<EmployeeListItem[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<EmployeeListItem[]>>(
    `/barbershops/${barbershopId}/employees`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to fetch employees');
  }

  return data.data;
}
