/**
 * BarberApp Mobile — Type definitions
 *
 * Mirrors backend types until @barberapp/shared is built and linked.
 */

/**
 * User role — matches Prisma UserRole enum.
 * OWNER: Barbershop owner. Can manage barbershop, employees, services.
 * BARBER: Employee who can manage service records.
 * CLIENT: End user who books appointments.
 */
export type UserRole = 'OWNER' | 'BARBER' | 'CLIENT';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
export type RevenueSummaryPeriod = 'today' | 'week' | 'month' | 'year';

/**
 * Current user context — returned by GET /api/v1/me/context.
 *
 * barbershopId/employeeId are nullable because:
 * - OWNER may not have a barbershop yet (just signed up).
 * - BARBER may not have an employee record yet.
 * - CLIENT has no barbershop or employee context.
 */
export interface CurrentUserContext {
  userId: string;
  role: UserRole;
  barbershopId: string | null;
  barbershopName: string | null;
  barbershopTimezone?: string | null;
  employeeId: string | null;
  employeeName: string | null;
}

// ============================================
// Daily summary types — mirror backend response shapes
// ============================================

/**
 * Payment method breakdown — shared by OWNER and BARBER summaries.
 * paymentMethod is nullable because records can have no payment method set.
 */
export interface PaymentMethodSummary {
  paymentMethod: string | null;
  recordsCount: number;
  revenueCents: number;
}

export interface SummaryWindowMeta {
  date?: string;
  period?: RevenueSummaryPeriod;
  rangeStart?: string;
  rangeEnd?: string;
}

/**
 * Employee breakdown — appears in OWNER's barbershop daily summary.
 */
export interface EmployeeSummary {
  employeeId: string;
  employeeName: string | null;
  recordsCount: number;
  revenueCents: number;
}

/**
 * OWNER barbershop daily summary — returned by
 * GET /api/v1/barbershops/:barbershopId/service-records/summary?date=
 */
export interface BarbershopDailySummary extends SummaryWindowMeta {
  totalRecords: number;
  totalRevenueCents: number;
  byEmployee: EmployeeSummary[];
  byPaymentMethod: PaymentMethodSummary[];
}

/**
 * BARBER/employee daily summary — returned by
 * GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records/summary?date=
 */
export interface EmployeeDailySummary extends SummaryWindowMeta {
  employeeId: string;
  employeeName: string | null;
  totalRecords: number;
  totalRevenueCents: number;
  byPaymentMethod: PaymentMethodSummary[];
}

/** Union type — the store holds either OWNER or BARBER summary. */
export type DailySummary = BarbershopDailySummary | EmployeeDailySummary;

export interface SummaryQuery {
  date?: string;
  period?: RevenueSummaryPeriod;
  employeeId?: string;
}

// ============================================
// Employee + service types for owner record creation
// ============================================

export interface EmployeeListItem {
  id: string;
  barbershopId: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
  };
}

export type EmployeeInvitationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'DELIVERY_FAILED';

export interface EmployeeInvitation {
  id: string;
  email: string;
  invitedRole: UserRole;
  status: EmployeeInvitationStatus;
  expiresAt: string | null;
  lastSentAt: string | null;
  resendCount: number;
  acceptedAt: string | null;
  revokedAt: string | null;
  userId: string | null;
  employeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EmployeeInvitationCreateOutcome =
  | {
      outcome: 'employee_created';
      employee: EmployeeListItem;
      invitation: null;
    }
  | {
      outcome: 'employee_reactivated';
      employee: EmployeeListItem;
      invitation: null;
    }
  | {
      outcome: 'invitation_created';
      employee: null;
      invitation: EmployeeInvitation;
    }
  | {
      outcome: 'invitation_pending';
      employee: null;
      invitation: EmployeeInvitation;
    };

export interface EmployeeInvitationReconciliationResult {
  outcome: 'ready' | 'reconciled' | 'already_reconciled';
  userId: string;
  employeeId: string | null;
  barbershopId: string | null;
}

export interface Service {
  id: string;
  barbershopId?: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateServiceInput {
  name: string;
  durationMinutes: number;
  priceCents: number;
  description?: string;
}

export interface UpdateServiceInput {
  name?: string;
  durationMinutes?: number;
  priceCents?: number;
  description?: string;
  isActive?: boolean;
}

export interface CreateServiceRecordInput {
  employeeId: string;
  serviceId: string;
  priceCents: number;
  clientName?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

/**
 * Working hours day — matches the API response shape from
 * GET/PUT /api/v1/barbershops/:id/working-hours.
 *
 * id is optional because pre-populated days won't have one.
 * dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday.
 */
export interface WorkingHoursDay {
  id?: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isActive: boolean;
}

export type EmployeeScheduleMode = 'INHERIT_BARBERSHOP' | 'CUSTOM';

export type EmployeeScheduleSource =
  | 'weekly'
  | 'weekly_closed'
  | 'date_exception_closed'
  | 'date_exception_custom'
  | 'CUSTOM_WEEKLY'
  | 'EMPLOYEE_CUSTOM_HOURS'
  | 'EMPLOYEE_FULL_DAY_OFF'
  | 'EMPLOYEE_CLOSED_DAY'
  | 'INACTIVE_EMPLOYEE';

export interface EmployeeScheduleWeeklyInterval {
  dayOfWeek: number;
  start: string;
  end: string;
}

export interface EmployeeScheduleExceptionInterval {
  start: string;
  end: string;
}

export interface EmployeeScheduleExceptionSummary {
  localDate: string;
  type: 'FULL_DAY_OFF' | 'CUSTOM_HOURS';
  reason: string | null;
  intervals: EmployeeScheduleExceptionInterval[];
}

export interface EmployeeSchedulePreviewDay {
  localDate: string;
  source: EmployeeScheduleSource;
  intervals: EmployeeScheduleExceptionInterval[];
}

export interface EmployeeScheduleConflictSummary {
  appointmentId: string;
  startAt: string;
  endAt: string;
  customerDisplayName: string;
  serviceName: string;
  reasonCode:
    | 'BARBERSHOP_CLOSED'
    | 'EMPLOYEE_NOT_WORKING'
    | 'EMPLOYEE_TIME_OFF'
    | 'OUTSIDE_CUSTOM_HOURS';
}

export interface EmployeeScheduleDetail {
  employee: {
    id: string;
    displayName: string;
    isActive: boolean;
  };
  timezone: string;
  scheduleMode: EmployeeScheduleMode;
  expectedUpdatedAt: string;
  weeklyIntervals: EmployeeScheduleWeeklyInterval[];
  barbershopWeeklyIntervals: EmployeeScheduleWeeklyInterval[];
  upcomingExceptions: EmployeeScheduleExceptionSummary[];
  effectivePreview: EmployeeSchedulePreviewDay[];
  conflictingFutureAppointmentsCount: number;
  conflictingFutureAppointments: EmployeeScheduleConflictSummary[];
}

export interface ServiceRecord {
  id: string;
  barbershopId: string;
  employeeId: string;
  serviceId: string;
  appointmentId: string | null;
  clientName: string | null;
  priceCents: number;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  performedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  service: {
    id: string;
    name: string;
  };
  employee: {
    id: string;
    user: {
      id: string;
      name: string | null;
      email?: string;
    };
  };
}

// ============================================
// Appointment types
// ============================================

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type PaymentConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'REFRESH_REQUIRED'
  | 'REVOKED'
  | 'ERROR';

export type DepositPolicyMode = 'DISABLED' | 'FIXED' | 'PERCENTAGE';

export type BookingPaymentStatus =
  | 'CREATING'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'REVIEW_REQUIRED'
  | 'ERROR';

export interface PaymentConnection {
  provider: 'MERCADO_PAGO';
  status: PaymentConnectionStatus;
  sellerId: string | null;
  publicKeyPresent: boolean;
  connectedAt: string | null;
  lastRefreshedAt: string | null;
  revokedAt: string | null;
  lastErrorCode: string | null;
}

export interface DepositPolicySettings {
  mode: DepositPolicyMode;
  fixedAmountCents: number | null;
  percentageBasisPoints: number | null;
  holdDurationMinutes: number;
  currency: 'ARS';
  publicTerms: string | null;
}

export interface PaymentOperationsSummary {
  pendingTooLong: number;
  expired: number;
  reviewRequired: number;
  approvedCancelled: number;
}

export type PaymentReviewStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export type PaymentReviewReason =
  | 'APPROVED_AFTER_HOLD_EXPIRY'
  | 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'SELLER_MISMATCH'
  | 'EXTERNAL_REFERENCE_MISMATCH'
  | 'PREFERENCE_MISMATCH'
  | 'DUPLICATE_PROVIDER_PAYMENT'
  | 'PROVIDER_RECONCILIATION_ERROR'
  | 'OTHER';

export type PaymentReviewResolution =
  | 'REFUNDED_EXTERNALLY'
  | 'NO_REFUND_REQUIRED'
  | 'CUSTOMER_CREDIT_GRANTED'
  | 'PAYMENT_ACCEPTED_MANUALLY'
  | 'DUPLICATE_RESOLVED'
  | 'OTHER';

export interface PaymentReviewSummary {
  open: number;
  inProgress: number;
  resolvedRecently: number;
  lateApproval: number;
  cancelledPaidAppointment: number;
  providerMismatch: number;
}

export interface PaymentReviewListItem {
  id: string;
  paymentId: string;
  appointmentId: string;
  status: PaymentReviewStatus;
  reason: PaymentReviewReason;
  amountCents: number;
  currency: string;
  customerDisplayName: string;
  serviceName: string;
  appointmentStartAt: string;
  openedAt: string;
  assignedToDisplayName: string | null;
  latestSafeNotePreview: string | null;
}

export interface PaymentReviewPage {
  items: PaymentReviewListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaymentReviewTimelineItem {
  type: string;
  occurredAt: string;
  label: string;
  detail: string | null;
}

export interface PaymentProviderEventSummary {
  id: string;
  topic: string | null;
  action: string | null;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  lastSafeErrorCode: string | null;
  attemptCount: number;
  receivedAt: string;
  processedAt: string | null;
}

export interface PaymentReviewActionItem {
  id: string;
  action: 'OPENED' | 'MARKED_IN_PROGRESS' | 'NOTE_ADDED' | 'RESOLVED' | 'REOPENED';
  actorDisplayName: string | null;
  actorRole: UserRole | null;
  note: string | null;
  resolution: PaymentReviewResolution | null;
  createdAt: string;
}

export interface PaymentReviewDetail {
  id: string;
  payment: {
    id: string;
    amountCents: number;
    currency: string;
    status: BookingPaymentStatus;
    providerStatus: string | null;
    providerStatusDetail: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
    expiredAt: string | null;
    reviewRequiredAt: string | null;
  };
  appointment: {
    id: string;
    publicReference: string | null;
    customerDisplayName: string;
    serviceName: string;
    startAt: string;
    endAt: string;
    status: AppointmentStatus;
  };
  review: {
    status: PaymentReviewStatus;
    reason: PaymentReviewReason;
    resolution: PaymentReviewResolution | null;
    openedAt: string;
    startedAt: string | null;
    resolvedAt: string | null;
    assignedToDisplayName: string | null;
    latestNote: string | null;
  };
  timeline: PaymentReviewTimelineItem[];
  actions: PaymentReviewActionItem[];
  providerEvents: PaymentProviderEventSummary[];
  allowedActions: {
    canStart: boolean;
    canAddNote: boolean;
    canResolve: boolean;
    canReopen: boolean;
  };
}

export type AppointmentNotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'REMINDER_24H'
  | 'APPOINTMENT_RESCHEDULED';

export type AppointmentNotificationChannel = 'EMAIL';

export type AppointmentNotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export type NotificationAttemptOutcome =
  | 'SENT'
  | 'TEMPORARY_FAILURE'
  | 'PERMANENT_FAILURE';

export interface AppointmentNotificationSummary {
  id: string;
  type: AppointmentNotificationType;
  channel: AppointmentNotificationChannel;
  status: AppointmentNotificationStatus;
  scheduledFor: string;
  attempts: number;
  sentAt: string | null;
  cancelledAt: string | null;
}

export interface AppointmentChange {
  id: string;
  type: 'RESCHEDULED';
  changedByDisplayName: string;
  changedByRole: UserRole;
  previousEmployeeName: string;
  previousServiceName: string;
  previousStartAt: string;
  previousEndAt: string;
  newEmployeeName: string;
  newServiceName: string;
  newStartAt: string;
  newEndAt: string;
  reason: string | null;
  createdAt: string;
}

export type NotificationOperationsSort = 'newest' | 'scheduled' | 'failed';

export interface NotificationOperationsSummary {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  cancelled: number;
  dueNow: number;
  retrying: number;
}

export interface NotificationOperationsListItem {
  id: string;
  appointmentId: string;
  type: AppointmentNotificationType;
  channel: AppointmentNotificationChannel;
  status: AppointmentNotificationStatus;
  scheduledFor: string;
  nextAttemptAt: string;
  attempts: number;
  manualRetryCount: number;
  sentAt: string | null;
  cancelledAt: string | null;
  customerDisplayName: string;
  maskedRecipient: string;
  serviceName: string;
  employeeName: string;
  appointmentStartAt: string;
}

export interface NotificationAttemptHistoryItem {
  id: string;
  attemptNumber: number;
  outcome: NotificationAttemptOutcome;
  attemptedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  sanitizedError: string | null;
  durationMs: number | null;
}

export interface NotificationOperationsDetail extends NotificationOperationsListItem {
  lastError: string | null;
  lastManualRetryAt: string | null;
  retryEligible: boolean;
  attemptsHistory: NotificationAttemptHistoryItem[];
}

export interface NotificationOperationsPage {
  items: NotificationOperationsListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface Appointment {
  id: string;
  barbershopId: string;
  employeeId: string;
  clientId: string | null;
  customerId: string | null;
  serviceId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail?: string | null;
  serviceName: string;
  servicePriceCents: number;
  serviceDurationMinutes: number;
  serviceCurrency: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  barbershop: {
    id: string;
    name: string;
    timezone?: string;
  };
  employee: {
    id: string;
    user: {
      id: string;
      name: string | null;
    };
  };
  notifications?: AppointmentNotificationSummary[];
  changes?: AppointmentChange[];
  bookingPayments?: Array<{
    id: string;
    status: BookingPaymentStatus;
    amountCents: number;
    currency: string;
    reviewReasonCode: string | null;
    expiresAt: string;
    approvedAt: string | null;
  }>;
  client: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    currency?: string;
  };
}

export interface AppointmentAvailabilitySlot {
  startAt: string;
  endAt: string;
  localStartTime: string;
  localEndTime: string;
}

export interface AppointmentAvailability {
  localDate: string;
  barbershopTimezone: string;
  slotIntervalMinutes: number;
  serviceDurationMinutes: number;
  slots: AppointmentAvailabilitySlot[];
}

export interface DailyScheduleBoardCurrentTime {
  iso: string;
  localTime: string;
}

export interface DailyScheduleBoardWorkingInterval {
  startTime: string;
  endTime: string;
  startAt: string | null;
  endAt: string | null;
}

export interface DailyScheduleBoardClosedInterval {
  startAt: string;
  endAt: string;
  startTime: string;
  endTime: string;
  reason: 'SCHEDULE_EXCEPTION';
}

export interface DailyScheduleBoardAppointmentNotificationSummary {
  hasFailures: boolean;
  failedCount: number;
}

export interface DailyScheduleBoardAppointment {
  id: string;
  employeeId: string;
  employeeName: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  localStartTime: string;
  localEndTime: string;
  status: AppointmentStatus;
  clientDisplayName: string;
  customerId: string | null;
  isReturningCustomer: boolean;
  completedVisitCount: number;
  noShowCount: number;
  hasPreviousNoShows: boolean;
  notificationSummary: DailyScheduleBoardAppointmentNotificationSummary | null;
  bookingPaymentStatus?: BookingPaymentStatus | null;
  isOutsideWorkingHours: boolean;
  outsideWorkingHoursReasonCode:
    | 'BARBERSHOP_CLOSED'
    | 'EMPLOYEE_NOT_WORKING'
    | 'EMPLOYEE_TIME_OFF'
    | 'EMPLOYEE_SCHEDULE_CONFLICT'
    | null;
  canReschedule: boolean;
  canStart: boolean;
  canComplete: boolean;
  canMarkNoShow: boolean;
  canCancel: boolean;
}

export interface DailyScheduleBoardGap {
  startAt: string;
  endAt: string;
  localStartTime: string;
  localEndTime: string;
  durationMinutes: number;
  isPast: boolean;
  minimumBookableDuration: number | null;
}

export interface DailyScheduleBoardEmployee {
  id: string;
  name: string;
  isCurrentUser: boolean;
  workingDay: {
    source: EmployeeScheduleSource;
    scheduleMode: EmployeeScheduleMode;
    availabilityState: 'WORKING' | 'OFF' | 'CUSTOM_HOURS' | 'TIME_OFF';
    intervals: DailyScheduleBoardWorkingInterval[];
    closedIntervals: DailyScheduleBoardClosedInterval[];
  };
  summary: {
    pending: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    noShow: number;
    cancelled: number;
    occupiedMinutes: number;
  };
  minimumBookableDuration: number | null;
  availableGaps: DailyScheduleBoardGap[];
  appointments: DailyScheduleBoardAppointment[];
}

export interface DailyScheduleBoard {
  date: string;
  timezone: string;
  generatedAt: string;
  currentTime: DailyScheduleBoardCurrentTime | null;
  employees: DailyScheduleBoardEmployee[];
}

export interface FetchAppointmentAvailabilityInput {
  employeeId: string;
  serviceId: string;
  localDate: string;
  excludeAppointmentId?: string;
}

export interface CreateStaffAppointmentInput {
  employeeId?: string;
  customerId?: string;
  serviceId: string;
  startAt: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  notes?: string;
  promotionCode?: string;
}

export type PromotionDiscountType = 'FIXED' | 'PERCENTAGE';
export type PromotionServiceScope = 'ALL' | 'SELECTED';
export type PromotionStatus = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'INACTIVE' | 'DELETED';
export type PromotionRedemptionStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED';

export interface PromotionServiceRef {
  id: string;
  name: string;
}

export interface PromotionListItem {
  id: string;
  name: string;
  code: string;
  codeNormalized: string;
  discountType: PromotionDiscountType;
  fixedDiscountCents: number | null;
  percentageBasisPoints: number | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  appliesToPublicBookings: boolean;
  appliesToStaffBookings: boolean;
  maxActiveRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
  activeRedemptionCount: number;
  minimumPriceCents: number | null;
  serviceScope: PromotionServiceScope;
  usageCount: number;
  status: PromotionStatus;
  services: PromotionServiceRef[];
  createdAt: string;
  updatedAt: string;
}

export interface PromotionSummary {
  activePromotions: number;
  upcomingPromotions: number;
  totalConsumedRedemptions: number;
  totalDiscountCents: number;
  reservedRedemptions: number;
  releasedRedemptions: number;
}

export interface PromotionDetail extends PromotionListItem {
  _count?: {
    redemptions: number;
  };
}

export interface PromotionRedemptionListItem {
  appointmentId: string;
  customerDisplayName: string;
  serviceName: string;
  status: PromotionRedemptionStatus;
  servicePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  reservedAt: string;
  consumedAt: string | null;
  releasedAt: string | null;
  safeReleaseReason: string | null;
}

export interface PromotionRedemptionPage {
  items: PromotionRedemptionListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatePromotionInput {
  name: string;
  code: string;
  discountType: PromotionDiscountType;
  fixedDiscountCents?: number | null;
  percentageBasisPoints?: number | null;
  startsAt: string;
  endsAt: string;
  appliesToPublicBookings: boolean;
  appliesToStaffBookings: boolean;
  maxActiveRedemptions?: number | null;
  maxRedemptionsPerCustomer?: number | null;
  minimumPriceCents?: number | null;
  serviceScope: PromotionServiceScope;
  serviceIds?: string[];
}

export interface UpdatePromotionInput {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  appliesToPublicBookings?: boolean;
  appliesToStaffBookings?: boolean;
  isActive?: boolean;
}

export type StaffPromotionQuote =
  | {
      eligible: true;
      servicePriceCents: number;
      discountCents: number;
      finalPriceCents: number;
      promotion: {
        id: string;
        name: string;
        code: string;
        codeNormalized: string;
        discountType: PromotionDiscountType;
        fixedDiscountCents: number | null;
        percentageBasisPoints: number | null;
        maxRedemptionsPerCustomer: number | null;
      };
      policyValueSnapshot: number;
    }
  | {
      eligible: false;
      safeFailureCode: string;
      reason:
        | 'NOT_FOUND'
        | 'INACTIVE'
        | 'DELETED'
        | 'UPCOMING'
        | 'EXPIRED'
        | 'WRONG_CHANNEL'
        | 'WRONG_SERVICE'
        | 'MINIMUM_PRICE'
        | 'TOTAL_LIMIT'
        | 'PER_CUSTOMER_LIMIT'
        | 'CUSTOMER_IDENTITY_REQUIRED'
        | 'INVALID_POLICY';
    };

export interface RescheduleAppointmentInput {
  employeeId?: string;
  serviceId?: string;
  startAt: string;
  reason?: string;
}

export type CustomerDirectorySort = 'recent' | 'name' | 'no_shows';

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
  lastServiceName: string | null;
  lastEmployeeName: string | null;
}

export interface CustomerDirectoryPage {
  items: CustomerSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface LoyaltyRewardSummary {
  id: string;
  code: string;
  status: 'AVAILABLE' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
  promotionName: string;
}

export interface LoyaltyCustomerSummary {
  programEnabled: boolean;
  visitsRequired: number | null;
  currentStampCount: number;
  lifetimeEligibleVisits: number;
  availableRewardCount: number;
  lastEarnedAt: string | null;
  rewards: LoyaltyRewardSummary[];
}

export interface LoyaltyProgramSettings {
  id: string | null;
  isEnabled: boolean;
  visitsRequired: number;
  rewardValidityDays: number | null;
  rewardPromotion: null | {
    id: string;
    name: string;
    code: string;
    discountType: PromotionDiscountType;
    fixedDiscountCents: number | null;
    percentageBasisPoints: number | null;
    minimumPriceCents: number | null;
    serviceScope: PromotionServiceScope;
    appliesToPublicBookings: boolean;
    appliesToStaffBookings: boolean;
    serviceIds: string[];
  };
}

export interface LoyaltyLedgerListItem {
  id: string;
  eventType: string;
  stampDelta: number;
  rewardDelta: number;
  reason: string | null;
  customerId: string;
  customerName: string;
  sourceAppointmentId: string | null;
  loyaltyRewardId: string | null;
  actorRole: UserRole | null;
  actorDisplayName: string | null;
  createdAt: string;
}

export interface LoyaltyLedgerPage {
  items: LoyaltyLedgerListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface CustomerDetailAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  serviceName: string;
  employeeName: string | null;
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  cancellationSource: string | null;
}

export interface CustomerDetailUpcomingAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  serviceName: string;
  employeeName: string | null;
}

export interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  internalNotes: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
  lastServiceName: string | null;
  lastEmployeeName: string | null;
  loyalty: LoyaltyCustomerSummary;
  recentAppointments: CustomerDetailAppointment[];
  upcomingAppointments: CustomerDetailUpcomingAppointment[];
}

export interface UpdateCustomerInput {
  name?: string | null;
  email?: string | null;
  internalNotes?: string | null;
}
