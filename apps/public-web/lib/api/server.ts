import 'server-only';
import { getPublicWebRuntime } from '@/lib/config/publicRuntime';
import type {
  ApiEnvelope,
  PublicAvailability,
  PublicBarber,
  PublicService,
  PublicShop,
} from '@/lib/api/types';

export interface PublicApiErrorShape {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

async function parseApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json()) as ApiEnvelope<T>;
}

export async function fetchPublicApi<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { apiBaseUrl } = getPublicWebRuntime();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseApiEnvelope<T>(response);

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new PublicApiError(
      response.status,
      payload.error?.code ?? 'PUBLIC_API_ERROR',
      payload.error?.message ?? 'Public API request failed',
      payload.error?.details
    );
  }

  return payload.data;
}

export async function getPublicShop(slug: string) {
  return fetchPublicApi<PublicShop>(`/public/barbershops/${encodeURIComponent(slug)}`);
}

export async function getPublicServices(slug: string) {
  return fetchPublicApi<PublicService[]>(
    `/public/barbershops/${encodeURIComponent(slug)}/services`
  );
}

export async function getPublicBarbers(slug: string, serviceId: string) {
  const params = new URLSearchParams({ serviceId });
  return fetchPublicApi<PublicBarber[]>(
    `/public/barbershops/${encodeURIComponent(slug)}/barbers?${params.toString()}`
  );
}

export async function getPublicAvailability(input: {
  slug: string;
  barberId: string;
  serviceId: string;
  localDate: string;
}) {
  const params = new URLSearchParams({
    serviceId: input.serviceId,
    localDate: input.localDate,
  });

  return fetchPublicApi<PublicAvailability>(
    `/public/barbershops/${encodeURIComponent(input.slug)}/barbers/${encodeURIComponent(
      input.barberId
    )}/availability?${params.toString()}`
  );
}
