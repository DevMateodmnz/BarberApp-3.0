import type {
  PublicAvailability,
  PublicBarber,
  PublicBookingConfirmation,
  PublicCreateAppointmentPayload,
  PublicPaymentStatus,
} from '@/lib/api/types';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class BrowserApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'BrowserApiError';
  }
}

async function fetchEnvelope<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new BrowserApiError(
      payload.error?.message ?? 'No se pudo completar la solicitud.',
      response.status,
      payload.error?.code
    );
  }

  return payload.data;
}

export function loadBarbersForService(slug: string, serviceId: string) {
  const params = new URLSearchParams({ serviceId });
  return fetchEnvelope<PublicBarber[]>(
    `/api/public-booking/shops/${encodeURIComponent(slug)}/barbers?${params.toString()}`
  );
}

export function loadAvailabilityForSelection(input: {
  slug: string;
  serviceId: string;
  barberId: string;
  localDate: string;
}) {
  const params = new URLSearchParams({
    serviceId: input.serviceId,
    barberId: input.barberId,
    localDate: input.localDate,
  });

  return fetchEnvelope<PublicAvailability>(
    `/api/public-booking/shops/${encodeURIComponent(input.slug)}/availability?${params.toString()}`
  );
}

export function submitPublicBooking(input: {
  slug: string;
  idempotencyKey: string;
  payload: PublicCreateAppointmentPayload;
}) {
  return fetchEnvelope<PublicBookingConfirmation>(
    `/api/public-booking/shops/${encodeURIComponent(input.slug)}/appointments`,
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

export function loadPublicPaymentStatus(input: {
  slug: string;
  reference: string;
}) {
  return fetchEnvelope<PublicPaymentStatus>(
    `/api/public-booking/shops/${encodeURIComponent(input.slug)}/bookings/${encodeURIComponent(input.reference)}/payment`
  );
}
