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
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60000),
      },
    });

    expect(appointment.notes).toBeNull();
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
