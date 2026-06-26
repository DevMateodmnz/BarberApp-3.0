/**
 * Database Model Tests
 *
 * These tests run against a real PostgreSQL database to validate:
 * - Model creation and relations
 * - Unique constraints
 * - Foreign key relationships
 * - Index existence
 * - Soft delete behavior
 *
 * IMPORTANT: These are NOT API tests. They test the database layer directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserRole, AppointmentStatus } from '@prisma/client';
import {
  createTestUser,
  createTestBarbershop,
  createTestEmployee,
  createTestService,
  createTestAppointment,
  cleanupTestData,
  prisma,
} from './helpers';

describe('User Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates user with unique clerkUserId', async () => {
    const clerkId = `unique_clerk_${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        clerkUserId: clerkId,
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.CLIENT,
      },
    });

    expect(user.clerkUserId).toBe(clerkId);
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe(UserRole.CLIENT);
    expect(user.deletedAt).toBeNull();
  });

  it('creates user with unique email', async () => {
    const email = `unique_email_${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        clerkUserId: `clerk_${Date.now()}`,
        email,
        name: 'Test User',
        role: UserRole.OWNER,
      },
    });

    expect(user.email).toBe(email);
  });

  it('rejects duplicate clerkUserId', async () => {
    const clerkId = `dup_clerk_${Date.now()}`;

    await prisma.user.create({
      data: {
        clerkUserId: clerkId,
        email: 'first@example.com',
        role: UserRole.CLIENT,
      },
    });

    await expect(
      prisma.user.create({
        data: {
          clerkUserId: clerkId,
          email: 'second@example.com',
          role: UserRole.CLIENT,
        },
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate email', async () => {
    const email = `dup_email_${Date.now()}@example.com`;

    await prisma.user.create({
      data: {
        clerkUserId: `clerk1_${Date.now()}`,
        email,
        role: UserRole.CLIENT,
      },
    });

    await expect(
      prisma.user.create({
        data: {
          clerkUserId: `clerk2_${Date.now()}`,
          email,
          role: UserRole.CLIENT,
        },
      })
    ).rejects.toThrow();
  });

  it('supports all user roles', async () => {
    const roles = [UserRole.OWNER, UserRole.BARBER, UserRole.CLIENT];

    for (const role of roles) {
      const user = await prisma.user.create({
        data: {
          clerkUserId: `clerk_${role}_${Date.now()}`,
          email: `${role.toLowerCase()}_${Date.now()}@example.com`,
          role,
        },
      });
      expect(user.role).toBe(role);
    }
  });

  it('can set soft delete', async () => {
    const user = await prisma.user.create({
      data: {
        clerkUserId: `clerk_${Date.now()}`,
        email: `soft_delete_${Date.now()}@example.com`,
        role: UserRole.CLIENT,
      },
    });

    const deletedAt = new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt },
    });

    expect(updated.deletedAt).toEqual(deletedAt);
  });
});

describe('Barbershop Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates barbershop linked to owner', async () => {
    const { user: owner } = await createTestUser({ role: UserRole.OWNER });

    const barbershop = await prisma.barbershop.create({
      data: {
        ownerId: owner.id,
        name: 'Test Barbershop',
        address: '123 Main St',
        phone: '+54 11 5555-1234',
        timezone: 'America/Argentina/Tucuman',
        isActive: true,
      },
    });

    expect(barbershop.ownerId).toBe(owner.id);
    expect(barbershop.name).toBe('Test Barbershop');
    expect(barbershop.isActive).toBe(true);
  });

  it('rejects barbershop without owner', async () => {
    await expect(
      prisma.barbershop.create({
        data: {
          ownerId: 'non-existent-id',
          name: 'Orphan Barbershop',
        },
      })
    ).rejects.toThrow();
  });

  it('can soft delete barbershop', async () => {
    const { barbershop } = await createTestBarbershop();
    const deletedAt = new Date();

    const updated = await prisma.barbershop.update({
      where: { id: barbershop.id },
      data: { deletedAt },
    });

    expect(updated.deletedAt).toEqual(deletedAt);
  });
});

describe('WorkingHours Default Setup', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Returns a Date object for the next occurrence of `dayOfWeek`
   * (0=Sun, 1=Mon, ..., 6=Sat) at the given local hour/minute.
   * Barbershop timezone is America/Argentina/Tucuman (UTC-3),
   * so we offset the UTC time by 3 hours.
   */
  function nextWeekday(dayOfWeek: number, hour: number, minute = 0): Date {
    const now = new Date();
    const utcDay = now.getUTCDay();
    let daysAhead = dayOfWeek - utcDay;
    if (daysAhead <= 0) daysAhead += 7;

    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysAhead,
        hour + 3, // UTC-3 for Argentina/Tucuman
        minute,
        0,
        0
      )
    );
  }

  it('new barbershop receives default WorkingHours (Mon-Sat)', async () => {
    const { barbershop } = await createTestBarbershop();

    const hours = await prisma.workingHours.findMany({
      where: { barbershopId: barbershop.id },
      orderBy: { dayOfWeek: 'asc' },
    });

    // 6 rows: Monday (1) through Saturday (6), no Sunday (0)
    expect(hours).toHaveLength(6);
    expect(hours.map((h) => h.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6]);

    // Verify default times
    const monday = hours[0]!;
    expect(monday.openTime).toBe('09:00');
    expect(monday.closeTime).toBe('19:00');

    const saturday = hours[5]!;
    expect(saturday.openTime).toBe('09:00');
    expect(saturday.closeTime).toBe('14:00');
  });

  it('setupDefaultWorkingHours is idempotent (no duplicate rows)', async () => {
    const { barbershop } = await createTestBarbershop();

    // First call via createTestBarbershop already set up hours
    // Call setupDefaultWorkingHours again explicitly
    const { setupDefaultWorkingHours } = await import(
      '../../src/services/barbershopService.js'
    );
    await setupDefaultWorkingHours(barbershop.id);

    const hours = await prisma.workingHours.findMany({
      where: { barbershopId: barbershop.id },
    });

    // Still 6 rows — no duplicates
    expect(hours).toHaveLength(6);
  });

  it('existing custom WorkingHours are not overwritten', async () => {
    const { barbershop } = await createTestBarbershop();

    // Manually update Monday to custom hours
    await prisma.workingHours.update({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: barbershop.id,
          dayOfWeek: 1, // Monday
        },
      },
      data: { openTime: '10:00', closeTime: '18:00' },
    });

    // Call setupDefaultWorkingHours again
    const { setupDefaultWorkingHours } = await import(
      '../../src/services/barbershopService.js'
    );
    await setupDefaultWorkingHours(barbershop.id);

    // Monday should still have custom hours (skipDuplicates preserves existing)
    const monday = await prisma.workingHours.findUniqueOrThrow({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: barbershop.id,
          dayOfWeek: 1,
        },
      },
    });

    expect(monday.openTime).toBe('10:00');
    expect(monday.closeTime).toBe('18:00');
  });

  it('new barbershop can immediately accept appointments (within hours)', async () => {
    const { barbershop, owner } = await createTestBarbershop();
    const client = await createTestUser({ role: UserRole.CLIENT });
    const { employee } = await createTestEmployee({
      barbershopId: barbershop.id,
    });
    const { service } = await createTestService({
      barbershopId: barbershop.id,
      durationMinutes: 30,
    });

    // Link employee to service
    await prisma.employeeService.create({
      data: {
        employeeId: employee.id,
        serviceId: service.id,
      },
    });

    // Book at Monday 10:00 AM — should succeed (within default hours)
    const monday = nextWeekday(1, 10, 0);

    const appointment = await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        clientId: client.user.id,
        serviceId: service.id,
        clientName: client.user.name!,
        clientPhone: null,
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDurationMinutes: service.durationMinutes,
        serviceCurrency: service.currency,
        startAt: monday,
        endAt: new Date(monday.getTime() + 30 * 60000),
        status: AppointmentStatus.PENDING,
      },
    });

    expect(appointment.id).toBeDefined();
    expect(appointment.status).toBe('PENDING');
  });

  it('Sunday has no WorkingHours row (closed day)', async () => {
    const { barbershop } = await createTestBarbershop();

    const sundayHours = await prisma.workingHours.findUnique({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: barbershop.id,
          dayOfWeek: 0, // Sunday
        },
      },
    });

    // Sunday should have no row — the shop is closed
    expect(sundayHours).toBeNull();
  });
});

describe('Employee Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates employee linked to barbershop and user', async () => {
    const { barbershop } = await createTestBarbershop();
    const { user } = await createTestUser({ role: UserRole.BARBER });

    const employee = await prisma.employee.create({
      data: {
        barbershopId: barbershop.id,
        userId: user.id,
        isActive: true,
      },
    });

    expect(employee.barbershopId).toBe(barbershop.id);
    expect(employee.userId).toBe(user.id);
    expect(employee.isActive).toBe(true);
  });

  it('rejects duplicate employee for same barbershop/user pair', async () => {
    const { barbershop } = await createTestBarbershop();
    const { user } = await createTestUser({ role: UserRole.BARBER });

    await prisma.employee.create({
      data: {
        barbershopId: barbershop.id,
        userId: user.id,
        isActive: true,
      },
    });

    // Try to create a second employee with same barbershop/user
    await expect(
      prisma.employee.create({
        data: {
          barbershopId: barbershop.id,
          userId: user.id,
          isActive: true,
        },
      })
    ).rejects.toThrow();
  });

  it('allows same user as employee in different barbershops', async () => {
    const { user } = await createTestUser({ role: UserRole.BARBER });
    const { barbershop: shop1 } = await createTestBarbershop();
    const { barbershop: shop2 } = await createTestBarbershop({ name: 'Second Shop' });

    const emp1 = await prisma.employee.create({
      data: {
        barbershopId: shop1.id,
        userId: user.id,
        isActive: true,
      },
    });

    const emp2 = await prisma.employee.create({
      data: {
        barbershopId: shop2.id,
        userId: user.id,
        isActive: true,
      },
    });

    expect(emp1.id).not.toBe(emp2.id);
    expect(emp1.barbershopId).not.toBe(emp2.barbershopId);
  });

  it('can soft delete employee', async () => {
    const { employee } = await createTestEmployee(await createTestBarbershop().then(b => ({ barbershopId: b.barbershop.id })));
    const deletedAt = new Date();

    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: { deletedAt },
    });

    expect(updated.deletedAt).toEqual(deletedAt);
  });
});

describe('Service Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates service linked to barbershop', async () => {
    const { barbershop } = await createTestBarbershop();

    const service = await prisma.service.create({
      data: {
        barbershopId: barbershop.id,
        name: 'Corte Clásico',
        description: 'Traditional haircut',
        durationMinutes: 30,
        priceCents: 2500,
        currency: 'ARS',
        isActive: true,
      },
    });

    expect(service.barbershopId).toBe(barbershop.id);
    expect(service.name).toBe('Corte Clásico');
    expect(service.durationMinutes).toBe(30);
    expect(service.priceCents).toBe(2500);
  });

  it('can soft delete service', async () => {
    const { barbershop } = await createTestBarbershop();
    const service = await prisma.service.create({
      data: {
        barbershopId: barbershop.id,
        name: 'To Delete',
        durationMinutes: 30,
        priceCents: 1000,
      },
    });

    const deletedAt = new Date();
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: { deletedAt },
    });

    expect(updated.deletedAt).toEqual(deletedAt);
  });
});

describe('EmployeeService Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates employee-service link', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    const link = await prisma.employeeService.create({
      data: {
        employeeId: employee.id,
        serviceId: service.id,
      },
    });

    expect(link.employeeId).toBe(employee.id);
    expect(link.serviceId).toBe(service.id);
  });

  it('rejects duplicate employee-service pair', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    await prisma.employeeService.create({
      data: {
        employeeId: employee.id,
        serviceId: service.id,
      },
    });

    await expect(
      prisma.employeeService.create({
        data: {
          employeeId: employee.id,
          serviceId: service.id,
        },
      })
    ).rejects.toThrow();
  });

  it('allows different employees to offer same service', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee: emp1 } = await createTestEmployee({ barbershopId: barbershop.id });
    const { employee: emp2 } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    await prisma.employeeService.create({
      data: { employeeId: emp1.id, serviceId: service.id },
    });

    const link2 = await prisma.employeeService.create({
      data: { employeeId: emp2.id, serviceId: service.id },
    });

    expect(link2.employeeId).toBe(emp2.id);
    expect(link2.serviceId).toBe(service.id);
  });
});

describe('Appointment Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates appointment with all relations', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 30 * 60000);

    const appointment = await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        clientId: client.id,
        serviceId: service.id,
        clientName: client.name!,
        clientPhone: null,
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDurationMinutes: service.durationMinutes,
        serviceCurrency: service.currency,
        startAt,
        endAt,
        status: AppointmentStatus.PENDING,
        notes: 'Test appointment',
      },
    });

    expect(appointment.barbershopId).toBe(barbershop.id);
    expect(appointment.employeeId).toBe(employee.id);
    expect(appointment.clientId).toBe(client.id);
    expect(appointment.serviceId).toBe(service.id);
    expect(appointment.clientName).toBe(client.name);
    expect(appointment.clientPhone).toBeNull();
    expect(appointment.serviceName).toBe(service.name);
    expect(appointment.servicePriceCents).toBe(service.priceCents);
    expect(appointment.serviceDurationMinutes).toBe(service.durationMinutes);
    expect(appointment.serviceCurrency).toBe(service.currency);
    expect(appointment.status).toBe(AppointmentStatus.PENDING);
    expect(appointment.notes).toBe('Test appointment');
  });

  it('supports all appointment statuses', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    const statuses = [
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ];

    const base = Date.now() + 3600_000; // 1 hour from now
    for (let i = 0; i < statuses.length; i++) {
      const startAt = new Date(base + i * 3600_000); // 1 hour apart
      const appointment = await prisma.appointment.create({
        data: {
          barbershopId: barbershop.id,
          employeeId: employee.id,
          clientId: client.id,
          serviceId: service.id,
          clientName: client.name!,
          clientPhone: null,
          serviceName: service.name,
          servicePriceCents: service.priceCents,
          serviceDurationMinutes: service.durationMinutes,
          serviceCurrency: service.currency,
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60000),
          status: statuses[i],
        },
      });
      expect(appointment.status).toBe(statuses[i]);
    }
  });

  it('can set notes', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    const startAt = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        clientId: client.id,
        serviceId: service.id,
        clientName: client.name!,
        clientPhone: null,
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDurationMinutes: service.durationMinutes,
        serviceCurrency: service.currency,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60000),
        notes: 'Cliente prefiere cabello corto',
      },
    });

    expect(appointment.notes).toBe('Cliente prefiere cabello corto');
  });

  it('notes can be null', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { service } = await createTestService({ barbershopId: barbershop.id });

    const startAt = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        clientId: client.id,
        serviceId: service.id,
        clientName: client.name!,
        clientPhone: null,
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDurationMinutes: service.durationMinutes,
        serviceCurrency: service.currency,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60000),
      },
    });

    expect(appointment.notes).toBeNull();
  });

  it('supports guest appointments with nullable client relation and frozen snapshots', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id, durationMinutes: 45, priceCents: 4200 });

    const startAt = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        clientId: null,
        serviceId: service.id,
        clientName: 'Walk-in Guest',
        clientPhone: '+54 381 555-1234',
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDurationMinutes: service.durationMinutes,
        serviceCurrency: service.currency,
        startAt,
        endAt: new Date(startAt.getTime() + 45 * 60000),
        notes: 'Guest appointment',
      },
    });

    expect(appointment.clientId).toBeNull();
    expect(appointment.clientName).toBe('Walk-in Guest');
    expect(appointment.clientPhone).toBe('+54 381 555-1234');
    expect(appointment.serviceDurationMinutes).toBe(45);
    expect(appointment.servicePriceCents).toBe(4200);
  });
});

describe('Photo Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates photo linked to client and uploader', async () => {
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { user: uploader } = await createTestUser({ role: UserRole.BARBER });

    const photo = await prisma.photo.create({
      data: {
        clientId: client.id,
        url: 'https://example.com/photo.jpg',
        uploadedById: uploader.id,
      },
    });

    expect(photo.clientId).toBe(client.id);
    expect(photo.url).toBe('https://example.com/photo.jpg');
    expect(photo.uploadedById).toBe(uploader.id);
  });

  it('can soft delete photo', async () => {
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { user: uploader } = await createTestUser({ role: UserRole.BARBER });

    const photo = await prisma.photo.create({
      data: {
        clientId: client.id,
        url: 'https://example.com/photo.jpg',
        uploadedById: uploader.id,
      },
    });

    const deletedAt = new Date();
    const updated = await prisma.photo.update({
      where: { id: photo.id },
      data: { deletedAt },
    });

    expect(updated.deletedAt).toEqual(deletedAt);
  });
});

describe('Cross-Tenant Data Isolation', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('prevents barbershop from accessing another owners data', async () => {
    // Owner 1 creates barbershop
    const { barbershop: shop1, owner: owner1 } = await createTestBarbershop({ name: 'Shop 1' });

    // Owner 2 creates barbershop
    const { barbershop: shop2, owner: owner2 } = await createTestBarbershop({ name: 'Shop 2' });

    // Owner 1 creates an employee
    const { employee: emp1 } = await createTestEmployee({ barbershopId: shop1.id });

    // Verify employee belongs to shop1
    const fetchedEmp1 = await prisma.employee.findUnique({
      where: { id: emp1.id },
      include: { barbershop: true },
    });
    expect(fetchedEmp1?.barbershop.ownerId).toBe(owner1.user.id);

    // Verify shop2 has different owner
    const shop2WithOwner = await prisma.barbershop.findUnique({
      where: { id: shop2.id },
      include: { owner: true },
    });
    expect(shop2WithOwner?.ownerId).not.toBe(owner1.user.id);
    expect(shop2WithOwner?.ownerId).toBe(owner2.user.id);
  });

  it('services are isolated by barbershop', async () => {
    const { barbershop: shop1 } = await createTestBarbershop({ name: 'Shop 1' });
    const { barbershop: shop2 } = await createTestBarbershop({ name: 'Shop 2' });

    const { service: svc1 } = await createTestService({ barbershopId: shop1.id, name: 'Service A' });
    // Create service for shop2 to verify isolation
    await createTestService({ barbershopId: shop2.id, name: 'Service B' });

    // Query services for shop1 only
    const shop1Services = await prisma.service.findMany({
      where: { barbershopId: shop1.id },
    });

    expect(shop1Services).toHaveLength(1);
    expect(shop1Services[0].name).toBe('Service A');
    expect(shop1Services[0].id).toBe(svc1.id);
  });

  it('appointments are isolated by barbershop', async () => {
    const { barbershop: shop1 } = await createTestBarbershop({ name: 'Shop 1' });
    const { barbershop: shop2 } = await createTestBarbershop({ name: 'Shop 2' });

    const { employee: emp1 } = await createTestEmployee({ barbershopId: shop1.id });
    // Create employee for shop2 to verify isolation
    await createTestEmployee({ barbershopId: shop2.id });
    const { user: client } = await createTestUser({ role: UserRole.CLIENT });
    const { service: svc1 } = await createTestService({ barbershopId: shop1.id });
    // Create service for shop2 to verify isolation
    await createTestService({ barbershopId: shop2.id });

    // Create appointment in shop1
    await createTestAppointment({
      barbershopId: shop1.id,
      employeeId: emp1.id,
      clientId: client.id,
      serviceId: svc1.id,
    });

    // Query appointments for shop2
    const shop2Appointments = await prisma.appointment.findMany({
      where: { barbershopId: shop2.id },
    });

    expect(shop2Appointments).toHaveLength(0);
  });
});
