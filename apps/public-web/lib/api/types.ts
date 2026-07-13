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

export interface PublicBookingConfig {
  consent: {
    version: string;
    text: string;
  };
  policy: {
    minimumNoticeMinutes: number;
    maximumBookingHorizonDays: number;
    slotIntervalMinutes: number;
  };
}

export interface PublicBookingConfirmation {
  bookingReference: string;
  barbershopName: string;
  serviceName: string;
  barberName: string;
  timezone: string;
  localDate: string;
  localStartTime: string;
  startAt: string;
  endAt: string;
  clientPhoneDisplay: string;
  status: 'CONFIRMED';
}

export interface PublicCreateAppointmentPayload {
  serviceId: string;
  barberId: string;
  startAt: string;
  clientName: string;
  clientPhone: string;
  notes?: string;
  consentAccepted: true;
  consentVersion: string;
}
