/**
 * Appointment business logic service
 *
 * All security guarantees (tenant isolation, role permissions, double-booking,
 * status transitions) are enforced HERE against the REAL database.
 * This is the single source of truth for business rules.
 */
import { prisma } from '../lib/prisma.js';
import * as customerService from './customerService.js';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import {
  getLocalDayAndTime,
} from '../lib/businessHours.js';
import {
  getLocalDateStringInTimeZone,
  getUtcRangeForLocalDate,
} from '../lib/dateUtils.js';
import {
  APPOINTMENT_SLOT_INTERVAL_MINUTES,
  isSlotBoundaryMinute,
} from '../lib/appointmentScheduling.js';
import {
  BLOCKING_APPOINTMENT_STATUSES,
  buildBlockingAppointmentWhereInput,
} from '../lib/appointmentBlocking.js';
import { buildAvailabilitySlots } from '../lib/availabilitySlots.js';
import {
  buildLifecycleUpdateForCancel,
  buildLifecycleUpdateForStatus,
} from '../lib/appointmentLifecycle.js';
import {
  AppointmentTransitionConflictError,
  compareAndSwapAppointmentStatus,
} from '../lib/atomicTransition.js';
import {
  APPOINTMENT_WITH_NOTIFICATION_SUMMARY_INCLUDE,
  cancelAppointmentNotifications,
  listAppointmentNotificationSummaries,
  scheduleAppointmentRescheduledNotification,
  scheduleAppointmentNotificationsForNewAppointment,
  syncAppointmentReminderAfterReschedule,
} from './appointmentNotificationService.js';
import { tryNormalizeClientPhoneE164 } from '../lib/phoneNormalization.js';
import { validateEmployeeInBarbershop } from './employeeService.js';
import { normalizeEmail } from '../lib/email.js';
import { validateEmployeeAvailabilityWindow } from './employeeScheduleService.js';
import {
  assertAppointmentCanBeConfirmedWithPayment,
  releaseExpiredPaymentHolds,
  syncBookingPaymentOnAppointmentCancellation,
} from './payments/bookingPaymentService.js';
import type {
  AppointmentStatus,
  PrismaClient,
  Employee,
  Service,
  User,
  UserRole,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  AppointmentAvailabilityQuery,
  AppointmentListQuery,
  CreateAppointmentInput,
  RescheduleAppointmentInput,
  StaffCreateAppointmentInput,
} from '../schemas/appointment.js';

const APPOINTMENT_INCLUDE = {
  ...APPOINTMENT_WITH_NOTIFICATION_SUMMARY_INCLUDE,
} satisfies Prisma.AppointmentInclude;
type AppointmentWithInclude = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

const APPOINTMENT_CHANGE_HISTORY_SELECT = {
  id: true,
  type: true,
  changedByRole: true,
  previousEmployeeName: true,
  previousServiceName: true,
  previousStartAt: true,
  previousEndAt: true,
  newEmployeeName: true,
  newServiceName: true,
  newStartAt: true,
  newEndAt: true,
  reason: true,
  createdAt: true,
  changedByUser: {
    select: {
      name: true,
      email: true,
    },
  },
} satisfies Prisma.AppointmentChangeSelect;

interface AppointmentSnapshotInput {
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  serviceName: string;
  servicePriceCents: number;
  serviceDurationMinutes: number;
  serviceCurrency: string;
  notes: string | null;
}

interface AppointmentRecordOptions {
  status?: AppointmentStatus;
  publicReference?: string | null;
  publicConsentAcceptedAt?: Date | null;
  publicConsentVersion?: string | null;
}

function applyOperationalPaymentReview(
  appointment: AppointmentWithInclude
): AppointmentWithInclude {
  if (!appointment.bookingPayments?.length) {
    return appointment;
  }

  const [latestPayment] = appointment.bookingPayments;
  if (!latestPayment || !latestPayment.reviews?.length || latestPayment.status === 'REVIEW_REQUIRED') {
    return appointment;
  }

  return {
    ...appointment,
    bookingPayments: [
      {
        ...latestPayment,
        status: 'REVIEW_REQUIRED',
        reviewReasonCode: latestPayment.reviews[0]?.reason ?? latestPayment.reviewReasonCode,
      },
      ...appointment.bookingPayments.slice(1),
    ],
  };
}

function applyOperationalPaymentReviews(
  appointments: AppointmentWithInclude[]
): AppointmentWithInclude[] {
  return appointments.map(applyOperationalPaymentReview);
}

interface EligibleBookingContext {
  employee: Employee;
  service: Service;
}

interface StaffScopeInput {
  barbershopId: string;
  employeeId?: string;
  userId: string;
  userRole: UserRole;
  authenticatedEmployeeId?: string;
}

interface AvailabilityInput {
  barbershopId: string;
  employeeId: string;
  query: AppointmentAvailabilityQuery;
  userId: string;
  userRole: UserRole;
  authenticatedEmployeeId?: string;
  now?: Date;
}

interface OwnerAppointmentListContext {
  barbershopId: string;
  timezone: string;
}

type AppointmentDb = Prisma.TransactionClient | typeof prisma;

// ============================================
// STATUS TRANSITION RULES
// ============================================

/**
 * Allowed status transitions per role.
 * Format: from -> [allowed to] with which roles can perform
 */
const STATUS_TRANSITIONS: Record<
  AppointmentStatus,
  { to: AppointmentStatus; allowedRoles: UserRole[] }[]
> = {
  PENDING: [
    { to: 'CONFIRMED', allowedRoles: ['OWNER'] },
    { to: 'CANCELLED', allowedRoles: ['CLIENT', 'OWNER'] },
  ],
  CONFIRMED: [
    { to: 'IN_PROGRESS', allowedRoles: ['BARBER', 'OWNER'] },
    { to: 'CANCELLED', allowedRoles: ['CLIENT', 'OWNER'] },
  ],
  IN_PROGRESS: [
    { to: 'COMPLETED', allowedRoles: ['BARBER', 'OWNER'] },
    { to: 'NO_SHOW', allowedRoles: ['BARBER', 'OWNER'] },
  ],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

/**
 * Validates that a status transition is allowed for the given role.
 */
export function validateStatusTransition(
  currentStatus: AppointmentStatus,
  newStatus: AppointmentStatus,
  role: UserRole
): void {
  const allowed = STATUS_TRANSITIONS[currentStatus];

  if (!allowed || allowed.length === 0) {
    throw new BadRequestError(
      `Status '${currentStatus}' is a terminal state and cannot be changed`
    );
  }

  const transition = allowed.find((t) => t.to === newStatus);

  if (!transition) {
    throw new BadRequestError(
      `Cannot transition from '${currentStatus}' to '${newStatus}'`
    );
  }

  if (!transition.allowedRoles.includes(role)) {
    throw new ForbiddenError(
      `Role '${role}' is not allowed to transition from '${currentStatus}' to '${newStatus}'`
    );
  }
}

// ============================================
// TENANT INTEGRITY CHECKS
// ============================================

function normalizeOptionalText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalEmail(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? normalizeEmail(trimmed) : null;
}

function normalizeRequiredClientName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestError('Client name is required');
  }
  return trimmed;
}

function isDbDoubleBookingError(err: unknown): boolean {
  return (
    (
      err instanceof Prisma.PrismaClientUnknownRequestError &&
      (
        err.message.includes('no_double_booking') ||
        err.message.includes('violates exclusion constraint') ||
        err.message.includes('23P01')
      )
    ) ||
    (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2004' &&
      err.message.includes('no_double_booking')
    )
  );
}

async function getClientSnapshotSource(clientId: string): Promise<User> {
  return prisma.user.findUniqueOrThrow({ where: { id: clientId } });
}

async function findActiveBarberEmployeeForBarbershop(
  userId: string,
  barbershopId: string,
  db: Pick<PrismaClient, 'employee'> = prisma
): Promise<Employee | null> {
  return db.employee.findFirst({
    where: {
      userId,
      barbershopId,
      isActive: true,
      deletedAt: null,
    },
  });
}

function toDisplayName(input: { name: string | null; email: string }): string {
  return input.name?.trim() || input.email.trim();
}

function mapAppointmentChangeHistoryRow(
  row: Prisma.AppointmentChangeGetPayload<{ select: typeof APPOINTMENT_CHANGE_HISTORY_SELECT }>
) {
  return {
    id: row.id,
    type: row.type,
    changedByDisplayName: toDisplayName(row.changedByUser),
    changedByRole: row.changedByRole,
    previousEmployeeName: row.previousEmployeeName,
    previousServiceName: row.previousServiceName,
    previousStartAt: row.previousStartAt.toISOString(),
    previousEndAt: row.previousEndAt.toISOString(),
    newEmployeeName: row.newEmployeeName,
    newServiceName: row.newServiceName,
    newStartAt: row.newStartAt.toISOString(),
    newEndAt: row.newEndAt.toISOString(),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildClientSnapshotFromUser(
  client: User,
  notes?: string | null
): Pick<
  AppointmentSnapshotInput,
  'clientName' | 'clientPhone' | 'clientEmail' | 'notes'
> {
  return {
    clientName: client.name?.trim() || client.email,
    clientPhone: null,
    clientEmail: normalizeOptionalEmail(client.email),
    notes: normalizeOptionalText(notes),
  };
}

function buildGuestClientSnapshot(input: {
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  notes?: string;
}): Pick<
  AppointmentSnapshotInput,
  'clientName' | 'clientPhone' | 'clientEmail' | 'notes'
> {
  return {
    clientName: normalizeRequiredClientName(input.clientName),
    clientPhone: normalizeOptionalText(input.clientPhone),
    clientEmail: normalizeOptionalEmail(input.clientEmail),
    notes: normalizeOptionalText(input.notes),
  };
}

export function buildServiceSnapshot(
  service: Service
): Pick<
  AppointmentSnapshotInput,
  | 'serviceName'
  | 'servicePriceCents'
  | 'serviceDurationMinutes'
  | 'serviceCurrency'
> {
  return {
    serviceName: service.name,
    servicePriceCents: service.priceCents,
    serviceDurationMinutes: service.durationMinutes,
    serviceCurrency: service.currency,
  };
}

export function calculateAppointmentEndAt(
  startAt: Date,
  durationMinutes: number
): Date {
  return new Date(startAt.getTime() + durationMinutes * 60_000);
}

async function getBarbershopTimezone(barbershopId: string): Promise<string> {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { timezone: true },
  });

  if (!barbershop) {
    throw new BadRequestError('Barbershop not found');
  }

  return barbershop.timezone;
}

async function getOwnerAppointmentListContext(
  userId: string
): Promise<OwnerAppointmentListContext | null> {
  const barbershop = await prisma.barbershop.findFirst({
    where: { ownerId: userId },
    select: { id: true, timezone: true },
  });

  if (!barbershop) {
    return null;
  }

  return {
    barbershopId: barbershop.id,
    timezone: barbershop.timezone,
  };
}

function withLocalDateRange(
  where: Prisma.AppointmentWhereInput,
  date: string | undefined,
  timezone: string
): Prisma.AppointmentWhereInput {
  if (!date) {
    return where;
  }

  const { startUtc, endUtc } = getUtcRangeForLocalDate(date, timezone);

  return {
    ...where,
    startAt: {
      gte: startUtc,
      lt: endUtc,
    },
  };
}

async function validateServiceBelongsToBarbershop(
  serviceId: string,
  barbershopId: string,
  db: Pick<PrismaClient, 'service'> = prisma
): Promise<Service> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) {
    throw new NotFoundError('Service');
  }

  if (service.barbershopId !== barbershopId) {
    throw new BadRequestError(
      'Service does not belong to the specified barbershop'
    );
  }

  if (!service.isActive || service.deletedAt) {
    throw new BadRequestError('Service is not available');
  }

  return service;
}

async function validateEmployeeBelongsToBarbershop(
  employeeId: string,
  barbershopId: string,
  db: Pick<PrismaClient, 'employee'> = prisma
): Promise<Employee> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  if (employee.barbershopId !== barbershopId) {
    throw new BadRequestError(
      'Employee does not belong to the specified barbershop'
    );
  }

  if (!employee.isActive || employee.deletedAt) {
    throw new BadRequestError('Employee is not active');
  }

  return employee;
}

/**
 * Validates that an employee is assigned to perform the specified service
 * via the EmployeeService junction table.
 */
async function validateEmployeeOffersService(
  employeeId: string,
  serviceId: string,
  db: Pick<PrismaClient, 'employeeService'> = prisma
): Promise<void> {
  const link = await db.employeeService.findUnique({
    where: {
      employeeId_serviceId: { employeeId, serviceId },
    },
  });

  if (!link) {
    throw new BadRequestError('Employee does not offer this service');
  }
}

async function resolveEligibleBookingContext(
  barbershopId: string,
  employeeId: string,
  serviceId: string,
  db: Pick<PrismaClient, 'employee' | 'service' | 'employeeService'> = prisma
): Promise<EligibleBookingContext> {
  const [employee, service] = await Promise.all([
    validateEmployeeBelongsToBarbershop(employeeId, barbershopId, db),
    validateServiceBelongsToBarbershop(serviceId, barbershopId, db),
  ]);

  await validateEmployeeOffersService(employee.id, service.id, db);

  return { employee, service };
}

async function resolveStaffEmployeeScope(
  input: StaffScopeInput
): Promise<string> {
  const {
    employeeId,
    userRole,
    authenticatedEmployeeId,
  } = input;

  if (userRole === 'BARBER') {
    if (!authenticatedEmployeeId) {
      throw new ForbiddenError(
        'Employee context required for barber appointment booking'
      );
    }

    if (employeeId && employeeId !== authenticatedEmployeeId) {
      throw new AppError(
        403,
        'FORBIDDEN_EMPLOYEE_SCOPE',
        'Barbers can only create appointments for their own employee profile'
      );
    }

    return authenticatedEmployeeId;
  }

  if (!employeeId) {
    throw new BadRequestError('Employee ID is required');
  }

  return employeeId;
}

export function validateAppointmentStartAt(
  startAt: Date,
  timezone: string,
  options: {
    now?: Date;
    minimumAllowedAt?: Date;
    futureErrorMessage?: string;
    slotIntervalMinutes?: number;
  } = {}
): void {
  const now = options.now ?? new Date();
  const minimumAllowedAt = options.minimumAllowedAt;

  const isTooSoon = minimumAllowedAt
    ? startAt.getTime() < minimumAllowedAt.getTime()
    : startAt.getTime() <= now.getTime();

  if (isTooSoon) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_TIME',
      options.futureErrorMessage ?? 'Appointments must be scheduled in the future'
    );
  }

  const { minutesSinceMidnight } = getLocalDayAndTime(startAt, timezone);
  const slotIntervalMinutes =
    options.slotIntervalMinutes ?? APPOINTMENT_SLOT_INTERVAL_MINUTES;

  if (!isSlotBoundaryMinute(minutesSinceMidnight, slotIntervalMinutes)) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_TIME',
      `Appointments must start on a ${slotIntervalMinutes}-minute interval`
    );
  }
}

async function createAppointmentRecord(input: {
  barbershopId: string;
  employeeId: string;
  clientId: string | null;
  customerId?: string | null;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  snapshot: AppointmentSnapshotInput;
  options?: AppointmentRecordOptions;
  db?: Pick<PrismaClient, 'appointment'>;
}) {
  const {
    barbershopId,
    employeeId,
    clientId,
    customerId = null,
    serviceId,
    startAt,
    endAt,
    snapshot,
    options,
    db = prisma,
  } = input;

  try {
    return await db.appointment.create({
      data: {
        barbershopId,
        employeeId,
        clientId,
        customerId,
        serviceId,
        startAt,
        endAt,
        status: options?.status ?? 'PENDING',
        clientName: snapshot.clientName,
        clientPhone: snapshot.clientPhone,
        clientEmail: snapshot.clientEmail,
        clientPhoneNormalized: tryNormalizeClientPhoneE164(snapshot.clientPhone),
        publicReference: options?.publicReference ?? null,
        publicConsentAcceptedAt: options?.publicConsentAcceptedAt ?? null,
        publicConsentVersion: options?.publicConsentVersion ?? null,
        serviceName: snapshot.serviceName,
        servicePriceCents: snapshot.servicePriceCents,
        serviceDurationMinutes: snapshot.serviceDurationMinutes,
        serviceCurrency: snapshot.serviceCurrency,
        notes: snapshot.notes,
      },
      include: APPOINTMENT_INCLUDE,
    });
  } catch (err) {
    if (isDbDoubleBookingError(err)) {
      throw new ConflictError('This time slot is already booked');
    }
    throw err;
  }
}

// ============================================
// DOUBLE BOOKING DETECTION
// ============================================

/**
 * Checks for time conflicts with existing appointments.
 * Considers only active statuses (PENDING, CONFIRMED, IN_PROGRESS).
 * Excludes a specific appointment ID (for update/reschedule checks).
 */
export async function hasTimeConflict(
  employeeId: string,
  startAt: Date,
  endAt: Date,
  excludeId?: string,
  db: Pick<PrismaClient, 'appointment'> = prisma
): Promise<boolean> {
  const conflict = await db.appointment.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      employeeId,
      ...buildBlockingAppointmentWhereInput(new Date()),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });

  return conflict !== null;
}

// ============================================
// APPOINTMENT CRUD
// ============================================

/**
 * Creates a new appointment (CLIENT booking).
 * Enforces: tenant integrity, business hours, double-booking prevention.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
  clientId: string
) {
  const {
    barbershopId,
    employeeId,
    serviceId,
    startAt: startAtStr,
    notes,
  } = input;

  const [{ service }, client, timezone] = await Promise.all([
    resolveEligibleBookingContext(barbershopId, employeeId, serviceId),
    getClientSnapshotSource(clientId),
    getBarbershopTimezone(barbershopId),
  ]);

  const startAt = new Date(startAtStr);
  validateAppointmentStartAt(startAt, timezone);
  const endAt = calculateAppointmentEndAt(startAt, service.durationMinutes);
  await releaseExpiredPaymentHolds({ now: new Date(), employeeId });

  await validateEmployeeAvailabilityWindow({
    barbershopId,
    employeeId,
    startAt,
    endAt,
    timezone,
  });

  const conflict = await hasTimeConflict(employeeId, startAt, endAt);
  if (conflict) {
    throw new ConflictError('This time slot is already booked');
  }

  const snapshot: AppointmentSnapshotInput = {
    ...buildClientSnapshotFromUser(client, notes),
    ...buildServiceSnapshot(service),
  };

  // Link the appointment to a first-class Customer record
  // (barbershop + normalized phone) inside the same transaction.
  // Two concurrent first appointments for the same phone produce
  // one customer; the unique index on (barbershopId,
  // phoneNormalized) enforces this at the database level.
  // Malformed phones (e.g. free-form staff input) leave the
  // appointment without a customer link; the appointment
  // snapshots preserve the original input.
  return prisma.$transaction(async (tx) => {
    const phoneForCustomer = snapshot.clientPhone;
    let customerId: string | null = null;
    if (phoneForCustomer) {
      try {
        const result = await customerService.upsertCustomerByPhone({
          barbershopId,
          phone: phoneForCustomer,
          name: snapshot.clientName,
          appointmentAt: startAt,
          db: tx,
        });
        customerId = result.customer.id;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/requires an E\.164 phone/.test(error.message)
        ) {
          throw error;
        }
      }
    }

    return createAppointmentRecord({
      barbershopId,
      employeeId,
      clientId,
      customerId,
      serviceId,
      startAt,
      endAt,
      snapshot,
      db: tx,
    });
  });
}

export async function createStaffAppointment(
  barbershopId: string,
  input: StaffCreateAppointmentInput,
  userId: string,
  userRole: UserRole,
  authenticatedEmployeeId?: string
) {
  const employeeId = await resolveStaffEmployeeScope({
    barbershopId,
    employeeId: input.employeeId,
    userId,
    userRole,
    authenticatedEmployeeId,
  });

  const [timezone, bookingContext] = await Promise.all([
    getBarbershopTimezone(barbershopId),
    resolveEligibleBookingContext(barbershopId, employeeId, input.serviceId),
  ]);

  const startAt = new Date(input.startAt);
  const notificationNow = new Date();
  validateAppointmentStartAt(startAt, timezone);

  const endAt = calculateAppointmentEndAt(
    startAt,
    bookingContext.service.durationMinutes
  );
  await releaseExpiredPaymentHolds({ now: notificationNow, employeeId });

  await validateEmployeeAvailabilityWindow({
    barbershopId,
    employeeId,
    startAt,
    endAt,
    timezone,
  });

  const conflict = await hasTimeConflict(employeeId, startAt, endAt);
  if (conflict) {
    throw new ConflictError('This time slot is already booked');
  }

  const snapshot: AppointmentSnapshotInput = {
    ...buildGuestClientSnapshot(input),
    ...buildServiceSnapshot(bookingContext.service),
  };

  return prisma.$transaction(async (tx) => {
    let customerId: string | null = null;
    if (input.customerId) {
      const customer = await customerService.linkAppointmentToExistingCustomer({
        barbershopId,
        customerId: input.customerId,
        name: snapshot.clientName,
        email: snapshot.clientEmail,
        appointmentAt: startAt,
        db: tx,
      });
      customerId = customer.id;
    } else if (snapshot.clientPhone) {
      try {
        const result = await customerService.upsertCustomerByPhone({
          barbershopId,
          phone: snapshot.clientPhone,
          name: snapshot.clientName,
          email: snapshot.clientEmail,
          appointmentAt: startAt,
          db: tx,
        });
        customerId = result.customer.id;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/requires an E\.164 phone/.test(error.message)
        ) {
          throw error;
        }
      }
    }

    const appointment = await createAppointmentRecord({
      barbershopId,
      employeeId,
      clientId: null,
      customerId,
      serviceId: bookingContext.service.id,
      startAt,
      endAt,
      snapshot,
      db: tx,
    });

    await scheduleAppointmentNotificationsForNewAppointment(tx, {
      appointmentId: appointment.id,
      now: notificationNow,
    });

    return tx.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include: APPOINTMENT_INCLUDE,
    });
  });
}

export async function getAppointmentAvailability(input: AvailabilityInput) {
  const {
    barbershopId,
    employeeId,
    query,
    userRole,
    authenticatedEmployeeId,
  } = input;

  if (userRole === 'BARBER') {
    if (!authenticatedEmployeeId) {
      throw new ForbiddenError(
        'Employee context required for barber availability access'
      );
    }

    if (employeeId !== authenticatedEmployeeId) {
      throw new AppError(
        403,
        'FORBIDDEN_EMPLOYEE_SCOPE',
        'Barbers can only view availability for their own employee profile'
      );
    }
  }

  const now = input.now ?? new Date();
  const { serviceId, localDate, excludeAppointmentId } = query;
  const timezone = await getBarbershopTimezone(barbershopId);
  if (localDate < getLocalDateStringInTimeZone(timezone, now)) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_DATE',
      'Availability cannot be requested for a past date'
    );
  }

  const { service } = await resolveEligibleBookingContext(
    barbershopId,
    employeeId,
    serviceId
  );

  if (excludeAppointmentId) {
    const excludedAppointment = await getAppointment(
      excludeAppointmentId,
      input.userId,
      userRole
    );
    if (excludedAppointment.barbershopId !== barbershopId) {
      throw new NotFoundError('Appointment');
    }
  }

  await releaseExpiredPaymentHolds({
    now,
    employeeId,
  });

  const slots = await buildAvailabilitySlots({
    barbershopId,
    employeeId,
    localDate,
    timezone,
    serviceDurationMinutes: service.durationMinutes,
    slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
    blockingStatuses: BLOCKING_APPOINTMENT_STATUSES,
    now,
    excludeAppointmentId,
  });

  return {
    localDate,
    barbershopTimezone: timezone,
    slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
    serviceDurationMinutes: service.durationMinutes,
    slots,
  };
}

/**
 * Lists appointments filtered by role and tenant.
 * - OWNER: sees all appointments for their barbershop
 * - BARBER: must use the employee-scoped listing endpoint
 * - CLIENT: sees only their own appointments
 */
export async function listAppointments(
  userId: string,
  role: UserRole,
  query: AppointmentListQuery
) {
  if (role === 'BARBER') {
    throw new ForbiddenError(
      'Barbers must use the employee-scoped appointments endpoint'
    );
  }

  const where: Prisma.AppointmentWhereInput = {};

  if (role === 'OWNER') {
    where.barbershop = { ownerId: userId };
  } else if (role === 'CLIENT') {
    where.clientId = userId;
  }

  let scopedWhere = where;

  if (role === 'OWNER' && query.date) {
    const ownerContext = await getOwnerAppointmentListContext(userId);
    if (!ownerContext) {
      return [];
    }

    scopedWhere = withLocalDateRange(where, query.date, ownerContext.timezone);
  }

  const appointments = await prisma.appointment.findMany({
    where: scopedWhere,
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: 'desc' },
    skip: query.offset,
    take: query.limit,
  });
  return applyOperationalPaymentReviews(appointments);
}

/**
 * Lists appointments for a specific employee within a barbershop.
 * Scoped endpoint — requires explicit barbershop + employee context.
 */
export async function listEmployeeAppointments(
  barbershopId: string,
  employeeId: string,
  userId: string,
  userRole: UserRole,
  query: AppointmentListQuery
) {
  await validateEmployeeInBarbershop(employeeId, barbershopId);

  if (userRole === 'BARBER') {
    const employee = await findActiveBarberEmployeeForBarbershop(
      userId,
      barbershopId
    );
    if (!employee || employee.id !== employeeId) {
      throw new ForbiddenError('You can only view your own appointments');
    }
  }

  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot access employee appointments');
  }

  const timezone = query.date
    ? await getBarbershopTimezone(barbershopId)
    : null;

  const appointments = await prisma.appointment.findMany({
    where: withLocalDateRange(
      {
        barbershopId,
        employeeId,
      },
      query.date,
      timezone ?? 'UTC'
    ),
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: 'desc' },
    skip: query.offset,
    take: query.limit,
  });
  return applyOperationalPaymentReviews(appointments);
}

/**
 * Gets a single appointment with tenant isolation.
 */
export async function getAppointment(
  appointmentId: string,
  userId: string,
  role: UserRole,
  db: AppointmentDb = prisma
) {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: APPOINTMENT_INCLUDE,
  });

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (role === 'OWNER') {
    const barbershop = await db.barbershop.findUnique({
      where: { id: appointment.barbershopId },
    });
    if (!barbershop || barbershop.ownerId !== userId) {
      throw new NotFoundError('Appointment');
    }
  } else if (role === 'BARBER') {
    const employee = await findActiveBarberEmployeeForBarbershop(
      userId,
      appointment.barbershopId,
      db
    );
    if (!employee || employee.id !== appointment.employeeId) {
      throw new NotFoundError('Appointment');
    }
  } else if (role === 'CLIENT') {
    if (appointment.clientId !== userId) {
      throw new NotFoundError('Appointment');
    }
  }

  return applyOperationalPaymentReview(appointment);
}

export async function listAppointmentNotifications(
  appointmentId: string,
  barbershopId: string
) {
  return listAppointmentNotificationSummaries(appointmentId, barbershopId);
}

export async function listAppointmentChanges(
  appointmentId: string,
  userId: string,
  role: UserRole
) {
  const appointment = await getAppointment(appointmentId, userId, role);
  const changes = await prisma.appointmentChange.findMany({
    where: {
      appointmentId: appointment.id,
      barbershopId: appointment.barbershopId,
    },
    select: APPOINTMENT_CHANGE_HISTORY_SELECT,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: 20,
  });

  return changes.map(mapAppointmentChangeHistoryRow);
}

/**
 * Legacy update flow used by existing clients.
 *
 * Preserves the pre-audit semantics:
 * - allows pending/confirmed/in-progress updates except terminal states
 * - supports notes-only edits
 * - syncs reminder notifications when startAt changes
 * - does not write appointmentChange audit rows or reschedule emails
 *
 * New audited staff reschedules should use PATCH /appointments/:id/reschedule.
 */
export async function updateAppointment(
  appointmentId: string,
  data: { startAt?: string; notes?: string },
  userId: string,
  role: UserRole
) {
  const appointment = await getAppointment(appointmentId, userId, role);

  if (role === 'CLIENT') {
    throw new ForbiddenError('Clients cannot reschedule appointments');
  }

  if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
    throw new BadRequestError(
      `Cannot update a ${appointment.status.toLowerCase()} appointment`
    );
  }

  if (!data.startAt && data.notes === undefined) {
    throw new BadRequestError('At least one field must be provided');
  }

  const updateData: Record<string, unknown> = {};

  if (data.startAt) {
    const newStartAt = new Date(data.startAt);
    const newEndAt = calculateAppointmentEndAt(
      newStartAt,
      appointment.serviceDurationMinutes
    );

    await validateEmployeeAvailabilityWindow({
      barbershopId: appointment.barbershopId,
      employeeId: appointment.employeeId,
      startAt: newStartAt,
      endAt: newEndAt,
      timezone: appointment.barbershop.timezone,
    });

    const conflict = await hasTimeConflict(
      appointment.employeeId,
      newStartAt,
      newEndAt,
      appointmentId
    );
    if (conflict) {
      throw new ConflictError(
        'The new time slot conflicts with an existing appointment'
      );
    }

    updateData.startAt = newStartAt;
    updateData.endAt = newEndAt;
  }

  if (data.notes !== undefined) {
    updateData.notes = normalizeOptionalText(data.notes);
  }

  const updateNow = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: updateData,
        include: APPOINTMENT_INCLUDE,
      });

      if (data.startAt) {
        await syncAppointmentReminderAfterReschedule(tx, {
          appointmentId,
          now: updateNow,
        });
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        include: APPOINTMENT_INCLUDE,
      });
    });
  } catch (err) {
    if (isDbDoubleBookingError(err)) {
      throw new ConflictError(
        'The new time slot conflicts with an existing appointment'
      );
    }
    throw err;
  }
}

function assertRescheduleEligibility(input: {
  status: AppointmentStatus;
  deletedAt: Date | null;
  startAt: Date;
  now: Date;
}): void {
  if (
    input.status !== 'CONFIRMED' ||
    input.deletedAt !== null ||
    input.startAt.getTime() <= input.now.getTime()
  ) {
    throw new AppError(
      409,
      'APPOINTMENT_RESCHEDULE_NOT_ALLOWED',
      'Only future confirmed appointments can be rescheduled'
    );
  }
}

function isNoopReschedule(input: {
  appointment: {
    employeeId: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
  };
  nextEmployeeId: string;
  nextServiceId: string;
  nextStartAt: Date;
  nextEndAt: Date;
}): boolean {
  return (
    input.appointment.employeeId === input.nextEmployeeId &&
    input.appointment.serviceId === input.nextServiceId &&
    input.appointment.startAt.getTime() === input.nextStartAt.getTime() &&
    input.appointment.endAt.getTime() === input.nextEndAt.getTime()
  );
}

export async function rescheduleAppointment(
  appointmentId: string,
  input: RescheduleAppointmentInput,
  userId: string,
  role: UserRole,
  now: Date = new Date()
) {
  if (role === 'CLIENT') {
    throw new ForbiddenError('Clients cannot reschedule appointments');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const appointment = await getAppointment(appointmentId, userId, role, tx);

      assertRescheduleEligibility({
        status: appointment.status,
        deletedAt: appointment.deletedAt,
        startAt: appointment.startAt,
        now,
      });

      const targetEmployeeId = input.employeeId ?? appointment.employeeId;
      const targetServiceId = input.serviceId ?? appointment.serviceId;

      if (role === 'BARBER' && targetEmployeeId !== appointment.employeeId) {
        throw new AppError(
          403,
          'FORBIDDEN_EMPLOYEE_SCOPE',
          'Barbers can only reschedule appointments within their own employee profile'
        );
      }

      const { employee: targetEmployee, service: targetService } =
        await resolveEligibleBookingContext(
          appointment.barbershopId,
          targetEmployeeId,
          targetServiceId,
          tx
        );

      const targetEmployeeProfile = await tx.employee.findUniqueOrThrow({
        where: { id: targetEmployee.id },
        select: {
          id: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      const nextStartAt = new Date(input.startAt);
      validateAppointmentStartAt(nextStartAt, appointment.barbershop.timezone, {
        now,
      });
      const nextEndAt = calculateAppointmentEndAt(
        nextStartAt,
        targetService.durationMinutes
      );

      if (
        isNoopReschedule({
          appointment,
          nextEmployeeId: targetEmployeeId,
          nextServiceId: targetServiceId,
          nextStartAt,
          nextEndAt,
        })
      ) {
        throw new AppError(
          400,
          'APPOINTMENT_RESCHEDULE_NOOP',
          'The appointment already matches the requested employee, service, and time'
        );
      }

      await validateEmployeeAvailabilityWindow({
        barbershopId: appointment.barbershopId,
        employeeId: targetEmployeeId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        timezone: appointment.barbershop.timezone,
        db: tx,
      });

      await releaseExpiredPaymentHolds({
        now,
        employeeId: targetEmployeeId,
      });

      const conflict = await hasTimeConflict(
        targetEmployeeId,
        nextStartAt,
        nextEndAt,
        appointment.id,
        tx
      );
      if (conflict) {
        throw new AppError(
          409,
          'APPOINTMENT_SLOT_UNAVAILABLE',
          'This time slot is already booked'
        );
      }

      const updateResult = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: 'CONFIRMED',
          deletedAt: null,
          employeeId: appointment.employeeId,
          serviceId: appointment.serviceId,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
        },
        data: {
          employeeId: targetEmployeeId,
          serviceId: targetServiceId,
          serviceName: targetService.name,
          servicePriceCents: targetService.priceCents,
          serviceDurationMinutes: targetService.durationMinutes,
          serviceCurrency: targetService.currency,
          startAt: nextStartAt,
          endAt: nextEndAt,
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          409,
          'APPOINTMENT_RESCHEDULE_CONFLICT',
          'The appointment was changed by another operation. Refresh and try again.'
        );
      }

      const change = await tx.appointmentChange.create({
        data: {
          barbershopId: appointment.barbershopId,
          appointmentId: appointment.id,
          type: 'RESCHEDULED',
          changedByUserId: userId,
          changedByRole: role,
          previousEmployeeId: appointment.employeeId,
          previousEmployeeName: toDisplayName(appointment.employee.user),
          previousServiceId: appointment.serviceId,
          previousServiceName: appointment.serviceName,
          previousStartAt: appointment.startAt,
          previousEndAt: appointment.endAt,
          newEmployeeId: targetEmployeeId,
          newEmployeeName: toDisplayName(targetEmployeeProfile.user),
          newServiceId: targetServiceId,
          newServiceName: targetService.name,
          newStartAt: nextStartAt,
          newEndAt: nextEndAt,
          reason: normalizeOptionalText(input.reason),
        },
      });

      await syncAppointmentReminderAfterReschedule(tx, {
        appointmentId: appointment.id,
        now,
      });

      await scheduleAppointmentRescheduledNotification(tx, {
        appointmentId: appointment.id,
        appointmentChangeId: change.id,
        now,
      });

      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: APPOINTMENT_INCLUDE,
      });
    });
  } catch (err) {
    if (isDbDoubleBookingError(err)) {
      throw new AppError(
        409,
        'APPOINTMENT_SLOT_UNAVAILABLE',
        'This time slot is already booked'
      );
    }
    throw err;
  }
}

/**
 * Transitions an appointment to a new status.
 * Enforces: tenant isolation, status transition rules, and
 * compare-and-swap atomicity.
 *
 * Side-effects:
 * - Stamps the matching lifecycle timestamp (confirmedAt, startedAt,
 *   completedAt, noShowAt) on the row. Centralized in
 *   {@link ../lib/appointmentLifecycle.ts} so no-show analytics and
 *   customer history queries stay correct.
 *
 * Atomicity:
 * - The update is performed as `updateMany({ where: { id, status:
 *   fromStatus } })` so a competing transition (e.g. another
 *   staff member racing the same row) cannot interleave: the
 *   loser observes `count = 0` and the function throws an
 *   {@link AppointmentTransitionConflictError} with the stable
 *   `APPOINTMENT_TRANSITION_CONFLICT` code.
 * - The role check still runs first so a 403 is returned when the
 *   caller is not allowed; the CAS only protects against
 *   concurrent same-role transitions.
 */
export async function transitionAppointmentStatus(
  appointmentId: string,
  newStatus: AppointmentStatus,
  userId: string,
  role: UserRole,
  now: Date = new Date()
) {
  const appointment = await getAppointment(appointmentId, userId, role);

  validateStatusTransition(appointment.status, newStatus, role);

  if (appointment.status === 'PENDING' && newStatus === 'CONFIRMED') {
    await assertAppointmentCanBeConfirmedWithPayment({ appointmentId });
  }

  const lifecycleUpdate = buildLifecycleUpdateForStatus(newStatus, role, now);

  return prisma.$transaction(async (tx) => {
    const result = await compareAndSwapAppointmentStatus({
      id: appointmentId,
      fromStatus: appointment.status,
      toStatus: newStatus,
      lifecycle: lifecycleUpdate,
      db: tx,
    });

    if (result.count === 0) {
      throw new AppointmentTransitionConflictError(
        appointment.status,
        newStatus
      );
    }

    if (newStatus === 'CANCELLED') {
      await syncBookingPaymentOnAppointmentCancellation({
        appointmentId,
        barbershopId: appointment.barbershopId,
        now,
        reasonCode: 'APPOINTMENT_CANCELLED_BY_STAFF',
        db: tx,
      });
      await cancelAppointmentNotifications(tx, {
        appointmentId,
        barbershopId: appointment.barbershopId,
        types: ['BOOKING_CONFIRMATION', 'REMINDER_24H'],
        now,
      });
    } else if (appointment.status === 'PENDING' && newStatus === 'CONFIRMED') {
      await scheduleAppointmentNotificationsForNewAppointment(tx, {
        appointmentId,
        now,
      });
    } else if (newStatus === 'COMPLETED' || newStatus === 'NO_SHOW') {
      await cancelAppointmentNotifications(tx, {
        appointmentId,
        barbershopId: appointment.barbershopId,
        types: ['REMINDER_24H'],
        now,
      });
    }

    return tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: APPOINTMENT_INCLUDE,
    });
  });
}

/**
 * Cancels an appointment (CLIENT self-cancel or OWNER/BARBER cancel).
 *
 * Records the cancellation actor (UserRole), source (STAFF for
 * OWNER/BARBER, AUTHENTICATED_CLIENT for CLIENT), timestamp, and
 * optional reason. The reason is trimmed and clamped to 500 chars
 * by the lifecycle helper; an empty/whitespace reason is stored as
 * NULL.
 */
export async function cancelAppointment(
  appointmentId: string,
  userId: string,
  role: UserRole,
  options: { reason?: string | null; now?: Date } = {}
) {
  const appointment = await getAppointment(appointmentId, userId, role);

  if (role === 'CLIENT' && appointment.clientId !== userId) {
    throw new ForbiddenError('You can only cancel your own appointments');
  }

  if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
    throw new BadRequestError(
      `Cannot cancel a ${appointment.status.toLowerCase()} appointment`
    );
  }

  // Decoupled source: OWNER/BARBER writes STAFF, CLIENT writes
  // AUTHENTICATED_CLIENT. Anonymous flows (public booking cancel,
  // future automated jobs) call this helper with a different source.
  const cancellationSource = role === 'CLIENT' ? 'AUTHENTICATED_CLIENT' : 'STAFF';

  const lifecycleUpdate = buildLifecycleUpdateForCancel({
    actorRole: role,
    source: cancellationSource,
    now: options.now ?? new Date(),
    reason: options.reason,
  });

  // Compare-and-swap: the cancellation succeeds only when the
  // row is still in a non-terminal state. A concurrent staff
  // cancel or a public cancel that wins the race will leave the
  // row in a terminal state; this caller then observes count = 0
  // and gets a deterministic 409 conflict.
  return prisma.$transaction(async (tx) => {
    const result = await compareAndSwapAppointmentStatus({
      id: appointmentId,
      fromStatus: appointment.status,
      toStatus: 'CANCELLED',
      lifecycle: lifecycleUpdate,
      db: tx,
    });

    if (result.count === 0) {
      throw new AppointmentTransitionConflictError(
        appointment.status,
        'CANCELLED'
      );
    }

    await syncBookingPaymentOnAppointmentCancellation({
      appointmentId,
      barbershopId: appointment.barbershopId,
      now: options.now ?? new Date(),
      reasonCode:
        role === 'CLIENT'
          ? 'APPOINTMENT_CANCELLED_BY_CLIENT'
          : 'APPOINTMENT_CANCELLED_BY_STAFF',
      db: tx,
    });

    await cancelAppointmentNotifications(tx, {
      appointmentId,
      barbershopId: appointment.barbershopId,
      types: ['BOOKING_CONFIRMATION', 'REMINDER_24H'],
      now: options.now ?? new Date(),
    });

    return tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: APPOINTMENT_INCLUDE,
    });
  });
}

// ============================================
// CUSTOMER INSIGHTS (REPEAT-CUSTOMER LOOKUP)
// ============================================

/**
 * Customer insights payload returned by the lookup endpoint.
 *
 * Intentionally omits the submitted phone: the caller already has
 * it, repeating it would expose PII in API logs that capture
 * response bodies, and it provides no new information to the staff
 * UI (the warning banner is the actionable part).
 */
export interface CustomerInsights {
  visitCount: number;
  noShowCount: number;
  cancelledCount: number;
  completedCount: number;
  lastVisitAt: string | null;
  lastNoShowAt: string | null;
  recentAppointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: AppointmentStatus;
    serviceName: string;
    employeeName: string | null;
  }>;
}

export interface LookupCustomerInput {
  barbershopId: string;
  phone: string;
  limit: number;
  userId: string;
  userRole: UserRole;
}

const MAX_LOOKUP_RECENT_APPOINTMENTS = 50;

/**
 * Aggregates appointment history for a single normalized phone inside
 * a single barbershop. Used by the staff create flow to surface
 * repeat-customer / no-show warnings before a new booking is
 * committed.
 *
 * Tenant scoping is enforced here:
 * - OWNER: must own the barbershop.
 * - BARBER: must be an active employee of the barbershop.
 * - CLIENT: forbidden (returns ForbiddenError).
 *
 * The lookup prefers the first-class `Customer` model:
 *  1. Find a non-deleted Customer by (barbershopId, phoneNormalized).
 *     The unique index makes this a single-row read.
 *  2. Aggregate appointments linked via `customerId`.
 *  3. Fall back to legacy `clientPhoneNormalized` matches for any
 *     appointments that pre-date the customer link (defensive; the
 *     backfill should have linked them, but a runtime fallback is
 *     cheap and prevents regressions if the migration was skipped).
 *
 * Returns a zeroed-out `CustomerInsights` shape when the phone has no
 * history in this barbershop, so the mobile UI can render an empty
 * state without a special-case branch.
 */
export async function lookupCustomerByPhone(
  input: LookupCustomerInput
): Promise<CustomerInsights> {
  const { barbershopId, phone, limit, userId, userRole } = input;
  const safeLimit = Math.min(
    Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 10, 1),
    MAX_LOOKUP_RECENT_APPOINTMENTS
  );

  if (userRole === 'OWNER') {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { ownerId: true },
    });
    if (!barbershop || barbershop.ownerId !== userId) {
      // Hide existence: same as getAppointment returning 404 on cross-tenant.
      throw new NotFoundError('Customer');
    }
  } else if (userRole === 'BARBER') {
    const employee = await findActiveBarberEmployeeForBarbershop(
      userId,
      barbershopId
    );
    if (!employee) {
      throw new NotFoundError('Customer');
    }
  } else {
    // Customers are intentionally not granted access to this endpoint
    // today; defer until a real customer mobile flow exists.
    throw new ForbiddenError('Customer history is not available for this role');
  }

  // Try the first-class Customer model first.
  const customer = await prisma.customer.findFirst({
    where: {
      barbershopId,
      phoneNormalized: phone,
      deletedAt: null,
    },
    select: { id: true },
  });

  const matches = await prisma.appointment.findMany({
    where: {
      barbershopId,
      deletedAt: null,
      OR: customer
        ? [
            { customerId: customer.id },
            // Defensive fallback: appointments that pre-date the
            // customer link. The backfill should have linked them but
            // this preserves correctness if the migration was
            // skipped or the link was cleared.
            { customerId: null, clientPhoneNormalized: phone },
          ]
        : [{ clientPhoneNormalized: phone }],
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      serviceName: true,
      employee: {
        select: {
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { startAt: 'desc' },
  });

  let noShowCount = 0;
  let cancelledCount = 0;
  let completedCount = 0;
  let lastVisitAt: Date | null = null;
  let lastNoShowAt: Date | null = null;

  for (const match of matches) {
    if (match.status === 'NO_SHOW') {
      noShowCount += 1;
      if (!lastNoShowAt || match.startAt > lastNoShowAt) {
        lastNoShowAt = match.startAt;
      }
    } else if (match.status === 'CANCELLED') {
      cancelledCount += 1;
    } else if (match.status === 'COMPLETED') {
      completedCount += 1;
    }
    if (!lastVisitAt || match.startAt > lastVisitAt) {
      lastVisitAt = match.startAt;
    }
  }

  const recentAppointments = matches.slice(0, safeLimit).map((match) => ({
    id: match.id,
    startAt: match.startAt.toISOString(),
    endAt: match.endAt.toISOString(),
    status: match.status,
    serviceName: match.serviceName,
    employeeName:
      match.employee.user.name?.trim() ||
      match.employee.user.email ||
      null,
  }));

  return {
    visitCount: matches.length,
    noShowCount,
    cancelledCount,
    completedCount,
    lastVisitAt: lastVisitAt ? lastVisitAt.toISOString() : null,
    lastNoShowAt: lastNoShowAt ? lastNoShowAt.toISOString() : null,
    recentAppointments,
  };
}
