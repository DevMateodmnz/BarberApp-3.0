/**
 * Database test helpers
 * Provides utilities for running database tests against a real PostgreSQL database
 */

import { PrismaClient, UserRole, AppointmentStatus } from '@prisma/client';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';

export const prisma = new PrismaClient();

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5433/barberapp_test';

export interface TestUser {
  user: Awaited<ReturnType<typeof prisma.user.create>>;
  role: UserRole;
}

export interface TestBarbershop {
  barbershop: Awaited<ReturnType<typeof prisma.barbershop.create>>;
  owner: TestUser;
}

export interface TestEmployee {
  employee: Awaited<ReturnType<typeof prisma.employee.create>>;
  user: TestUser;
}

export interface TestService {
  service: Awaited<ReturnType<typeof prisma.service.create>>;
}

/**
 * Create a test user
 */
export async function createTestUser(data: {
  clerkUserId?: string;
  email?: string;
  name?: string;
  role?: UserRole;
} = {}): Promise<TestUser> {
  const role = data.role || UserRole.CLIENT;
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: data.clerkUserId || `test_clerk_${uniqueSuffix}`,
      email: data.email || `test_${uniqueSuffix}@example.com`,
      name: data.name || 'Test User',
      role,
    },
  });
  return { user, role };
}

/**
 * Create a test barbershop with owner and default WorkingHours.
 * The barbershop is immediately ready for appointment booking
 * within the default schedule (Mon-Fri 9-19, Sat 9-14).
 */
export async function createTestBarbershop(data: {
  name?: string;
  ownerId?: string;
} = {}): Promise<TestBarbershop> {
  let owner = data.ownerId ? await prisma.user.findUnique({ where: { id: data.ownerId } }) : null;

  if (!owner) {
    const ownerResult = await createTestUser({ role: UserRole.OWNER });
    owner = ownerResult.user;
  }

  const barbershop = await prisma.barbershop.create({
    data: {
      ownerId: owner!.id,
      name: data.name || 'Test Barbershop',
      address: '123 Test Street',
      phone: '+54 11 5555-0000',
      timezone: 'America/Argentina/Tucuman',
      isActive: true,
    },
  });

  // Automatically set up default working hours
  await setupDefaultWorkingHours(barbershop.id);

  return { barbershop, owner: { user: owner, role: UserRole.OWNER } };
}

/**
 * Create a test employee linked to a barbershop and user
 */
export async function createTestEmployee(data: {
  barbershopId: string;
  userId?: string;
}): Promise<TestEmployee> {
  let user: TestUser['user'];

  if (data.userId) {
    user = await prisma.user.findUniqueOrThrow({ where: { id: data.userId } });
  } else {
    const userResult = await createTestUser({ role: UserRole.BARBER });
    user = userResult.user;
  }

  const employee = await prisma.employee.create({
    data: {
      barbershopId: data.barbershopId,
      userId: user.id,
      isActive: true,
    },
  });

  return { employee, user: { user, role: UserRole.BARBER } };
}

/**
 * Create a test service
 */
export async function createTestService(data: {
  barbershopId: string;
  name?: string;
  durationMinutes?: number;
  priceCents?: number;
}): Promise<TestService> {
  const service = await prisma.service.create({
    data: {
      barbershopId: data.barbershopId,
      name: data.name || 'Test Service',
      description: 'A test service description',
      durationMinutes: data.durationMinutes || 30,
      priceCents: data.priceCents || 2500,
      currency: 'ARS',
      isActive: true,
    },
  });

  return { service };
}

/**
 * Create a test appointment
 */
export async function createTestAppointment(data: {
  barbershopId: string;
  employeeId: string;
  clientId: string;
  serviceId: string;
  startAt?: Date;
  endAt?: Date;
  status?: AppointmentStatus;
}): Promise<Awaited<ReturnType<typeof prisma.appointment.create>>> {
  const startAt = data.startAt || new Date();
  const endAt = data.endAt || new Date(startAt.getTime() + 30 * 60000);

  return prisma.appointment.create({
    data: {
      barbershopId: data.barbershopId,
      employeeId: data.employeeId,
      clientId: data.clientId,
      serviceId: data.serviceId,
      startAt,
      endAt,
      status: data.status || AppointmentStatus.PENDING,
    },
  });
}

/**
 * Create default working hours for a barbershop (Monday-Saturday 9-19, Sat 9-14).
 * Returns the created WorkingHours records.
 */
export async function createTestWorkingHours(data: {
  barbershopId: string;
}): Promise<void> {
  const days = [
    { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' }, // Monday
    { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00' }, // Tuesday
    { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00' }, // Wednesday
    { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00' }, // Thursday
    { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00' }, // Friday
    { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00' }, // Saturday
    // Sunday (0) = closed (no row)
  ];

  for (const day of days) {
    await prisma.workingHours.upsert({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: data.barbershopId,
          dayOfWeek: day.dayOfWeek,
        },
      },
      create: {
        barbershopId: data.barbershopId,
        dayOfWeek: day.dayOfWeek,
        openTime: day.openTime,
        closeTime: day.closeTime,
      },
      update: {
        openTime: day.openTime,
        closeTime: day.closeTime,
      },
    });
  }
}

/**
 * Create a test employee-service link.
 */
export async function createTestEmployeeService(data: {
  employeeId: string;
  serviceId: string;
}): Promise<Awaited<ReturnType<typeof prisma.employeeService.create>>> {
  return prisma.employeeService.create({
    data: {
      employeeId: data.employeeId,
      serviceId: data.serviceId,
    },
  });
}

/**
 * Clean up all test data
 */
export async function cleanupTestData(): Promise<void> {
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
}
