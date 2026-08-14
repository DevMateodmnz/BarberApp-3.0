import { mobileLocalizationRuntime } from '@/i18n/runtime.js';
import { ApiError, api, type ApiResponse, type GetToken } from './api.js';
import type {
  CommissionLiquidation,
  CommissionLiquidationPreview,
  CommissionOverview,
  CommissionSettings,
} from './types.js';

function ensure<T>(response: { data: ApiResponse<T>; status: number }, fallback: string): T {
  if (!response.data.success || response.data.data === undefined) {
    throw new ApiError(response.data.error?.message ?? fallback, response.data.error?.code, response.status);
  }
  return response.data.data;
}

const message = (key: string) => mobileLocalizationRuntime.i18n.t(key);

async function headers(getToken: GetToken) {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function fetchCommissionSettings(getToken: GetToken, shopId: string) {
  return ensure((await api.get<ApiResponse<CommissionSettings>>(`/barbershops/${shopId}/commissions/settings`, { headers: await headers(getToken) })), message('commissions.errors.load'));
}

export async function saveCommissionSettings(getToken: GetToken, shopId: string, settings: { defaultPercentageBasisPoints: number; employeeOverrides: Array<{ employeeId: string; percentageBasisPoints: number | null }> }) {
  return ensure((await api.put<ApiResponse<CommissionSettings>>(`/barbershops/${shopId}/commissions/settings`, settings, { headers: await headers(getToken) })), message('commissions.errors.save'));
}

export async function fetchCommissionOverview(getToken: GetToken, shopId: string, input: { role: 'OWNER' | 'BARBER'; employeeId?: string; dateFrom: string; dateTo: string }) {
  const path = input.role === 'OWNER' ? 'overview' : 'me';
  return ensure((await api.get<ApiResponse<CommissionOverview>>(`/barbershops/${shopId}/commissions/${path}`, {
    headers: await headers(getToken),
    params: { dateFrom: input.dateFrom, dateTo: input.dateTo, ...(input.role === 'OWNER' ? { employeeId: input.employeeId } : {}) },
  })), message('commissions.errors.load'));
}

export async function previewCommissionLiquidation(getToken: GetToken, shopId: string, input: { employeeId: string; dateFrom: string; dateTo: string }) {
  return ensure((await api.get<ApiResponse<CommissionLiquidationPreview>>(`/barbershops/${shopId}/commissions/liquidations/preview`, { headers: await headers(getToken), params: input })), message('commissions.errors.preview'));
}

export async function createCommissionLiquidation(getToken: GetToken, shopId: string, input: { employeeId: string; dateFrom: string; dateTo: string; idempotencyKey: string }) {
  return ensure((await api.post<ApiResponse<CommissionLiquidation>>(`/barbershops/${shopId}/commissions/liquidations`, input, { headers: await headers(getToken) })), message('commissions.errors.create'));
}

export async function fetchCommissionLiquidations(getToken: GetToken, shopId: string, employeeId?: string) {
  return ensure((await api.get<ApiResponse<CommissionLiquidation[]>>(`/barbershops/${shopId}/commissions/liquidations`, { headers: await headers(getToken), params: employeeId ? { employeeId } : undefined })), message('commissions.errors.load'));
}

export async function fetchCommissionLiquidation(getToken: GetToken, shopId: string, id: string) {
  return ensure((await api.get<ApiResponse<CommissionLiquidation>>(`/barbershops/${shopId}/commissions/liquidations/${id}`, { headers: await headers(getToken) })), message('commissions.errors.load'));
}

export async function markCommissionLiquidationPaid(getToken: GetToken, shopId: string, id: string) {
  return ensure((await api.post<ApiResponse<CommissionLiquidation>>(`/barbershops/${shopId}/commissions/liquidations/${id}/pay`, {}, { headers: await headers(getToken) })), message('commissions.errors.pay'));
}

export async function voidCommissionLiquidation(getToken: GetToken, shopId: string, id: string, reason: string) {
  return ensure((await api.post<ApiResponse<CommissionLiquidation>>(`/barbershops/${shopId}/commissions/liquidations/${id}/void`, { reason }, { headers: await headers(getToken) })), message('commissions.errors.void'));
}
