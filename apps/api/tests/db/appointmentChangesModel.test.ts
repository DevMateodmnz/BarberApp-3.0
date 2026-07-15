import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  createTestAppointment,
  createTestBarbershop,
  createTestEmployee,
  createTestEmployeeService,
  createTestService,
  createTestUser,
  prisma,
} from './helpers';

async function createAppointmentChangeFixture() {
  const owner = await createTestUser({ role: 'OWNER', email: 'owner-changes@test.com' });
  const actor = await createTestUser({ role: 'OWNER', email: 'actor-changes@test.com' });
  const { barbershop } = await createTestBarbershop({
    name: 'Reschedule Audit Shop',
    ownerId: owner.user.id,
  });
  const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
  const { employee: employeeTwo } = await createTestEmployee({ barbershopId: barbershop.id });
  const { service } = await createTestService({ barbershopId: barbershop.id, durationMinutes: 30 });
  const { service: serviceTwo } = await createTestService({
    barbershopId: barbershop.id,
    name: 'Premium Cut',
    durationMinutes: 45,
  });
  await createTestEmployeeService({ employeeId: employee.id, serviceId: service.id });
  await createTestEmployeeService({ employeeId: employeeTwo.id, serviceId: serviceTwo.id });
  const appointment = await createTestAppointment({
    barbershopId: barbershop.id,
    employeeId: employee.id,
    serviceId: service.id,
    clientName: 'Audit Client',
    clientEmail: 'audit-client@example.com',
    startAt: new Date('2026-07-25T15:00:00.000Z'),
    endAt: new Date('2026-07-25T15:30:00.000Z'),
    status: 'CONFIRMED',
  });

  return {
    actor,
    barbershop,
    appointment,
    employee,
    employeeTwo,
    service,
    serviceTwo,
  };
}

describe('AppointmentChange model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('stores tenant-safe reschedule audit rows', async () => {
    const fixture = await createAppointmentChangeFixture();

    const change = await prisma.appointmentChange.create({
      data: {
        barbershopId: fixture.barbershop.id,
        appointmentId: fixture.appointment.id,
        type: 'RESCHEDULED',
        changedByUserId: fixture.actor.user.id,
        changedByRole: 'OWNER',
        previousEmployeeId: fixture.employee.id,
        previousEmployeeName: 'Carlos',
        previousServiceId: fixture.service.id,
        previousServiceName: fixture.service.name,
        previousStartAt: new Date('2026-07-25T15:00:00.000Z'),
        previousEndAt: new Date('2026-07-25T15:30:00.000Z'),
        newEmployeeId: fixture.employeeTwo.id,
        newEmployeeName: 'María',
        newServiceId: fixture.serviceTwo.id,
        newServiceName: fixture.serviceTwo.name,
        newStartAt: new Date('2026-07-26T16:00:00.000Z'),
        newEndAt: new Date('2026-07-26T16:45:00.000Z'),
        reason: 'Cliente pidió otro horario',
      },
    });

    expect(change.barbershopId).toBe(fixture.barbershop.id);
    expect(change.reason).toBe('Cliente pidió otro horario');
  });

  it('rejects cross-barbershop appointment links', async () => {
    const fixture = await createAppointmentChangeFixture();
    const otherOwner = await createTestUser({ role: 'OWNER', email: 'other-change-owner@test.com' });
    const { barbershop: otherShop } = await createTestBarbershop({
      name: 'Other Audit Shop',
      ownerId: otherOwner.user.id,
    });

    await expect(
      prisma.appointmentChange.create({
        data: {
          barbershopId: otherShop.id,
          appointmentId: fixture.appointment.id,
          type: 'RESCHEDULED',
          changedByUserId: fixture.actor.user.id,
          changedByRole: 'OWNER',
          previousEmployeeId: fixture.employee.id,
          previousEmployeeName: 'Carlos',
          previousServiceId: fixture.service.id,
          previousServiceName: fixture.service.name,
          previousStartAt: new Date('2026-07-25T15:00:00.000Z'),
          previousEndAt: new Date('2026-07-25T15:30:00.000Z'),
          newEmployeeId: fixture.employeeTwo.id,
          newEmployeeName: 'María',
          newServiceId: fixture.serviceTwo.id,
          newServiceName: fixture.serviceTwo.name,
          newStartAt: new Date('2026-07-26T16:00:00.000Z'),
          newEndAt: new Date('2026-07-26T16:45:00.000Z'),
        },
      })
    ).rejects.toThrow();
  });

  it('prevents hard-deleting appointments with change history', async () => {
    const fixture = await createAppointmentChangeFixture();

    await prisma.appointmentChange.create({
      data: {
        barbershopId: fixture.barbershop.id,
        appointmentId: fixture.appointment.id,
        type: 'RESCHEDULED',
        changedByUserId: fixture.actor.user.id,
        changedByRole: 'OWNER',
        previousEmployeeId: fixture.employee.id,
        previousEmployeeName: 'Carlos',
        previousServiceId: fixture.service.id,
        previousServiceName: fixture.service.name,
        previousStartAt: new Date('2026-07-25T15:00:00.000Z'),
        previousEndAt: new Date('2026-07-25T15:30:00.000Z'),
        newEmployeeId: fixture.employeeTwo.id,
        newEmployeeName: 'María',
        newServiceId: fixture.serviceTwo.id,
        newServiceName: fixture.serviceTwo.name,
        newStartAt: new Date('2026-07-26T16:00:00.000Z'),
        newEndAt: new Date('2026-07-26T16:45:00.000Z'),
      },
    });

    await expect(
      prisma.appointment.delete({ where: { id: fixture.appointment.id } })
    ).rejects.toThrow();
  });

  it('rejects impossible previous and new windows', async () => {
    const fixture = await createAppointmentChangeFixture();

    await expect(
      prisma.appointmentChange.create({
        data: {
          barbershopId: fixture.barbershop.id,
          appointmentId: fixture.appointment.id,
          type: 'RESCHEDULED',
          changedByUserId: fixture.actor.user.id,
          changedByRole: 'OWNER',
          previousEmployeeId: fixture.employee.id,
          previousEmployeeName: 'Carlos',
          previousServiceId: fixture.service.id,
          previousServiceName: fixture.service.name,
          previousStartAt: new Date('2026-07-25T15:30:00.000Z'),
          previousEndAt: new Date('2026-07-25T15:00:00.000Z'),
          newEmployeeId: fixture.employeeTwo.id,
          newEmployeeName: 'María',
          newServiceId: fixture.serviceTwo.id,
          newServiceName: fixture.serviceTwo.name,
          newStartAt: new Date('2026-07-26T16:45:00.000Z'),
          newEndAt: new Date('2026-07-26T16:00:00.000Z'),
        },
      })
    ).rejects.toThrow();
  });
});
