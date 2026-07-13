export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PublicShop {
  slug: string;
  name: string;
  timezone: string;
}

export interface PublicService {
  serviceId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
}

export interface PublicBarber {
  barberId: string;
  displayName: string;
}

export interface PublicAvailability {
  slug: string;
  serviceId: string;
  barberId: string;
  localDate: string;
  timezone: string;
  slotIntervalMinutes: number;
  serviceDurationMinutes: number;
  slots: Array<{
    startAt: string;
    endAt: string;
  }>;
}
