import 'server-only';
import { getPublicWebRuntime } from '@/lib/config/publicRuntime';
import type {
  ApiEnvelope,
  PublicAvailability,
  PublicBarber,
  PublicBookingConfig,
  PublicBookingConfirmation,
  PublicPaymentStatus,
  PublicCancelBookingPayload,
  PublicCancelBookingResult,
  PublicCreateAppointmentPayload,
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

interface PublicApiLogContext {
  apiBaseUrl?: string;
  code?: string;
  contentType?: string | null;
  errorName?: string;
  message?: string;
  path: string;
  status?: number;
}

function logPublicApiFailure(
  category:
    | 'runtime_config_error'
    | 'upstream_connection_failure'
    | 'upstream_malformed_response'
    | 'upstream_non_ok_status'
    | 'upstream_invalid_envelope',
  context: PublicApiLogContext
) {
  console.error('[public-web][public-api]', {
    category,
    ...context,
  });
}

async function parseApiEnvelope<T>(
  response: Response,
  path: string,
  apiBaseUrl: string
): Promise<ApiEnvelope<T>> {
  const body = await response.text();

  try {
    return JSON.parse(body) as ApiEnvelope<T>;
  } catch (error) {
    logPublicApiFailure('upstream_malformed_response', {
      apiBaseUrl,
      contentType: response.headers.get('content-type'),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message:
        error instanceof Error ? error.message : 'Failed to parse JSON body',
      path,
      status: response.status,
    });

    throw new PublicApiError(
      response.status,
      'PUBLIC_API_INVALID_RESPONSE',
      'Public API returned an invalid response.'
    );
  }
}

export async function requestPublicApi<T>(
  path: string,
  init?: RequestInit
): Promise<{ response: Response; payload: ApiEnvelope<T> }> {
  let apiBaseUrl: string;

  try {
    apiBaseUrl = getPublicWebRuntime().apiBaseUrl;
  } catch (error) {
    logPublicApiFailure('runtime_config_error', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown runtime error',
      path,
    });
    throw error;
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    logPublicApiFailure('upstream_connection_failure', {
      apiBaseUrl,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message:
        error instanceof Error ? error.message : 'Failed to reach public API',
      path,
    });
    throw error;
  }

  return {
    response,
    payload: await parseApiEnvelope<T>(response, path, apiBaseUrl),
  };
}

export async function fetchPublicApi<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { response, payload } = await requestPublicApi<T>(path, init);

  if (!response.ok) {
    logPublicApiFailure('upstream_non_ok_status', {
      code: payload.error?.code ?? 'PUBLIC_API_ERROR',
      message: payload.error?.message ?? 'Public API request failed',
      path,
      status: response.status,
    });
  }

  if (!response.ok || !payload.success || payload.data === undefined) {
    if (response.ok) {
      logPublicApiFailure('upstream_invalid_envelope', {
        code: payload.error?.code ?? 'PUBLIC_API_ERROR',
        message: payload.error?.message ?? 'Public API request failed',
        path,
        status: response.status,
      });
    }

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

export async function getPublicBookingConfig(slug: string) {
  return fetchPublicApi<PublicBookingConfig>(
    `/public/barbershops/${encodeURIComponent(slug)}/booking-config`
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

export async function createPublicAppointment(input: {
  slug: string;
  idempotencyKey: string;
  payload: PublicCreateAppointmentPayload;
}) {
  return fetchPublicApi<PublicBookingConfirmation>(
    `/public/barbershops/${encodeURIComponent(input.slug)}/appointments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(input.payload),
    }
  );
}

export async function cancelPublicAppointment(input: {
  slug: string;
  publicReference: string;
  payload: PublicCancelBookingPayload;
}) {
  return fetchPublicApi<PublicCancelBookingResult>(
    `/public/barbershops/${encodeURIComponent(input.slug)}/appointments/${encodeURIComponent(input.publicReference)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.payload),
    }
  );
}

export async function getPublicPaymentStatus(input: {
  slug: string;
  publicReference: string;
}) {
  return fetchPublicApi<PublicPaymentStatus>(
    `/public/barbershops/${encodeURIComponent(input.slug)}/bookings/${encodeURIComponent(input.publicReference)}/payment`
  );
}
