import { localizeUnknownError } from '@/i18n/errors.js';
import { ApiError, api, type ApiResponse, type GetToken } from './api.js';
import type {
  AppointmentNotificationChannel,
  AppointmentNotificationStatus,
  AppointmentNotificationType,
  NotificationOperationsDetail,
  NotificationOperationsListItem,
  NotificationOperationsPage,
  NotificationOperationsSort,
  NotificationOperationsSummary,
} from './types.js';

export interface NotificationOperationsQuery {
  status?: AppointmentNotificationStatus | 'ALL';
  type?: AppointmentNotificationType;
  channel?: AppointmentNotificationChannel;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sort?: NotificationOperationsSort;
}

function ensureSuccess<T>(
  response: { data: ApiResponse<T>; status: number },
  fallbackMessage: string,
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

function buildNotificationQueryParams(query?: NotificationOperationsQuery) {
  if (!query) {
    return undefined;
  }

  return {
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
    ...(query.dateTo ? { dateTo: query.dateTo } : {}),
    ...(query.page ? { page: query.page } : {}),
    ...(query.limit ? { limit: query.limit } : {}),
    ...(query.sort ? { sort: query.sort } : {}),
  };
}

export async function fetchNotificationOperationsSummary(
  getToken: GetToken,
  barbershopId: string,
): Promise<NotificationOperationsSummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<NotificationOperationsSummary>>(
    `/barbershops/${barbershopId}/notifications/summary`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );

  return ensureSuccess(
    response,
    localizeUnknownError('Failed to fetch notification operations summary'),
  );
}

export async function fetchNotificationOperations(
  getToken: GetToken,
  barbershopId: string,
  query?: NotificationOperationsQuery,
): Promise<NotificationOperationsPage> {
  const token = await getToken();
  const response = await api.get<ApiResponse<NotificationOperationsPage>>(
    `/barbershops/${barbershopId}/notifications`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: buildNotificationQueryParams(query),
    },
  );

  return ensureSuccess(
    response,
    localizeUnknownError('Failed to fetch notifications'),
  );
}

export async function fetchNotificationOperationsDetail(
  getToken: GetToken,
  barbershopId: string,
  notificationId: string,
): Promise<NotificationOperationsDetail> {
  const token = await getToken();
  const response = await api.get<ApiResponse<NotificationOperationsDetail>>(
    `/barbershops/${barbershopId}/notifications/${notificationId}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );

  return ensureSuccess(
    response,
    localizeUnknownError('Failed to fetch notification detail'),
  );
}

export async function retryNotificationDelivery(
  getToken: GetToken,
  barbershopId: string,
  notificationId: string,
) : Promise<NotificationOperationsListItem> {
  const token = await getToken();
  const response = await api.post<ApiResponse<NotificationOperationsListItem>>(
    `/barbershops/${barbershopId}/notifications/${notificationId}/retry`,
    {},
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );

  return ensureSuccess(
    response,
    localizeUnknownError('Failed to retry notification delivery'),
  );
}
