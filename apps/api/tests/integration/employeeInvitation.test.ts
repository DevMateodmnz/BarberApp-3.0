import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import * as clerkGatewayModule from '../../src/services/clerkGateway.js';
import {
  buildEmployeeInvitationMetadata,
} from '../../src/lib/employeeInvitationMetadata.js';
import type { ClerkGateway, ClerkUserRecord } from '../../src/services/clerkGateway.js';
import type { Barbershop, User } from '@prisma/client';

const mockGateway: ClerkGateway = {
  createApplicationInvitation: vi.fn(),
  revokeApplicationInvitation: vi.fn(),
  getUserById: vi.fn(),
  findUsersByEmail: vi.fn(),
  updateUserPublicMetadata: vi.fn(),
};

vi.spyOn(clerkGatewayModule, 'getClerkGateway').mockReturnValue(mockGateway);

const app = createAppFromEnv();

interface Fixtures {
  ownerA: User;
  shopA: Barbershop;
  ownerB: User;
  shopB: Barbershop;
  barberUser: User;
  clientUser: User;
  ownerUser: User;
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function mockClerkUser(input: {
  clerkUserId: string;
  email: string;
  publicMetadata?: Record<string, unknown>;
}): ClerkUserRecord {
  return {
    id: input.clerkUserId,
    firstName: 'Invited',
    lastName: 'Barber',
    primaryEmailAddressId: 'email_primary',
    publicMetadata: input.publicMetadata ?? {},
    emailAddresses: [
      {
        id: 'email_primary',
        emailAddress: input.email,
        verificationStatus: 'verified',
      },
    ],
  };
}

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  fixtures.ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'employee_inv_owner_a',
      email: 'employee_inv_owner_a@example.com',
      name: 'Owner A',
      role: 'OWNER',
    },
  });

  fixtures.shopA = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerA.id,
      name: 'Shop A',
      address: '123 A St',
      phone: '+541112345678',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'employee_inv_owner_b',
      email: 'employee_inv_owner_b@example.com',
      name: 'Owner B',
      role: 'OWNER',
    },
  });

  fixtures.shopB = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerB.id,
      name: 'Shop B',
      address: '456 B St',
      phone: '+541112345679',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  fixtures.barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'employee_inv_barber_local',
      email: 'local_barber@example.com',
      name: 'Local Barber',
      role: 'BARBER',
    },
  });

  fixtures.clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'employee_inv_client_local',
      email: 'local_client@example.com',
      name: 'Local Client',
      role: 'CLIENT',
    },
  });

  fixtures.ownerUser = await prisma.user.create({
    data: {
      clerkUserId: 'employee_inv_owner_local',
      email: 'local_owner@example.com',
      name: 'Local Owner',
      role: 'OWNER',
    },
  });
});

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany({
    where: {
      clerkUserId: {
        startsWith: 'invitee_',
      },
    },
  });

  vi.mocked(mockGateway.findUsersByEmail).mockResolvedValue([]);
  vi.mocked(mockGateway.updateUserPublicMetadata).mockImplementation(async (clerkUserId, publicMetadata) =>
    mockClerkUser({
      clerkUserId,
      email: 'invitee@example.com',
      publicMetadata,
    })
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('Employee invitation create endpoint', () => {
  it('creates an employee immediately for an existing local BARBER without calling Clerk', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: 'LOCAL_BARBER@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.outcome).toBe('employee_created');
    expect(res.body.data.invitation).toBeNull();
    expect(res.body.data.employee.userId).toBe(fixtures.barberUser.id);
    expect(mockGateway.createApplicationInvitation).not.toHaveBeenCalled();

    const employees = await prisma.employee.findMany({
      where: { barbershopId: fixtures.shopA.id, userId: fixtures.barberUser.id },
    });
    expect(employees).toHaveLength(1);
  });

  it('reactivates the same employee row for an inactive local BARBER', async () => {
    const employee = await prisma.employee.create({
      data: {
        barbershopId: fixtures.shopA.id,
        userId: fixtures.barberUser.id,
        isActive: false,
        deletedAt: new Date(),
      },
    });

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: fixtures.barberUser.email });

    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('employee_reactivated');
    expect(res.body.data.employee.id).toBe(employee.id);
    expect(mockGateway.createApplicationInvitation).not.toHaveBeenCalled();
  });

  it('returns a stable conflict for an active same-shop BARBER employee', async () => {
    await prisma.employee.create({
      data: {
        barbershopId: fixtures.shopA.id,
        userId: fixtures.barberUser.id,
      },
    });

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: fixtures.barberUser.email });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMPLOYEE_ALREADY_ACTIVE');
    expect(mockGateway.createApplicationInvitation).not.toHaveBeenCalled();
  });

  it('rejects existing local CLIENT users without mutating role or sending Clerk invitations', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: fixtures.clientUser.email });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_ROLE_NOT_ELIGIBLE');
    expect(mockGateway.createApplicationInvitation).not.toHaveBeenCalled();

    const client = await prisma.user.findUniqueOrThrow({ where: { id: fixtures.clientUser.id } });
    expect(client.role).toBe('CLIENT');
  });

  it('preserves multi-shop assignment for eligible local BARBER users', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopB.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerB.clerkUserId))
      .send({ email: fixtures.barberUser.email });

    expect(res.status).toBe(201);
    expect(res.body.data.outcome).toBe('employee_created');

    const employee = await prisma.employee.findUnique({
      where: {
        barbershopId_userId: {
          barbershopId: fixtures.shopB.id,
          userId: fixtures.barberUser.id,
        },
      },
    });
    expect(employee).not.toBeNull();
  });

  it('creates a normalized invitation lifecycle row and returns invitation_pending on duplicate create', async () => {
    vi.mocked(mockGateway.createApplicationInvitation).mockResolvedValue({
      id: 'clerk_invitation_create_1',
      emailAddress: 'new_barber@example.com',
      publicMetadata: {},
      status: 'pending',
      revoked: false,
    });

    const firstRes = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: ' New_Barber@Example.com ' });

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.data.outcome).toBe('invitation_created');
    expect(firstRes.body.data.employee).toBeNull();
    expect(firstRes.body.data.invitation.email).toBe('new_barber@example.com');
    expect(firstRes.body.data.invitation.status).toBe('PENDING');
    expect(mockGateway.createApplicationInvitation).toHaveBeenCalledTimes(1);
    expect(mockGateway.createApplicationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: 'new_barber@example.com',
        expiresInDays: 7,
      })
    );

    const createdInvitationId = firstRes.body.data.invitation.id as string;
    expect(mockGateway.createApplicationInvitation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publicMetadata: buildEmployeeInvitationMetadata(createdInvitationId),
      })
    );

    const secondRes = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: 'new_barber@example.com' });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.outcome).toBe('invitation_pending');
    expect(secondRes.body.data.invitation.id).toBe(createdInvitationId);
    expect(mockGateway.createApplicationInvitation).toHaveBeenCalledTimes(1);

    const invitations = await prisma.employeeInvitation.findMany();
    expect(invitations).toHaveLength(1);
  });

  it('keeps the lifecycle row in DELIVERY_FAILED when Clerk invitation creation fails', async () => {
    vi.mocked(mockGateway.createApplicationInvitation).mockRejectedValue({
      status: 500,
      errors: [{ code: 'invitation_create_failed' }],
    });

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ email: 'failure@example.com' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EMPLOYEE_INVITATION_DELIVERY_FAILED');

    const invitation = await prisma.employeeInvitation.findUniqueOrThrow({
      where: {
        barbershopId_emailNormalized: {
          barbershopId: fixtures.shopA.id,
          emailNormalized: 'failure@example.com',
        },
      },
    });
    expect(invitation.status).toBe('DELIVERY_FAILED');
    expect(invitation.clerkInvitationId).toBeNull();
  });
});

describe('Employee invitation listing, resend, and revoke', () => {
  it('lists only the owner shop invitations in newest-updated-first order', async () => {
    const older = await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: 'older@example.com',
        clerkInvitationId: 'older_clerk_id',
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        lastSentAt: new Date(Date.now() - 2 * 60 * 1000),
      },
    });

    const newer = await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: 'newer@example.com',
        clerkInvitationId: 'newer_clerk_id',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        lastSentAt: new Date(),
      },
    });

    await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopB.id,
        invitedByUserId: fixtures.ownerB.id,
        emailNormalized: 'other-shop@example.com',
        clerkInvitationId: 'other_shop_clerk_id',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(newer.id);
    expect(res.body.data[1].id).toBe(older.id);
    expect(res.body.data[0].clerkInvitationId).toBeUndefined();
  });

  it('resends a pending invitation by revoking and recreating the provider invitation on the same row', async () => {
    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: 'resend@example.com',
        clerkInvitationId: 'old_provider_invitation',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastSentAt: new Date(),
      },
    });

    vi.mocked(mockGateway.revokeApplicationInvitation).mockResolvedValue({
      id: 'old_provider_invitation',
      emailAddress: 'resend@example.com',
      publicMetadata: {},
      status: 'revoked',
      revoked: true,
    });
    vi.mocked(mockGateway.createApplicationInvitation).mockResolvedValue({
      id: 'new_provider_invitation',
      emailAddress: 'resend@example.com',
      publicMetadata: {},
      status: 'pending',
      revoked: false,
    });

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations/${invitation.id}/resend`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(invitation.id);
    expect(res.body.data.clerkInvitationId).toBeUndefined();
    expect(res.body.data.resendCount).toBe(1);
    expect(mockGateway.revokeApplicationInvitation).toHaveBeenCalledWith('old_provider_invitation');
    expect(mockGateway.createApplicationInvitation).toHaveBeenCalledTimes(1);

    const updated = await prisma.employeeInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(updated.clerkInvitationId).toBe('new_provider_invitation');
    expect(updated.status).toBe('PENDING');
    expect(updated.resendCount).toBe(1);
  });

  it('revokes an invitation without deleting the local row', async () => {
    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: 'revoke@example.com',
        clerkInvitationId: 'provider_invitation_revoke',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    vi.mocked(mockGateway.revokeApplicationInvitation).mockResolvedValue({
      id: 'provider_invitation_revoke',
      emailAddress: 'revoke@example.com',
      publicMetadata: {},
      status: 'revoked',
      revoked: true,
    });

    const res = await request(app)
      .delete(`/api/v1/barbershops/${fixtures.shopA.id}/employee-invitations/${invitation.id}`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(mockGateway.revokeApplicationInvitation).toHaveBeenCalledWith('provider_invitation_revoke');

    const updated = await prisma.employeeInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(updated.status).toBe('REVOKED');
    expect(updated.revokedAt).not.toBeNull();
  });
});

describe('Employee invitation reconciliation', () => {
  it('creates a BARBER user and employee for a valid invited Clerk user', async () => {
    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: 'invitee@example.com',
        clerkInvitationId: 'provider_invitee_1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastSentAt: new Date(),
      },
    });

    vi.mocked(mockGateway.getUserById).mockResolvedValue(
      mockClerkUser({
        clerkUserId: 'invitee_clerk_1',
        email: 'invitee@example.com',
      })
    );

    const res = await request(app)
      .post('/api/v1/onboarding/employee-invitations/reconcile')
      .set(authHeader('invitee_clerk_1'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('reconciled');

    const user = await prisma.user.findUniqueOrThrow({
      where: { clerkUserId: 'invitee_clerk_1' },
    });
    expect(user.role).toBe('BARBER');

    const employee = await prisma.employee.findUnique({
      where: {
        barbershopId_userId: {
          barbershopId: fixtures.shopA.id,
          userId: user.id,
        },
      },
    });
    expect(employee).not.toBeNull();

    const updatedInvitation = await prisma.employeeInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(updatedInvitation.status).toBe('ACCEPTED');
    expect(updatedInvitation.userId).toBe(user.id);
    expect(updatedInvitation.employeeId).toBe(employee!.id);
    expect(mockGateway.updateUserPublicMetadata).toHaveBeenCalledWith(
      'invitee_clerk_1',
      buildEmployeeInvitationMetadata(invitation.id)
    );
  });

  it('returns ready when an existing local BARBER already has the employee membership to accept', async () => {
    const localBarber = await prisma.user.create({
      data: {
        clerkUserId: 'invitee_ready_existing',
        email: 'ready_existing@example.com',
        name: 'Ready Existing',
        role: 'BARBER',
      },
    });

    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: localBarber.email,
        clerkInvitationId: 'provider_ready_1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await prisma.employee.create({
      data: {
        barbershopId: fixtures.shopA.id,
        userId: localBarber.id,
      },
    });

    vi.mocked(mockGateway.getUserById).mockResolvedValue(
      mockClerkUser({
        clerkUserId: 'invitee_ready_existing',
        email: localBarber.email,
        publicMetadata: buildEmployeeInvitationMetadata(invitation.id),
      })
    );

    const res = await request(app)
      .post('/api/v1/onboarding/employee-invitations/reconcile')
      .set(authHeader('invitee_ready_existing'))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('ready');

    const updatedInvitation = await prisma.employeeInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(updatedInvitation.status).toBe('ACCEPTED');
  });

  it('rejects existing local CLIENT users during reconciliation', async () => {
    const localClient = await prisma.user.create({
      data: {
        clerkUserId: 'invitee_client_reconcile',
        email: 'invitee_client_reconcile@example.com',
        name: 'Invitee Client',
        role: 'CLIENT',
      },
    });

    await prisma.employeeInvitation.create({
      data: {
        barbershopId: fixtures.shopA.id,
        invitedByUserId: fixtures.ownerA.id,
        emailNormalized: localClient.email,
        clerkInvitationId: 'provider_client_reconcile',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    vi.mocked(mockGateway.getUserById).mockResolvedValue(
      mockClerkUser({
        clerkUserId: 'invitee_client_reconcile',
        email: localClient.email,
      })
    );

    const res = await request(app)
      .post('/api/v1/onboarding/employee-invitations/reconcile')
      .set(authHeader('invitee_client_reconcile'))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_ROLE_NOT_ELIGIBLE');
  });

  it('rejects ambiguous fallback matches without creating local records', async () => {
    await prisma.employeeInvitation.createMany({
      data: [
        {
          barbershopId: fixtures.shopA.id,
          invitedByUserId: fixtures.ownerA.id,
          emailNormalized: 'ambiguous@example.com',
          clerkInvitationId: 'ambiguous_provider_1',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          barbershopId: fixtures.shopB.id,
          invitedByUserId: fixtures.ownerB.id,
          emailNormalized: 'ambiguous@example.com',
          clerkInvitationId: 'ambiguous_provider_2',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ],
    });

    vi.mocked(mockGateway.getUserById).mockResolvedValue(
      mockClerkUser({
        clerkUserId: 'invitee_ambiguous',
        email: 'ambiguous@example.com',
      })
    );

    const res = await request(app)
      .post('/api/v1/onboarding/employee-invitations/reconcile')
      .set(authHeader('invitee_ambiguous'))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AMBIGUOUS_EMPLOYEE_INVITATION');

    const user = await prisma.user.findUnique({ where: { clerkUserId: 'invitee_ambiguous' } });
    expect(user).toBeNull();
  });
});
