/**
 * Appointment business logic service
 *
 * All security guarantees (tenant isolation, role permissions, double-booking,
 * status transitions) are enforced HERE against the REAL database.
 * This is the single source of truth for business rules.
 */
import { prisma } from '../lib/prisma.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import { validateBusinessHours } from '../lib/businessHours.js';
import { validateEmployeeInBarbershop } from './employeeService.js';
import type { AppointmentStatus, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CreateAppointmentInput } from '../schemas/appointment.js';

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
  CANCELLED: [], // Terminal state - no transitions allowed
  COMPLETED: [], // Terminal state - no transitions allowed
  NO_SHOW: [], // Terminal state - no transitions allowed
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

/**
 * Validates that a service belongs to the specified barbershop.
 */
async function validateServiceBelongsToBarbershop(
  serviceId: string,
  barbershopId: string
): Promise<void> {
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
}

/**
 * Validates that an employee belongs to the specified barbershop.
 */
async function validateEmployeeBelongsToBarbershop(
  employeeId: string,
  barbershopId: string
): Promise<void> {
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
    throw new BadRequestError(
      'Employee does not offer this service'
    );
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
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      // Overlap detection: existing.startAt < new.endAt AND existing.endAt > new.startAt
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
  const { barbershopId, employeeId, serviceId, startAt: startAtStr, notes } = input;

  // 1. Validate tenant integrity: service and employee belong to barbershop
  await validateServiceBelongsToBarbershop(serviceId, barbershopId);
  await validateEmployeeBelongsToBarbershop(employeeId, barbershopId);
  await validateEmployeeOffersService(employeeId, serviceId);

  // 2. Calculate endAt from service duration
  const service = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
  });

  const startAt = new Date(startAtStr);
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  // 3. Validate business hours
  await validateBusinessHours({ barbershopId, startAt, endAt });

  // 4. Check double-booking
  const conflict = await hasTimeConflict(employeeId, startAt, endAt);
  if (conflict) {
    throw new ConflictError('This time slot is already booked');
  }

  // 5. Create appointment
  try {
    const appointment = await prisma.appointment.create({
      data: {
        barbershopId,
        employeeId,
        clientId,
        serviceId,
        startAt,
        endAt,
        notes: notes || null,
        status: 'PENDING',
      },
      include: {
        barbershop: true,
        employee: true,
        client: true,
        service: true,
      },
    });

    return appointment;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientUnknownRequestError &&
      err.message.includes('no_double_booking')
    ) {
      throw new ConflictError('This time slot is already booked');
    }
    throw err;
  }
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
  // BARBER without employee context: fail closed — prevent broad data leak
  if (role === 'BARBER' && !employeeId) {
    throw new ForbiddenError(
      'Employee context required for barber appointment listing'
    );
  }

  const where: Record<string, unknown> = {};

  if (role === 'OWNER') {
    // Owner sees all appointments for shops they own
    where.barbershop = { ownerId: userId };
  } else if (role === 'BARBER') {
    // Barber sees only their appointments (employeeId guaranteed by check above)
    where.employeeId = employeeId;
  } else if (role === 'CLIENT') {
    // Client sees only their own appointments
    where.clientId = userId;
  }

  return prisma.appointment.findMany({
    where,
    include: {
      barbershop: true,
      employee: true,
      client: true,
      service: true,
    },
    orderBy: { startAt: 'desc' },
    take: 100,
  });
}

/**
 * Lists appointments for a specific employee within a barbershop.
 * Scoped endpoint — requires explicit barbershop + employee context.
 *
 * - OWNER: can list appointments for any active employee in their barbershop
 * - BARBER: can list only their own appointments (employee.userId must match)
 * - CLIENT: blocked (403)
 *
 * Validates that the employee exists, is active, and belongs to the barbershop
 * via validateEmployeeInBarbershop (reused from employeeService).
 */
export async function listEmployeeAppointments(
  barbershopId: string,
  employeeId: string,
  userId: string,
  userRole: UserRole
) {
  // Validate employee exists, is active, and belongs to barbershop
  await validateEmployeeInBarbershop(employeeId, barbershopId);

  // BARBER: must own this employee record (their own)
  if (userRole === 'BARBER') {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee || employee.userId !== userId) {
      throw new ForbiddenError('You can only view your own appointments');
    }
  }

  // CLIENT: not allowed
  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot access employee appointments');
  }

  return prisma.appointment.findMany({
    where: {
      barbershopId,
      employeeId,
    },
    include: {
      barbershop: true,
      employee: true,
      client: true,
      service: true,
    },
    orderBy: { startAt: 'desc' },
    take: 100,
  });
}

/**
 * Gets a single appointment with tenant isolation.
 * - OWNER: can see if they own the barbershop
 * - BARBER: can see if assigned to them
 * - CLIENT: can see if it's their appointment
 */
export async function getAppointment(
  appointmentId: string,
  userId: string,
  role: UserRole
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      barbershop: true,
      employee: true,
      client: true,
      service: true,
    },
  });

  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  // Tenant isolation check
  if (role === 'OWNER') {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: appointment.barbershopId },
    });
    if (!barbershop || barbershop.ownerId !== userId) {
      throw new NotFoundError('Appointment');
    }
  } else if (role === 'BARBER') {
    const employee = await prisma.employee.findFirst({
      where: { userId, barbershopId: appointment.barbershopId },
    });
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

  // Only OWNER and the assigned BARBER can update
  if (role === 'CLIENT') {
    throw new ForbiddenError('Clients cannot reschedule appointments');
  }

  // Only active appointments can be updated
  if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
    throw new BadRequestError(
      `Cannot update a ${appointment.status.toLowerCase()} appointment`
    );
  }

  const updateData: Record<string, unknown> = {};

  if (data.startAt) {
    const service = await prisma.service.findUniqueOrThrow({
      where: { id: appointment.serviceId },
    });
    const newStartAt = new Date(data.startAt);
    const newEndAt = new Date(
      newStartAt.getTime() + service.durationMinutes * 60_000
    );

    // Validate business hours for the new time slot
    await validateBusinessHours({
      barbershopId: appointment.barbershopId,
      startAt: newStartAt,
      endAt: newEndAt,
    });

    // Check for time conflicts (excluding this appointment)
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
    updateData.notes = data.notes || null;
  }

  try {
    return await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData,
      include: {
        barbershop: true,
        employee: true,
        client: true,
        service: true,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientUnknownRequestError &&
      err.message.includes('no_double_booking')
    ) {
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

  // Validate the transition is allowed
  validateStatusTransition(appointment.status, newStatus, role);

  // Additional BARBER check: can only transition their own appointments
  if (role === 'BARBER') {
    const employee = await prisma.employee.findFirst({
      where: { userId, barbershopId: appointment.barbershopId },
    });
    if (!employee || employee.id !== appointment.employeeId) {
      throw new ForbiddenError(
        'You can only manage your own appointments'
      );
    }
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: newStatus },
    include: {
      barbershop: true,
      employee: true,
      client: true,
      service: true,
    },
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

  // CLIENT can only cancel their own appointments
  if (role === 'CLIENT' && appointment.clientId !== userId) {
    throw new ForbiddenError('You can only cancel your own appointments');
  }

  // Terminal states cannot be cancelled again
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
