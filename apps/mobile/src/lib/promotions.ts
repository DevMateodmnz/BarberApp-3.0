import { localizeUnknownError } from '@/i18n/errors.js';
import { api, ApiError, type ApiResponse, type GetToken } from './api.js';
import type {
  CreatePromotionInput,
  PromotionDetail,
  PromotionListItem,
  PromotionRedemptionPage,
  PromotionRedemptionStatus,
  PromotionSummary,
  StaffPromotionQuote,
  UpdatePromotionInput,
} from './types.js';

function ensureSuccess<T>(
  response: { data: ApiResponse<T>; status: number },
  fallbackMessage: string,
): T {
  const { data, status } = response;

  if (!data.success || data.data === undefined) {
    throw new ApiError(data.error?.message ?? fallbackMessage, data.error?.code, status);
  }

  return data.data;
}

export async function fetchPromotionSummary(
  getToken: GetToken,
  barbershopId: string,
): Promise<PromotionSummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PromotionSummary>>(
    `/barbershops/${barbershopId}/promotions/summary`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to fetch promotion summary'));
}

export async function fetchPromotions(
  getToken: GetToken,
  barbershopId: string,
): Promise<PromotionListItem[]> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PromotionListItem[]>>(
    `/barbershops/${barbershopId}/promotions`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to fetch promotions'));
}

export async function fetchPromotionDetail(
  getToken: GetToken,
  barbershopId: string,
  promotionId: string,
): Promise<PromotionDetail> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PromotionDetail>>(
    `/barbershops/${barbershopId}/promotions/${promotionId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to fetch promotion detail'));
}

export async function createPromotion(
  getToken: GetToken,
  barbershopId: string,
  payload: CreatePromotionInput,
): Promise<PromotionDetail> {
  const token = await getToken();
  const response = await api.post<ApiResponse<PromotionDetail>>(
    `/barbershops/${barbershopId}/promotions`,
    payload,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to create promotion'));
}

export async function updatePromotion(
  getToken: GetToken,
  barbershopId: string,
  promotionId: string,
  payload: UpdatePromotionInput,
): Promise<PromotionDetail> {
  const token = await getToken();
  const response = await api.patch<ApiResponse<PromotionDetail>>(
    `/barbershops/${barbershopId}/promotions/${promotionId}`,
    payload,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to update promotion'));
}

export async function setPromotionActive(
  getToken: GetToken,
  barbershopId: string,
  promotionId: string,
  isActive: boolean,
): Promise<PromotionDetail> {
  const token = await getToken();
  const response = await api.post<ApiResponse<PromotionDetail>>(
    `/barbershops/${barbershopId}/promotions/${promotionId}/${isActive ? 'activate' : 'deactivate'}`,
    {},
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to update promotion status'));
}

export async function fetchPromotionRedemptions(
  getToken: GetToken,
  barbershopId: string,
  promotionId: string,
  input: {
    status?: PromotionRedemptionStatus;
    page?: number;
    limit?: number;
  } = {},
): Promise<PromotionRedemptionPage> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PromotionRedemptionPage>>(
    `/barbershops/${barbershopId}/promotions/${promotionId}/redemptions`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.page ? { page: input.page } : {}),
        ...(input.limit ? { limit: input.limit } : {}),
      },
    },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to fetch promotion redemptions'));
}

export async function quoteStaffPromotion(
  getToken: GetToken,
  barbershopId: string,
  input: {
    serviceId: string;
    code: string;
    clientPhone?: string;
  },
): Promise<StaffPromotionQuote> {
  const token = await getToken();
  const response = await api.post<ApiResponse<StaffPromotionQuote>>(
    `/barbershops/${barbershopId}/promotions/quote`,
    {
      serviceId: input.serviceId,
      code: input.code,
      ...(input.clientPhone?.trim() ? { clientPhone: input.clientPhone.trim() } : {}),
    },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );

  return ensureSuccess(response, localizeUnknownError('Failed to quote promotion'));
}
