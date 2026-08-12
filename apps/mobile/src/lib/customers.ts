import { localizeUnknownError } from '@/i18n/errors.js';

import { api, type ApiResponse, type GetToken } from './api.js';
import type {
  CustomerDetail,
  CustomerDirectoryPage,
  CustomerDirectorySort,
  UpdateCustomerInput,
} from './types.js';

function ensureSuccess<T>(
  response: { data: ApiResponse<T>; status: number },
  fallbackMessage: string
): T {
  const { data } = response;

  if (!data.success || data.data === undefined) {
    throw new Error(localizeUnknownError(data.error?.message ?? fallbackMessage));
  }

  return data.data;
}

export async function fetchCustomers(
  getToken: GetToken,
  barbershopId: string,
  input: {
    page?: number;
    limit?: number;
    sort?: CustomerDirectorySort;
  } = {}
): Promise<CustomerDirectoryPage> {
  const token = await getToken();
  const response = await api.get<ApiResponse<CustomerDirectoryPage>>(
    `/barbershops/${barbershopId}/customers`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: input,
    }
  );

  return ensureSuccess(response, localizeUnknownError('Failed to fetch customers'));
}

export async function searchCustomers(
  getToken: GetToken,
  barbershopId: string,
  input: {
    query: string;
    page?: number;
    limit?: number;
    sort?: CustomerDirectorySort;
  }
): Promise<CustomerDirectoryPage> {
  const token = await getToken();
  const response = await api.post<ApiResponse<CustomerDirectoryPage>>(
    `/barbershops/${barbershopId}/customers/search`,
    input,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  );

  return ensureSuccess(response, localizeUnknownError('Failed to search customers'));
}

export async function fetchCustomerDetail(
  getToken: GetToken,
  barbershopId: string,
  customerId: string
): Promise<CustomerDetail> {
  const token = await getToken();
  const response = await api.get<ApiResponse<CustomerDetail>>(
    `/barbershops/${barbershopId}/customers/${customerId}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  );

  return ensureSuccess(response, localizeUnknownError('Failed to fetch customer detail'));
}

export async function patchCustomer(
  getToken: GetToken,
  barbershopId: string,
  customerId: string,
  input: UpdateCustomerInput
): Promise<Pick<CustomerDetail, 'id' | 'name' | 'email' | 'internalNotes'>> {
  const token = await getToken();
  const response = await api.patch<
    ApiResponse<Pick<CustomerDetail, 'id' | 'name' | 'email' | 'internalNotes'>>
  >(`/barbershops/${barbershopId}/customers/${customerId}`, input, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return ensureSuccess(response, localizeUnknownError('Failed to update customer'));
}
