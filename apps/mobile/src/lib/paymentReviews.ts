import { localizeUnknownError } from '@/i18n/errors.js';
import { ApiError, api, type ApiResponse, type GetToken } from './api.js';
import type {
  PaymentReviewDetail,
  PaymentReviewPage,
  PaymentReviewResolution,
  PaymentReviewSummary,
  PaymentReviewStatus,
} from './types.js';

function ensureSuccess<T>(
  response: { data: ApiResponse<T>; status: number },
  fallbackMessage: string
): T {
  const { data, status } = response;

  if (!data.success || data.data === undefined) {
    throw new ApiError(data.error?.message ?? fallbackMessage, data.error?.code, status);
  }

  return data.data;
}

export interface PaymentReviewQuery {
  status?: PaymentReviewStatus;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest' | 'amount';
}

function buildParams(query?: PaymentReviewQuery) {
  const params = new URLSearchParams();
  if (!query) {
    return params;
  }

  if (query.status) {
    params.set('status', query.status);
  }
  if (query.page) {
    params.set('page', String(query.page));
  }
  if (query.limit) {
    params.set('limit', String(query.limit));
  }
  if (query.sort) {
    params.set('sort', query.sort);
  }

  return params;
}

export async function fetchPaymentReviewSummary(
  getToken: GetToken,
  barbershopId: string
): Promise<PaymentReviewSummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PaymentReviewSummary>>(
    `/barbershops/${barbershopId}/payments/reviews/summary`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.fetchSummary'));
}

export async function fetchPaymentReviews(
  getToken: GetToken,
  barbershopId: string,
  query?: PaymentReviewQuery,
): Promise<PaymentReviewPage> {
  const token = await getToken();
  const params = buildParams(query);
  const response = await api.get<ApiResponse<PaymentReviewPage>>(
    `/barbershops/${barbershopId}/payments/reviews${params.size > 0 ? `?${params.toString()}` : ''}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.fetchReviewList'));
}

export async function fetchPaymentReviewDetail(
  getToken: GetToken,
  barbershopId: string,
  reviewId: string,
): Promise<PaymentReviewDetail> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PaymentReviewDetail>>(
    `/barbershops/${barbershopId}/payments/reviews/${reviewId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.fetchReviewDetail'));
}

export async function startPaymentReview(
  getToken: GetToken,
  barbershopId: string,
  reviewId: string,
): Promise<PaymentReviewDetail> {
  const token = await getToken();
  const response = await api.post<ApiResponse<PaymentReviewDetail>>(
    `/barbershops/${barbershopId}/payments/reviews/${reviewId}/start`,
    {},
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.startReview'));
}

export async function addPaymentReviewNote(
  getToken: GetToken,
  barbershopId: string,
  reviewId: string,
  note: string,
): Promise<PaymentReviewDetail> {
  const token = await getToken();
  const response = await api.post<ApiResponse<PaymentReviewDetail>>(
    `/barbershops/${barbershopId}/payments/reviews/${reviewId}/notes`,
    { note },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.addReviewNote'));
}

export async function resolvePaymentReview(
  getToken: GetToken,
  barbershopId: string,
  reviewId: string,
  resolution: PaymentReviewResolution,
  note?: string,
): Promise<PaymentReviewDetail> {
  const token = await getToken();
  const response = await api.post<ApiResponse<PaymentReviewDetail>>(
    `/barbershops/${barbershopId}/payments/reviews/${reviewId}/resolve`,
    note ? { resolution, note } : { resolution },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.resolveReview'));
}

export async function reopenPaymentReview(
  getToken: GetToken,
  barbershopId: string,
  reviewId: string,
  note?: string,
): Promise<PaymentReviewDetail> {
  const token = await getToken();
  const response = await api.post<ApiResponse<PaymentReviewDetail>>(
    `/barbershops/${barbershopId}/payments/reviews/${reviewId}/reopen`,
    note ? { note } : {},
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(response, localizeUnknownError('paymentsSettings.errors.reopenReview'));
}
