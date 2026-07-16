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
  depositRequired?: boolean;
  depositAmountCents?: number | null;
  remainingAmountCents?: number | null;
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
  depositPolicy?: {
    enabled: boolean;
    mode: 'DISABLED' | 'FIXED' | 'PERCENTAGE';
    holdDurationMinutes: number;
    currency: 'ARS';
    publicTerms: string | null;
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
  clientPhoneDisplay?: string;
  status?: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'IN_PROGRESS' | 'PENDING';
  appointmentStatus?:
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'NO_SHOW'
    | 'IN_PROGRESS'
    | 'PENDING';
  paymentStatus?:
    | 'NOT_REQUIRED'
    | 'CREATING'
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REVIEW_REQUIRED'
    | 'ERROR';
  amountCents?: number | null;
  servicePriceCents?: number;
  remainingAmountCents?: number | null;
  currency?: string;
  expiresAt?: string | null;
  checkoutUrl?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
  publicTerms?: string | null;
}

export interface PublicPaymentStatus {
  appointmentStatus: PublicBookingConfirmation['appointmentStatus'];
  paymentStatus: PublicBookingConfirmation['paymentStatus'];
  amount: number | null;
  currency: string;
  expiresAt: string | null;
  canRetry: boolean;
  canCancel: boolean;
}

export interface PublicCreateAppointmentPayload {
  serviceId: string;
  barberId: string;
  startAt: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  notes?: string;
  consentAccepted: true;
  consentVersion: string;
}

export interface PublicCancelBookingPayload {
  reason?: string;
}

export interface PublicCancelBookingResult {
  id: string;
  publicReference: string;
  status: 'CANCELLED';
  cancelledAt: string;
  cancellationSource: 'PUBLIC_BOOKING';
  cancelReason: string | null;
  paymentStatus?: PublicBookingConfirmation['paymentStatus'];
  refundReviewRequired?: boolean;
}
