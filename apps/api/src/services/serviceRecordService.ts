/**
 * Service Record business logic service
 *
 * Provides walk-in service record creation and listing for barbershops.
 * BARBER can only record their own work. OWNER can record/list for any employee.
 * CLIENTs are denied all access.
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { getUtcRangeForLocalDate } from '../lib/dateUtils.js';
import type { CreateServiceRecordInput } from '../schemas/serviceRecord.js';
import type { UserRole } from '@prisma/client';

/**
 * Creates a new service record for a completed service/cut.
 *
 * Validations (in order):
 * 1. Employee must exist, be active, belong to the barbershop, not deleted
 * 2. BARBERs can only record for themselves
 * 3. CLIENTs are denied
 * 4. Service must exist, be active, belong to the barbershop, not deleted
 * 5. Employee must be assigned to the service
 */
export async function createServiceRecord(
  barbershopId: string,
  input: CreateServiceRecordInput,
  userId: string,
  userRole: UserRole
) {
  // 1. Validate employee exists, is active, belongs to barbershop, not deleted
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });

  if (!employee || employee.deletedAt) {
    throw new NotFoundError('Employee');
  }
  if (employee.barbershopId !== barbershopId) {
    throw new NotFoundError('Employee');
  }
  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  // 2. BARBER check: can only record for themselves
  if (userRole === 'BARBER') {
    if (employee.userId !== userId) {
      throw new ForbiddenError('You can only record services for yourself');
    }
  }

  // 3. CLIENT check: denied
  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot create service records');
  }

  // 4. Validate service
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });

  if (!service) {
    throw new NotFoundError('Service');
  }
  if (service.barbershopId !== barbershopId) {
    throw new NotFoundError('Service');
  }
  if (!service.isActive || service.deletedAt) {
    throw new BadRequestError('Service is not available');
  }

  // 5. Validate employee-service assignment
  const assignment = await prisma.employeeService.findUnique({
    where: {
      employeeId_serviceId: {
        employeeId: input.employeeId,
        serviceId: input.serviceId,
      },
    },
  });

  if (!assignment) {
    throw new BadRequestError('Employee is not assigned to this service');
  }

  // 6. Create the record
  return prisma.serviceRecord.create({
    data: {
      barbershopId,
      employeeId: input.employeeId,
      serviceId: input.serviceId,
      priceCents: input.priceCents,
      performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
      clientName: input.clientName?.trim() || null,
      paymentMethod: input.paymentMethod || null,
      notes: input.notes?.trim() || null,
      appointmentId: null,
    },
    include: {
      service: { select: { id: true, name: true } },
      employee: { select: { id: true, user: { select: { id: true, name: true } } } },
    },
  });
}

/**
 * Lists service records for a barbershop (OWNER only).
 *
 * Defense-in-depth: validates barbershop ownership.
 * Supports optional filters: employeeId, date.
 */
export async function listBarbershopRecords(
  barbershopId: string,
  userId: string,
  filters?: { employeeId?: string; date?: string }
) {
  // Validate barbershop ownership (defense-in-depth)
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { ownerId: true, timezone: true },
  });

  if (!barbershop || barbershop.ownerId !== userId) {
    throw new NotFoundError('Barbershop');
  }

  const where: Record<string, unknown> = {
    barbershopId,
    deletedAt: null,
  };

  if (filters?.employeeId) {
    where.employeeId = filters.employeeId;
  }

  if (filters?.date) {
    const dateStr = filters.date;
    const timezone = barbershop.timezone;
    const { startUtc, endUtc } = getUtcRangeForLocalDate(dateStr, timezone);
    where.performedAt = {
      gte: startUtc,
      lt: endUtc,
    };
  }

  return prisma.serviceRecord.findMany({
    where,
    include: {
      service: { select: { id: true, name: true } },
      employee: { select: { id: true, user: { select: { id: true, name: true } } } },
    },
    orderBy: { performedAt: 'desc' },
    take: 100,
  });
}

/**
 * Lists service records for a specific employee (OWNER or BARBER self only).
 *
 * BARBERs can only view their own records.
 * CLIENTs are denied.
 * Supports optional date filter using barbershop local day.
 */
export async function listEmployeeRecords(
  barbershopId: string,
  employeeId: string,
  userId: string,
  userRole: UserRole,
  date?: string
) {
  // Validate employee exists, is active, belongs to barbershop, not deleted
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee || employee.deletedAt) {
    throw new NotFoundError('Employee');
  }
  if (employee.barbershopId !== barbershopId) {
    throw new NotFoundError('Employee');
  }
  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  // BARBER check: can only view own records
  if (userRole === 'BARBER') {
    if (employee.userId !== userId) {
      throw new ForbiddenError('You can only view your own records');
    }
  }

  // CLIENT check: denied
  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot access service records');
  }

  const where: Record<string, unknown> = {
    barbershopId,
    employeeId,
    deletedAt: null,
  };

  if (date) {
    // Fetch barbershop timezone for local-day filtering
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { timezone: true },
    });
    const timezone = barbershop?.timezone ?? 'America/Argentina/Tucuman';
    const { startUtc, endUtc } = getUtcRangeForLocalDate(date, timezone);
    where.performedAt = {
      gte: startUtc,
      lt: endUtc,
    };
  }

  return prisma.serviceRecord.findMany({
    where,
    include: {
      service: { select: { id: true, name: true } },
    },
    orderBy: { performedAt: 'desc' },
    take: 100,
  });
}

// ============================================
// DAILY SUMMARY
// ============================================

interface EmployeeSummary {
  employeeId: string;
  employeeName: string | null;
  recordsCount: number;
  revenueCents: number;
}

interface PaymentMethodSummary {
  paymentMethod: string | null;
  recordsCount: number;
  revenueCents: number;
}

interface DailySummary {
  date: string;
  totalRecords: number;
  totalRevenueCents: number;
  byEmployee: EmployeeSummary[];
  byPaymentMethod: PaymentMethodSummary[];
}

/**
 * Returns an aggregated daily summary of service records for a barbershop.
 *
 * OWNER-only. Uses barbershop local-day filtering.
 * Aggregates: total count, total revenue, by-employee breakdown, by-payment-method breakdown.
 */
export async function getDailyServiceRecordSummary(
  barbershopId: string,
  userId: string,
  date: string
): Promise<DailySummary> {
  // Validate barbershop ownership (defense-in-depth)
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { ownerId: true, timezone: true },
  });

  if (!barbershop || barbershop.ownerId !== userId) {
    throw new NotFoundError('Barbershop');
  }

  // Compute local-day UTC range
  const timezone = barbershop.timezone ?? 'America/Argentina/Tucuman';
  const { startUtc, endUtc } = getUtcRangeForLocalDate(date, timezone);

  // Query all records for this barbershop on this local day
  const records = await prisma.serviceRecord.findMany({
    where: {
      barbershopId,
      deletedAt: null,
      performedAt: {
        gte: startUtc,
        lt: endUtc,
      },
    },
    select: {
      employeeId: true,
      priceCents: true,
      paymentMethod: true,
      employee: {
        select: { user: { select: { name: true } } },
      },
    },
  });

  // Aggregate
  const totalRecords = records.length;
  const totalRevenueCents = records.reduce((sum, r) => sum + r.priceCents, 0);

  // byEmployee: group by employeeId
  const employeeMap = new Map<string, { name: string | null; count: number; revenue: number }>();
  for (const r of records) {
    const existing = employeeMap.get(r.employeeId);
    if (existing) {
      existing.count++;
      existing.revenue += r.priceCents;
    } else {
      employeeMap.set(r.employeeId, {
        name: r.employee.user.name,
        count: 1,
        revenue: r.priceCents,
      });
    }
  }

  const byEmployee: EmployeeSummary[] = Array.from(employeeMap.entries())
    .map(([employeeId, v]) => ({
      employeeId,
      employeeName: v.name,
      recordsCount: v.count,
      revenueCents: v.revenue,
    }))
    .sort((a, b) =>
      b.revenueCents !== a.revenueCents
        ? b.revenueCents - a.revenueCents
        : b.recordsCount - a.recordsCount
    );

  // byPaymentMethod: group by paymentMethod
  const paymentMap = new Map<string | null, { count: number; revenue: number }>();
  for (const r of records) {
    const key = r.paymentMethod ?? null;
    const existing = paymentMap.get(key);
    if (existing) {
      existing.count++;
      existing.revenue += r.priceCents;
    } else {
      paymentMap.set(key, { count: 1, revenue: r.priceCents });
    }
  }

  const byPaymentMethod: PaymentMethodSummary[] = Array.from(paymentMap.entries())
    .map(([paymentMethod, v]) => ({
      paymentMethod,
      recordsCount: v.count,
      revenueCents: v.revenue,
    }))
    .sort((a, b) =>
      b.revenueCents !== a.revenueCents
        ? b.revenueCents - a.revenueCents
        : b.recordsCount - a.recordsCount
    );

  return {
    date,
    totalRecords,
    totalRevenueCents,
    byEmployee,
    byPaymentMethod,
  };
}

// ============================================
// EMPLOYEE DAILY SUMMARY
// ============================================

interface EmployeeDailySummary {
  date: string;
  employeeId: string;
  employeeName: string | null;
  totalRecords: number;
  totalRevenueCents: number;
  byPaymentMethod: PaymentMethodSummary[];
}

/**
 * Returns an aggregated daily summary of service records for a single employee.
 *
 * OWNER can view any active employee in their barbershop.
 * BARBER can only view their own summary.
 * CLIENTs are denied.
 * Uses barbershop local-day filtering.
 */
export async function getDailyEmployeeServiceRecordSummary(
  barbershopId: string,
  employeeId: string,
  userId: string,
  userRole: UserRole,
  date: string
): Promise<EmployeeDailySummary> {
  // Validate employee exists, is active, belongs to barbershop, not deleted
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: { select: { name: true } } },
  });

  if (!employee || employee.deletedAt) {
    throw new NotFoundError('Employee');
  }
  if (employee.barbershopId !== barbershopId) {
    throw new NotFoundError('Employee');
  }
  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  const employeeName = employee.user.name;

  // BARBER check: can only view own summary
  if (userRole === 'BARBER') {
    if (employee.userId !== userId) {
      throw new ForbiddenError('You can only view your own records');
    }
  }

  // CLIENT check: denied
  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot access service records');
  }

  // Get barbershop timezone for local-day filtering
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { timezone: true },
  });
  const timezone = barbershop?.timezone ?? 'America/Argentina/Tucuman';
  const { startUtc, endUtc } = getUtcRangeForLocalDate(date, timezone);

  // Query this employee's records for the local day
  const records = await prisma.serviceRecord.findMany({
    where: {
      barbershopId,
      employeeId,
      deletedAt: null,
      performedAt: {
        gte: startUtc,
        lt: endUtc,
      },
    },
    select: {
      priceCents: true,
      paymentMethod: true,
    },
  });

  // Aggregate
  const totalRecords = records.length;
  const totalRevenueCents = records.reduce((sum, r) => sum + r.priceCents, 0);

  // byPaymentMethod
  const paymentMap = new Map<string | null, { count: number; revenue: number }>();
  for (const r of records) {
    const key = r.paymentMethod ?? null;
    const existing = paymentMap.get(key);
    if (existing) {
      existing.count++;
      existing.revenue += r.priceCents;
    } else {
      paymentMap.set(key, { count: 1, revenue: r.priceCents });
    }
  }

  const byPaymentMethod: PaymentMethodSummary[] = Array.from(paymentMap.entries())
    .map(([paymentMethod, v]) => ({
      paymentMethod,
      recordsCount: v.count,
      revenueCents: v.revenue,
    }))
    .sort((a, b) =>
      b.revenueCents !== a.revenueCents
        ? b.revenueCents - a.revenueCents
        : b.recordsCount - a.recordsCount
    );

  return {
    date,
    employeeId,
    employeeName,
    totalRecords,
    totalRevenueCents,
    byPaymentMethod,
  };
}
