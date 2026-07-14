/**
 * Appointment business logic service
 *
 * All security guarantees (tenant isolation, role permissions, double-booking,
 * status transitions) are enforced HERE against the REAL database.
 * This is the single source of truth for business rules.
 */
import { prisma } from '../lib/prisma.js';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import {
  getLocalDayAndTime,
  validateBusinessHours,
} from '../lib/businessHours.js';
import {
  getLocalDateStringInTimeZone,
  getUtcRangeForLocalDate,
} from '../lib/dateUtils.js';
import {
  APPOINTMENT_SLOT_INTERVAL_MINUTES,
  isSlotBoundaryMinute,
} from '../lib/appointmentScheduling.js';
import { buildAvailabilitySlots } from '../lib/availabilitySlots.js';
import {
  buildLifecycleUpdateForCancel,
  buildLifecycleUpdateForStatus,
} from '../lib/appointmentLifecycle.js';
import { tryNormalizeClientPhoneE164 } from '../lib/phoneNormalization.js';
import { validateEmployeeInBarbershop } from './employeeService.js';
import type {
  AppointmentStatus,
  Employee,
  PrismaClient,
  Service,
  User,
  UserRole,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  AppointmentAvailabilityQuery,
  AppointmentListQuery,
  CreateAppointmentInput,
  StaffCreateAppointmentInput,
} from '../schemas/appointment.js';

const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
];

const APPOINTMENT_INCLUDE = {
  barbershop: true,
  employee: true,
  client: true,
  service: true,
} satisfies Prisma.AppointmentInclude;

interface AppointmentSnapshotInput {
  clientName: string;
  clientPhone: string | null;
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

function normalizeRequiredClientName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestError('Client name is required');
  }
  return trimmed;
}

function isDbDoubleBookingError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientUnknownRequestError &&
    err.message.includes('no_double_booking')
  );
}

async function getClientSnapshotSource(clientId: string): Promise<User> {
  return prisma.user.findUniqueOrThrow({ where: { id: clientId } });
}

async function findActiveBarberEmployeeForBarbershop(
  userId: string,
  barbershopId: string
): Promise<Employee | null> {
  return prisma.employee.findFirst({
    where: {
      userId,
      barbershopId,
      isActive: true,
      deletedAt: null,
    },
  });
}

function buildClientSnapshotFromUser(
  client: User,
  notes?: string | null
): Pick<AppointmentSnapshotInput, 'clientName' | 'clientPhone' | 'notes'> {
  return {
    clientName: client.name?.trim() || client.email,
    clientPhone: null,
    notes: normalizeOptionalText(notes),
  };
}

function buildGuestClientSnapshot(input: {
  clientName: string;
  clientPhone?: string;
  notes?: string;
}): Pick<AppointmentSnapshotInput, 'clientName' | 'clientPhone' | 'notes'> {
  return {
    clientName: normalizeRequiredClientName(input.clientName),
    clientPhone: normalizeOptionalText(input.clientPhone),
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
  barbershopId: string
): Promise<Service> {
  const service = await prisma.service.findUnique({
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
  barbershopId: string
): Promise<Employee> {
  const employee = await prisma.employee.findUnique({
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
  serviceId: string
): Promise<void> {
  const link = await prisma.employeeService.findUnique({
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
  serviceId: string
): Promise<EligibleBookingContext> {
  const [employee, service] = await Promise.all([
    validateEmployeeBelongsToBarbershop(employeeId, barbershopId),
    validateServiceBelongsToBarbershop(serviceId, barbershopId),
  ]);

  await validateEmployeeOffersService(employee.id, service.id);

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
        serviceId,
        startAt,
        endAt,
        status: options?.status ?? 'PENDING',
        clientName: snapshot.clientName,
        clientPhone: snapshot.clientPhone,
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
      status: { in: BLOCKING_APPOINTMENT_STATUSES },
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

  await validateBusinessHours({ barbershopId, startAt, endAt });

  const conflict = await hasTimeConflict(employeeId, startAt, endAt);
  if (conflict) {
    throw new ConflictError('This time slot is already booked');
  }

  const snapshot: AppointmentSnapshotInput = {
    ...buildClientSnapshotFromUser(client, notes),
    ...buildServiceSnapshot(service),
  };

  return createAppointmentRecord({
    barbershopId,
    employeeId,
    clientId,
    serviceId,
    startAt,
    endAt,
    snapshot,
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
  validateAppointmentStartAt(startAt, timezone);

  const endAt = calculateAppointmentEndAt(
    startAt,
    bookingContext.service.durationMinutes
  );

  await validateBusinessHours({
    barbershopId,
    startAt,
    endAt,
  });

  const conflict = await hasTimeConflict(employeeId, startAt, endAt);
  if (conflict) {
    throw new ConflictError('This time slot is already booked');
  }

  const snapshot: AppointmentSnapshotInput = {
    ...buildGuestClientSnapshot(input),
    ...buildServiceSnapshot(bookingContext.service),
  };

  return createAppointmentRecord({
    barbershopId,
    employeeId,
    clientId: null,
    serviceId: bookingContext.service.id,
    startAt,
    endAt,
    snapshot,
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
  const { serviceId, localDate } = query;
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
  const slots = await buildAvailabilitySlots({
    barbershopId,
    employeeId,
    localDate,
    timezone,
    serviceDurationMinutes: service.durationMinutes,
    slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
    blockingStatuses: BLOCKING_APPOINTMENT_STATUSES,
    now,
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

  return prisma.appointment.findMany({
    where: scopedWhere,
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: 'desc' },
    skip: query.offset,
    take: query.limit,
  });
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

  return prisma.appointment.findMany({
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
}

/**
 * Gets a single appointment with tenant isolation.
 */
export async function getAppointment(
  appointmentId: string,
  userId: string,
  role: UserRole
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: APPOINTMENT_INCLUDE,
  });

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (role === 'OWNER') {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: appointment.barbershopId },
    });
    if (!barbershop || barbershop.ownerId !== userId) {
      throw new NotFoundError('Appointment');
    }
  } else if (role === 'BARBER') {
    const employee = await findActiveBarberEmployeeForBarbershop(
      userId,
      appointment.barbershopId
    );
    if (!employee || employee.id !== appointment.employeeId) {
      throw new NotFoundError('Appointment');
    }
  } else if (role === 'CLIENT') {
    if (appointment.clientId !== userId) {
      throw new NotFoundError('Appointment');
    }
  }

  return appointment;
}

/**
 * Updates an appointment (reschedule).
 * Enforces: tenant isolation, business hours, double-booking prevention.
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

  const updateData: Record<string, unknown> = {};

  if (data.startAt) {
    const newStartAt = new Date(data.startAt);
    const newEndAt = calculateAppointmentEndAt(
      newStartAt,
      appointment.serviceDurationMinutes
    );

    await validateBusinessHours({
      barbershopId: appointment.barbershopId,
      startAt: newStartAt,
      endAt: newEndAt,
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

  try {
    return await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData,
      include: APPOINTMENT_INCLUDE,
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

/**
 * Transitions an appointment to a new status.
 * Enforces: tenant isolation, status transition rules.
 *
 * Side-effects:
 * - Stamps the matching lifecycle timestamp (confirmedAt, startedAt,
 *   completedAt, noShowAt) on the row. Centralized in
 *   {@link ../lib/appointmentLifecycle.ts} so no-show analytics and
 *   customer history queries stay correct.
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

  const lifecycleUpdate = buildLifecycleUpdateForStatus(newStatus, role, now);

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: newStatus, ...lifecycleUpdate },
    include: APPOINTMENT_INCLUDE,
  });
}

/**
 * Cancels an appointment (CLIENT self-cancel or OWNER/BARBER cancel).
 *
 * Records the cancellation actor (UserRole), timestamp, and optional
 * reason. The reason is trimmed and clamped to 500 chars by the
 * lifecycle helper; an empty/whitespace reason is stored as NULL.
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

  const lifecycleUpdate = buildLifecycleUpdateForCancel(
    role,
    options.now ?? new Date(),
    options.reason
  );

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLED',
      ...lifecycleUpdate,
    },
    include: APPOINTMENT_INCLUDE,
  });
}

// ============================================
// CUSTOMER INSIGHTS (REPEAT-CUSTOMER LOOKUP)
// ============================================

export interface CustomerInsights {
  phone: string;
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
 * Tenant scoping is enforced here (and again at the route via
 * `requireBarbershopAccess`):
 * - OWNER: must own the barbershop.
 * - BARBER: must be an active employee of the barbershop.
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

  const matches = await prisma.appointment.findMany({
    where: {
      barbershopId,
      clientPhoneNormalized: phone,
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
    phone,
    visitCount: matches.length,
    noShowCount,
    cancelledCount,
    completedCount,
    lastVisitAt: lastVisitAt ? lastVisitAt.toISOString() : null,
    lastNoShowAt: lastNoShowAt ? lastNoShowAt.toISOString() : null,
    recentAppointments,
  };
}
