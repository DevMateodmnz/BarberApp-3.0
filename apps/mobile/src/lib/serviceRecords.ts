import { api, type ApiResponse, type GetToken } from './api.js';
import type { CreateServiceRecordInput, ServiceRecord } from './types.js';

export async function createServiceRecord(
  getToken: GetToken,
  barbershopId: string,
  input: CreateServiceRecordInput
): Promise<ServiceRecord> {
  const token = await getToken();
  const response = await api.post<ApiResponse<ServiceRecord>>(
    `/barbershops/${barbershopId}/service-records`,
    input,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );

  const { data } = response;
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? 'Failed to create service record');
  }

  return data.data;
}
