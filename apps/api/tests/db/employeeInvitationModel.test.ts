import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma, cleanupTestData, createTestBarbershop, createTestEmployee, createTestUser } from './helpers';

describe('EmployeeInvitation Model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates a pending invitation without requiring local user or employee linkage', async () => {
    const { barbershop, owner } = await createTestBarbershop();

    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: barbershop.id,
        invitedByUserId: owner.user.id,
        emailNormalized: 'pending@example.com',
      },
    });

    expect(invitation.status).toBe('PENDING');
    expect(invitation.invitedRole).toBe('BARBER');
    expect(invitation.userId).toBeNull();
    expect(invitation.employeeId).toBeNull();
    expect(invitation.clerkInvitationId).toBeNull();
  });

  it('enforces one lifecycle row per barbershop and normalized email', async () => {
    const { barbershop, owner } = await createTestBarbershop();

    await prisma.employeeInvitation.create({
      data: {
        barbershopId: barbershop.id,
        invitedByUserId: owner.user.id,
        emailNormalized: 'duplicate@example.com',
      },
    });

    await expect(
      prisma.employeeInvitation.create({
        data: {
          barbershopId: barbershop.id,
          invitedByUserId: owner.user.id,
          emailNormalized: 'duplicate@example.com',
        },
      })
    ).rejects.toThrow();
  });

  it('enforces unique Clerk invitation IDs when present', async () => {
    const { barbershop, owner } = await createTestBarbershop();

    await prisma.employeeInvitation.create({
      data: {
        barbershopId: barbershop.id,
        invitedByUserId: owner.user.id,
        emailNormalized: 'clerk-a@example.com',
        clerkInvitationId: 'clerk_unique_invitation',
      },
    });

    await expect(
      prisma.employeeInvitation.create({
        data: {
          barbershopId: barbershop.id,
          invitedByUserId: owner.user.id,
          emailNormalized: 'clerk-b@example.com',
          clerkInvitationId: 'clerk_unique_invitation',
        },
      })
    ).rejects.toThrow();
  });

  it('supports accepted invitation linkage to both user and employee', async () => {
    const { barbershop, owner } = await createTestBarbershop();
    const barber = await createTestUser({ role: 'BARBER' });
    const employee = await createTestEmployee({
      barbershopId: barbershop.id,
      userId: barber.user.id,
    });

    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: barbershop.id,
        invitedByUserId: owner.user.id,
        emailNormalized: barber.user.email,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        userId: barber.user.id,
        employeeId: employee.employee.id,
      },
      include: {
        user: true,
        employee: true,
      },
    });

    expect(invitation.user?.id).toBe(barber.user.id);
    expect(invitation.employee?.id).toBe(employee.employee.id);
  });
});
