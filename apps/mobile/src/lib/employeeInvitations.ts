import { ApiError, api, type ApiResponse, type GetToken } from './api.js';
import { normalizeEmployeeInvitationEmail } from './employeeInvitationDomain.js';
import type {
  EmployeeInvitation,
  EmployeeInvitationCreateOutcome,
  EmployeeInvitationReconciliationResult,
} from './types.js';

function buildAuthHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function createEmployeeInvitation(
  getToken: GetToken,
  barbershopId: string,
  email: string
): Promise<EmployeeInvitationCreateOutcome> {
  const token = await getToken();
  const response = await api.post<ApiResponse<EmployeeInvitationCreateOutcome>>(
    `/barbershops/${barbershopId}/employee-invitations`,
    { email: normalizeEmployeeInvitationEmail(email) },
    { headers: buildAuthHeaders(token) },
  );

  const { data, status } = response;
  if (!data.success || !data.data) {
    throw new ApiError(
      data.error?.message ?? 'Failed to create employee invitation',
      data.error?.code,
      status,
    );
  }

  return data.data;
}

export async function fetchEmployeeInvitations(
  getToken: GetToken,
  barbershopId: string
): Promise<EmployeeInvitation[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<EmployeeInvitation[]>>(
    `/barbershops/${barbershopId}/employee-invitations`,
    { headers: buildAuthHeaders(token) },
  );

  const { data, status } = response;
  if (!data.success || !data.data) {
    throw new ApiError(
      data.error?.message ?? 'Failed to fetch employee invitations',
      data.error?.code,
      status,
    );
  }

  return data.data;
}

export async function resendEmployeeInvitation(
  getToken: GetToken,
  barbershopId: string,
  invitationId: string
): Promise<EmployeeInvitation> {
  const token = await getToken();
  const response = await api.post<ApiResponse<EmployeeInvitation>>(
    `/barbershops/${barbershopId}/employee-invitations/${invitationId}/resend`,
    undefined,
    { headers: buildAuthHeaders(token) },
  );

  const { data, status } = response;
  if (!data.success || !data.data) {
    throw new ApiError(
      data.error?.message ?? 'Failed to resend employee invitation',
      data.error?.code,
      status,
    );
  }

  return data.data;
}

export async function revokeEmployeeInvitation(
  getToken: GetToken,
  barbershopId: string,
  invitationId: string
): Promise<EmployeeInvitation> {
  const token = await getToken();
  const response = await api.delete<ApiResponse<EmployeeInvitation>>(
    `/barbershops/${barbershopId}/employee-invitations/${invitationId}`,
    { headers: buildAuthHeaders(token) },
  );

  const { data, status } = response;
  if (!data.success || !data.data) {
    throw new ApiError(
      data.error?.message ?? 'Failed to revoke employee invitation',
      data.error?.code,
      status,
    );
  }

  return data.data;
}

export async function reconcileEmployeeInvitationOnboarding(
  getToken: GetToken
): Promise<EmployeeInvitationReconciliationResult> {
  const token = await getToken();
  const response = await api.post<ApiResponse<EmployeeInvitationReconciliationResult>>(
    '/onboarding/employee-invitations/reconcile',
    undefined,
    { headers: buildAuthHeaders(token) },
  );

  const { data, status } = response;
  if (!data.success || !data.data) {
    throw new ApiError(
      data.error?.message ?? 'Failed to reconcile employee invitation onboarding',
      data.error?.code,
      status,
    );
  }

  return data.data;
}
