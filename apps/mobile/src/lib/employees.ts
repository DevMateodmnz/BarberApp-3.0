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

/**
 * Deactivates an employee (soft-delete). OWNER only.
 *
 * DELETE /barbershops/:barbershopId/employees/:employeeId
 */
export async function deactivateEmployee(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
): Promise<void> {
  const token = await getToken();
  const response = await api.delete<ApiResponse<{ message: string }>>(
    `/barbershops/${barbershopId}/employees/${employeeId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success) {
    throw new Error(data.error?.message ?? 'Failed to deactivate employee');
  }
}

/**
 * Reactivates a previously deactivated employee. OWNER only.
 *
 * PATCH /barbershops/:barbershopId/employees/:employeeId/reactivate
 */
export async function reactivateEmployee(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
): Promise<EmployeeListItem> {
  const token = await getToken();
  const response = await api.patch<ApiResponse<EmployeeListItem>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/reactivate`,
    undefined,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to reactivate employee');
  }

  return data.data;
}
