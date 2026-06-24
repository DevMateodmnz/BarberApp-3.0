import { api, ApiError, type ApiResponse, type GetToken } from './api.js';
import { localizeApiError, localizeUnknownError } from '@/i18n/errors.js';
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
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to fetch employees'));
  }

  return data.data;
}

/**
 * Maps raw API error messages for createEmployee to user-friendly copy.
 *
 * Accepts either a plain string (legacy / unknown errors) or an ApiError
 * object carrying structured code and status fields.
 *
 * Structured matching (by status 404/409 or code NOT_FOUND/CONFLICT) is
 * preferred — it survives backend message rewordings.  Falls back to exact
 * string matching when structure is absent or unrecognised, and finally
 * passes through the raw message for completely unknown errors.
 */
export function friendlyCreateEmployeeError(raw: string | ApiError): string {
  return localizeApiError(raw);
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
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to deactivate employee'));
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
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to reactivate employee'));
  }

  return data.data;
}

/**
 * Creates a new employee by linking an existing user to the barbershop.
 * The user must already exist in the system (via Clerk webhook or seed).
 *
 * Accepts an identifier that can be either a user ID or an email.
 * If the identifier contains '@', it is sent as { email }.
 * Otherwise it is sent as { userId }.
 *
 * POST /barbershops/:barbershopId/employees
 */
export async function createEmployee(
  getToken: GetToken,
  barbershopId: string,
  identifier: string,
): Promise<EmployeeListItem> {
  const body = identifier.includes('@')
    ? { email: identifier.trim().toLowerCase() }
    : { userId: identifier.trim() };

  const token = await getToken();
  const response = await api.post<ApiResponse<EmployeeListItem>>(
    `/barbershops/${barbershopId}/employees`,
    body,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data, status } = response;
  if (!data.success || !data.data) {
    throw new ApiError(
      localizeUnknownError(data.error?.message ?? 'Failed to create employee'),
      data.error?.code,
      status,
    );
  }

  return data.data;
}
