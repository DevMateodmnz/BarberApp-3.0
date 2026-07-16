import * as WebBrowser from 'expo-web-browser';
import { localizeUnknownError } from '@/i18n/errors.js';
import { ApiError, api, type ApiResponse, type GetToken } from './api.js';
import type {
  DepositPolicySettings,
  PaymentConnection,
  PaymentOperationsSummary,
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

export async function fetchPaymentConnection(
  getToken: GetToken,
  barbershopId: string
): Promise<PaymentConnection> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PaymentConnection>>(
    `/barbershops/${barbershopId}/payments/connection`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(
    response,
    localizeUnknownError('paymentsSettings.errors.fetchConnection')
  );
}

export async function startMercadoPagoConnect(
  getToken: GetToken,
  barbershopId: string
): Promise<void> {
  const token = await getToken();
  const response = await api.post<ApiResponse<{ authorizationUrl: string }>>(
    `/barbershops/${barbershopId}/payments/mercado-pago/connect`,
    {},
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const data = ensureSuccess(
    response,
    localizeUnknownError('paymentsSettings.errors.startConnect')
  );
  await WebBrowser.openBrowserAsync(data.authorizationUrl);
}

export async function disconnectPaymentConnection(
  getToken: GetToken,
  barbershopId: string
): Promise<void> {
  const token = await getToken();
  const response = await api.delete<ApiResponse<{ disconnected: boolean }>>(
    `/barbershops/${barbershopId}/payments/connection`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  ensureSuccess(
    response,
    localizeUnknownError('paymentsSettings.errors.disconnect')
  );
}

export async function fetchDepositPolicy(
  getToken: GetToken,
  barbershopId: string
): Promise<DepositPolicySettings> {
  const token = await getToken();
  const response = await api.get<ApiResponse<DepositPolicySettings>>(
    `/barbershops/${barbershopId}/deposit-policy`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(
    response,
    localizeUnknownError('paymentsSettings.errors.fetchPolicy')
  );
}

export async function updateDepositPolicy(
  getToken: GetToken,
  barbershopId: string,
  input: DepositPolicySettings
): Promise<DepositPolicySettings> {
  const token = await getToken();
  const response = await api.put<ApiResponse<DepositPolicySettings>>(
    `/barbershops/${barbershopId}/deposit-policy`,
    input,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(
    response,
    localizeUnknownError('paymentsSettings.errors.updatePolicy')
  );
}

export async function fetchPaymentSummary(
  getToken: GetToken,
  barbershopId: string
): Promise<PaymentOperationsSummary> {
  const token = await getToken();
  const response = await api.get<ApiResponse<PaymentOperationsSummary>>(
    `/barbershops/${barbershopId}/payments/summary`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  return ensureSuccess(
    response,
    localizeUnknownError('paymentsSettings.errors.fetchSummary')
  );
}
