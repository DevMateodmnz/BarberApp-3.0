/**
 * Mobile API helpers for appointments.
 */
import { localizeUnknownError } from '@/i18n/errors.js';
import { ApiError, api, type ApiResponse, type GetToken } from './api.js';
import type {
  Appointment,
  AppointmentAvailability,
  AppointmentStatus,
  CreateStaffAppointmentInput,
  FetchAppointmentAvailabilityInput,
} from './types.js';

export interface AppointmentListQuery {
  date?: string;
  limit?: number;
  offset?: number;
}

function trimOptionalText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function ensureSuccess<T>(
  response: { data: ApiResponse<T>; status: number },
  fallbackMessage: string
): T {
  const { data, status } = response;

  if (!data.success || data.data === undefined) {
    throw new ApiError(
      data.error?.message ?? fallbackMessage,
      data.error?.code,
      status,
    );
  }

  return data.data;
}

/**
 * Fetches all appointments for the current user based on role.
 *
 * GET /appointments
 * Supported by the backend for OWNER and CLIENT roles.
 */
export async function fetchAppointments(
  getToken: GetToken,
  query?: AppointmentListQuery,
): Promise<Appointment[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<Appointment[]>>(
    '/appointments',
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: query,
    },
  );

  return ensureSuccess(
    response,
    localizeUnknownError('Failed to fetch appointments'),
  );
}

/**
 * Fetches appointments for a specific employee (BARBER view).
 *
 * GET /barbershops/:barbershopId/employees/:employeeId/appointments
 * Used by OWNER and BARBER on the scoped employee appointments route.
 */
export async function fetchEmployeeAppointments(
  getToken: GetToken,
  barbershopId: string,
  employeeId: string,
  query?: AppointmentListQuery,
): Promise<Appointment[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<Appointment[]>>(
    `/barbershops/${barbershopId}/employees/${employeeId}/appointments`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: query,
    },
  );

  return ensureSuccess(
    response,
    localizeUnknownError('Failed to fetch employee appointments'),
  );
}

/**
 * Transitions an appointment to a new status.
 *
 * PUT /appointments/:appointmentId/status
 * Body: { status: AppointmentStatus }
 * Returns the full Appointment with nested includes.
 */
export async function transitionAppointmentStatus(
  getToken: GetToken,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<Appointment> {
  const token = await getToken();
  const response = await api.put<ApiResponse<Appointment>>(
    `/appointments/${appointmentId}/status`,
    { status },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to update appointment status'));
  }

  return data.data;
}

/**
 * Cancels (deletes) an appointment.
 *
 * DELETE /appointments/:appointmentId
 * Response returns Appointment WITHOUT nested includes — refetch after call.
 */
export async function cancelAppointment(
  getToken: GetToken,
  appointmentId: string,
): Promise<Appointment> {
  const token = await getToken();
  const response = await api.delete<ApiResponse<Appointment>>(
    `/appointments/${appointmentId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(localizeUnknownError(data.error?.message ?? 'Failed to cancel appointment'));
  }

  return data.data;
}

export async function fetchAppointmentAvailability(
  getToken: GetToken,
  barbershopId: string,
  input: FetchAppointmentAvailabilityInput,
): Promise<AppointmentAvailability> {
  const token = await getToken();
  const response = await api.get<ApiResponse<AppointmentAvailability>>(
    `/barbershops/${barbershopId}/employees/${input.employeeId}/appointments/availability`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: {
        serviceId: input.serviceId,
        localDate: input.localDate,
      },
    },
  );

  return ensureSuccess(response, 'Failed to fetch appointment availability');
}

export async function createStaffAppointment(
  getToken: GetToken,
  barbershopId: string,
  input: CreateStaffAppointmentInput,
): Promise<Appointment> {
  const token = await getToken();
  const payload: CreateStaffAppointmentInput = {
    serviceId: input.serviceId,
    startAt: input.startAt,
    clientName: input.clientName.trim(),
    ...(trimOptionalText(input.clientPhone)
      ? { clientPhone: trimOptionalText(input.clientPhone) }
      : {}),
    ...(trimOptionalText(input.notes) ? { notes: trimOptionalText(input.notes) } : {}),
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
  };

  const response = await api.post<ApiResponse<Appointment>>(
    `/barbershops/${barbershopId}/appointments`,
    payload,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, 'Failed to create appointment');
}
