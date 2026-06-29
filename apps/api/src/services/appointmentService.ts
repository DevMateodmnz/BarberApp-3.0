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
  timeToMinutes,
  validateBusinessHours,
} from '../lib/businessHours.js';
import {
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
  getUtcRangeForLocalDate,
  localDateTimeToUtc,
} from '../lib/dateUtils.js';
import { validateEmployeeInBarbershop } from './employeeService.js';
import type {
  AppointmentStatus,
  Employee,
  Service,
  User,
  UserRole,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  AppointmentAvailabilityQuery,
  CreateAppointmentInput,
  StaffCreateAppointmentInput,
} from '../schemas/appointment.js';

const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
];

const APPOINTMENT_SLOT_INTERVAL_MINUTES = 30;

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

function buildServiceSnapshot(
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

function calculateAppointmentEndAt(
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

function validateStaffStartAt(
  startAt: Date,
  timezone: string,
  now: Date = new Date()
): void {
  if (startAt.getTime() <= now.getTime()) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_TIME',
      'Appointments must be scheduled in the future'
    );
  }

  const { minutesSinceMidnight } = getLocalDayAndTime(startAt, timezone);
  if (minutesSinceMidnight % APPOINTMENT_SLOT_INTERVAL_MINUTES !== 0) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_TIME',
      'Appointments must start on a 30-minute interval'
    );
  }
}

function candidateSlotsOverlap(
  startAt: Date,
  endAt: Date,
  existing: { startAt: Date; endAt: Date }[]
): boolean {
  return existing.some(
    (appointment) => appointment.startAt < endAt && appointment.endAt > startAt
  );
}

async function createAppointmentRecord(input: {
  barbershopId: string;
  employeeId: string;
  clientId: string | null;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  snapshot: AppointmentSnapshotInput;
}) {
  const { barbershopId, employeeId, clientId, serviceId, startAt, endAt, snapshot } = input;

  try {
    return await prisma.appointment.create({
      data: {
        barbershopId,
        employeeId,
        clientId,
        serviceId,
        startAt,
        endAt,
        status: 'PENDING',
        clientName: snapshot.clientName,
        clientPhone: snapshot.clientPhone,
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
  excludeId?: string
): Promise<boolean> {
  const conflict = await prisma.appointment.findFirst({
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

  const [{ service }, client] = await Promise.all([
    resolveEligibleBookingContext(barbershopId, employeeId, serviceId),
    getClientSnapshotSource(clientId),
  ]);

  const startAt = new Date(startAtStr);
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
  validateStaffStartAt(startAt, timezone);

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
  const todayLocalDate = getLocalDateStringInTimeZone(timezone, now);

  if (localDate < todayLocalDate) {
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

  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const workingHours = await prisma.workingHours.findUnique({
    where: {
      barbershopId_dayOfWeek: {
        barbershopId,
        dayOfWeek,
      },
    },
  });

  if (!workingHours || !workingHours.isActive) {
    return {
      localDate,
      barbershopTimezone: timezone,
      slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
      serviceDurationMinutes: service.durationMinutes,
      slots: [],
    };
  }

  const { startUtc, endUtc } = getUtcRangeForLocalDate(localDate, timezone);
  const blockingAppointments = await prisma.appointment.findMany({
    where: {
      employeeId,
      status: { in: BLOCKING_APPOINTMENT_STATUSES },
      startAt: { lt: endUtc },
      endAt: { gt: startUtc },
    },
    select: {
      startAt: true,
      endAt: true,
    },
    orderBy: { startAt: 'asc' },
  });

  const openMinutes = timeToMinutes(workingHours.openTime);
  const closeMinutes = timeToMinutes(workingHours.closeTime);
  const latestStartMinutes = closeMinutes - service.durationMinutes;
  const slots: Array<{
    startAt: string;
    endAt: string;
    localStartTime: string;
    localEndTime: string;
  }> = [];

  for (
    let startMinutes = openMinutes;
    startMinutes <= latestStartMinutes;
    startMinutes += APPOINTMENT_SLOT_INTERVAL_MINUTES
  ) {
    const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
    const candidateStartAt = localDateTimeToUtc(localDate, startTime, timezone);

    if (candidateStartAt.getTime() <= now.getTime()) {
      continue;
    }

    const candidateEndAt = calculateAppointmentEndAt(
      candidateStartAt,
      service.durationMinutes
    );

    if (candidateSlotsOverlap(candidateStartAt, candidateEndAt, blockingAppointments)) {
      continue;
    }

    slots.push({
      startAt: candidateStartAt.toISOString(),
      endAt: candidateEndAt.toISOString(),
      localStartTime: getLocalTimeStringInTimeZone(timezone, candidateStartAt),
      localEndTime: getLocalTimeStringInTimeZone(timezone, candidateEndAt),
    });
  }

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
 * - BARBER: sees appointments assigned to them (scope: their employee record).
 *           Requires employeeId to be set by upstream middleware.
 *           Fails closed if employeeId is missing (no broad data leak).
 * - CLIENT: sees only their own appointments
 */
export async function listAppointments(
  userId: string,
  role: UserRole,
  employeeId?: string
) {
  if (role === 'BARBER' && !employeeId) {
    throw new ForbiddenError(
      'Employee context required for barber appointment listing'
    );
  }

  const where: Record<string, unknown> = {};

  if (role === 'OWNER') {
    where.barbershop = { ownerId: userId };
  } else if (role === 'BARBER') {
    where.employeeId = employeeId;
  } else if (role === 'CLIENT') {
    where.clientId = userId;
  }

  return prisma.appointment.findMany({
    where,
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: 'desc' },
    take: 100,
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
  userRole: UserRole
) {
  await validateEmployeeInBarbershop(employeeId, barbershopId);

  if (userRole === 'BARBER') {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee || employee.userId !== userId) {
      throw new ForbiddenError('You can only view your own appointments');
    }
  }

  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot access employee appointments');
  }

  return prisma.appointment.findMany({
    where: {
      barbershopId,
      employeeId,
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startAt: 'desc' },
    take: 100,
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
 */
export async function transitionAppointmentStatus(
  appointmentId: string,
  newStatus: AppointmentStatus,
  userId: string,
  role: UserRole
) {
  const appointment = await getAppointment(appointmentId, userId, role);

  validateStatusTransition(appointment.status, newStatus, role);

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: newStatus },
    include: APPOINTMENT_INCLUDE,
  });
}

/**
 * Cancels an appointment (CLIENT self-cancel or OWNER cancel).
 */
export async function cancelAppointment(
  appointmentId: string,
  userId: string,
  role: UserRole
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

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CANCELLED' },
  });
}
