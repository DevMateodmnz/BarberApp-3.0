/**
 * Webhook Integration Tests
 *
 * Tests Clerk webhook endpoint with Svix signature verification.
 * Uses standardwebhooks.Webhook to sign test payloads.
 * Validates idempotency, error responses, and regression.
 */
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import * as clerkGatewayModule from '../../src/services/clerkGateway.js';
import { buildEmployeeInvitationMetadata } from '../../src/lib/employeeInvitationMetadata.js';
import type { ClerkGateway, ClerkUserRecord } from '../../src/services/clerkGateway.js';

const app = createAppFromEnv();
const mockGateway: ClerkGateway = {
  createApplicationInvitation: vi.fn(),
  revokeApplicationInvitation: vi.fn(),
  getUserById: vi.fn(),
  findUsersByEmail: vi.fn(),
  updateUserPublicMetadata: vi.fn(),
};
vi.spyOn(clerkGatewayModule, 'getClerkGateway').mockReturnValue(mockGateway);

const TEST_SECRET = process.env.CLERK_WEBHOOK_SECRET!;

// Helper: build a Clerk-style webhook payload
function buildPayload(type: string, overrides: Record<string, unknown> = {}) {
  const { public_metadata, ...rest } = overrides;
  return {
    type,
    data: {
      id: rest.id ?? `user_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      first_name: rest.first_name ?? 'Test',
      last_name: rest.last_name ?? 'User',
      email_addresses: [
        { id: 'idn_primary', email_address: rest.email ?? `test_${Date.now()}@example.com` },
      ],
      primary_email_address_id: 'idn_primary',
      ...(public_metadata !== undefined ? { public_metadata } : {}),
      ...rest,
    },
  };
}

// Helper: sign and post a webhook payload
function signAndPost(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET,
  headerOverrides: Record<string, string> = {}
) {
  const body = JSON.stringify(payload);
  const msgId = headerOverrides['svix-id'] ?? `msg_${Date.now()}`;
  const timestamp = headerOverrides['svix-timestamp']
    ? parseInt(headerOverrides['svix-timestamp'], 10)
    : Math.floor(Date.now() / 1000);
  const wh = new Webhook(secret);
  const signature = wh.sign(msgId, new Date(timestamp * 1000), body);

  return request(app)
    .post('/api/v1/webhooks/clerk')
    .set('Content-Type', 'application/json')
    .set('svix-id', msgId)
    .set('svix-timestamp', String(timestamp))
    .set('svix-signature', signature)
    .send(body);
}

function mockClerkUser(input: {
  clerkUserId: string;
  email: string;
  publicMetadata?: Record<string, unknown>;
}): ClerkUserRecord {
  return {
    id: input.clerkUserId,
    firstName: 'Webhook',
    lastName: 'Invitee',
    primaryEmailAddressId: 'idn_primary',
    publicMetadata: input.publicMetadata ?? {},
    emailAddresses: [
      {
        id: 'idn_primary',
        emailAddress: input.email,
        verificationStatus: 'verified',
      },
    ],
  };
}

describe('Clerk Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.photo.deleteMany();
    await prisma.appointmentNotification.deleteMany();

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

  // ========================================
  // user.created
  // ========================================
  it('creates a user with role CLIENT on valid user.created', async () => {
    const clerkId = `user_test_created_${Date.now()}`;
    const email = `created_${Date.now()}@example.com`;
    const payload = buildPayload('user.created', { id: clerkId, email });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(email);
    expect(user!.name).toBe('Test User');
    expect(user!.role).toBe('CLIENT');
    expect(user!.deletedAt).toBeNull();
  });

  it('is idempotent on duplicate user.created', async () => {
    const clerkId = `user_test_dup_${Date.now()}`;
    const payload = buildPayload('user.created', { id: clerkId });

    const res1 = await signAndPost(payload);
    expect(res1.status).toBe(200);

    const res2 = await signAndPost(payload);
    expect(res2.status).toBe(200);

    const users = await prisma.user.findMany({ where: { clerkUserId: clerkId } });
    expect(users).toHaveLength(1);
  });

  it('reactivates a soft-deleted user on user.created', async () => {
    const clerkId = `user_test_react_${Date.now()}`;

    await prisma.user.create({
      data: {
        clerkUserId: clerkId,
        email: `react_${Date.now()}@example.com`,
        role: 'CLIENT',
        deletedAt: new Date(),
      },
    });

    const payload = buildPayload('user.created', {
      id: clerkId,
      email: `reactivated_${Date.now()}@example.com`,
    });
    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.deletedAt).toBeNull();
  });

  // ========================================
  // user.created — role from public_metadata
  // ========================================

  it('does not elevate a new user to OWNER from generic public_metadata', async () => {
    const clerkId = `user_test_owner_${Date.now()}`;
    const payload = buildPayload('user.created', {
      id: clerkId,
      public_metadata: { role: 'OWNER' },
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('CLIENT');
  });

  it('creates user with role BARBER only from trusted invitation metadata', async () => {
    const clerkId = `user_test_barber_${Date.now()}`;
    const owner = await prisma.user.create({
      data: {
        clerkUserId: `user_test_barber_owner_${Date.now()}`,
        email: `user_test_barber_owner_${Date.now()}@example.com`,
        role: 'OWNER',
      },
    });
    const shop = await prisma.barbershop.create({
      data: {
        ownerId: owner.id,
        name: `Trusted Metadata Shop ${Date.now()}`,
      },
    });
    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: shop.id,
        invitedByUserId: owner.id,
        emailNormalized: `trusted_barber_${Date.now()}@example.com`,
        clerkInvitationId: `trusted_provider_${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const payload = buildPayload('user.created', {
      id: clerkId,
      email: invitation.emailNormalized,
      public_metadata: {
        role: 'BARBER',
        employeeInvitationId: invitation.id,
        roleSource: 'employee_invitation',
      },
    });
    vi.mocked(mockGateway.getUserById).mockResolvedValue(
      mockClerkUser({
        clerkUserId: clerkId,
        email: invitation.emailNormalized,
        publicMetadata: buildEmployeeInvitationMetadata(invitation.id),
      })
    );
    vi.mocked(mockGateway.updateUserPublicMetadata).mockResolvedValue(
      mockClerkUser({
        clerkUserId: clerkId,
        email: invitation.emailNormalized,
        publicMetadata: buildEmployeeInvitationMetadata(invitation.id),
      })
    );

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('BARBER');
  });

  it('creates user with role CLIENT when public_metadata.role is missing', async () => {
    const clerkId = `user_test_nometa_${Date.now()}`;
    const payload = buildPayload('user.created', {
      id: clerkId,
      public_metadata: {}, // no role key
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('CLIENT');
  });

  it('defaults to CLIENT when public_metadata.role is invalid', async () => {
    const clerkId = `user_test_badrole_${Date.now()}`;
    const payload = buildPayload('user.created', {
      id: clerkId,
      public_metadata: { role: 'SUPER_ADMIN' },
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('CLIENT');
  });

  // ========================================
  // user.updated — role from public_metadata
  // ========================================
  it('updates existing user on user.updated', async () => {
    const clerkId = `user_test_upd_${Date.now()}`;

    await prisma.user.create({
      data: {
        clerkUserId: clerkId,
        email: `old_${Date.now()}@example.com`,
        name: 'Old Name',
        role: 'CLIENT',
      },
    });

    const newEmail = `updated_${Date.now()}@example.com`;
    const payload = buildPayload('user.updated', {
      id: clerkId,
      email: newEmail,
      first_name: 'Updated',
      last_name: 'Name',
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.email).toBe(newEmail);
    expect(user!.name).toBe('Updated Name');
  });

  it('upserts user on user.updated when user does not exist', async () => {
    const clerkId = `user_test_upsert_${Date.now()}`;
    const email = `upsert_${Date.now()}@example.com`;
    const payload = buildPayload('user.updated', { id: clerkId, email });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('CLIENT');
  });

  it('preserves OWNER role on user.updated with missing metadata', async () => {
    const clerkId = `user_test_keepowner_${Date.now()}`;

    await prisma.user.create({
      data: { clerkUserId: clerkId, email: `owner_${Date.now()}@example.com`, role: 'OWNER' },
    });

    // Update without any public_metadata — should keep OWNER
    const payload = buildPayload('user.updated', {
      id: clerkId,
      email: `owner_new_${Date.now()}@example.com`,
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('OWNER');
  });

  it('preserves OWNER role on user.updated with CLIENT metadata (no downgrade)', async () => {
    const clerkId = `user_test_nodown_${Date.now()}`;

    await prisma.user.create({
      data: { clerkUserId: clerkId, email: `owner2_${Date.now()}@example.com`, role: 'OWNER' },
    });

    // Attempt to downgrade via metadata — should be ignored
    const payload = buildPayload('user.updated', {
      id: clerkId,
      email: `owner2_new_${Date.now()}@example.com`,
      public_metadata: { role: 'CLIENT' },
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('OWNER');
  });

  it('does not upgrade CLIENT to OWNER on user.updated with OWNER metadata', async () => {
    const clerkId = `user_test_upgrade_${Date.now()}`;

    await prisma.user.create({
      data: { clerkUserId: clerkId, email: `client_${Date.now()}@example.com`, role: 'CLIENT' },
    });

    const payload = buildPayload('user.updated', {
      id: clerkId,
      email: `client_new_${Date.now()}@example.com`,
      public_metadata: { role: 'OWNER' },
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('CLIENT');
  });

  it('preserves BARBER role on user.updated with CLIENT metadata', async () => {
    const clerkId = `user_test_barberkeep_${Date.now()}`;

    await prisma.user.create({
      data: { clerkUserId: clerkId, email: `barber_${Date.now()}@example.com`, role: 'BARBER' },
    });

    const payload = buildPayload('user.updated', {
      id: clerkId,
      email: `barber_new_${Date.now()}@example.com`,
      public_metadata: { role: 'CLIENT' },
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('BARBER');
  });

  it('does not upgrade BARBER to OWNER on user.updated with OWNER metadata', async () => {
    const clerkId = `user_test_barberup_${Date.now()}`;

    await prisma.user.create({
      data: { clerkUserId: clerkId, email: `barber2_${Date.now()}@example.com`, role: 'BARBER' },
    });

    const payload = buildPayload('user.updated', {
      id: clerkId,
      email: `barber2_new_${Date.now()}@example.com`,
      public_metadata: { role: 'OWNER' },
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.role).toBe('BARBER');
  });

  it('reuses the invitation reconciliation service for trusted invitation metadata', async () => {
    const clerkId = `user_test_invited_${Date.now()}`;
    const suffix = Date.now();
    const owner = await prisma.user.create({
      data: {
        clerkUserId: `user_test_owner_invited_${suffix}`,
        email: `owner_invited_${suffix}@example.com`,
        role: 'OWNER',
      },
    });
    const shop = await prisma.barbershop.create({
      data: {
        ownerId: owner.id,
        name: `Invited Shop ${suffix}`,
      },
    });
    const invitation = await prisma.employeeInvitation.create({
      data: {
        barbershopId: shop.id,
        invitedByUserId: owner.id,
        emailNormalized: `webhook_invited_${suffix}@example.com`,
        clerkInvitationId: `provider_${suffix}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    vi.mocked(mockGateway.getUserById).mockResolvedValue(
      mockClerkUser({
        clerkUserId: clerkId,
        email: invitation.emailNormalized,
        publicMetadata: buildEmployeeInvitationMetadata(invitation.id),
      })
    );
    vi.mocked(mockGateway.updateUserPublicMetadata).mockResolvedValue(
      mockClerkUser({
        clerkUserId: clerkId,
        email: invitation.emailNormalized,
        publicMetadata: buildEmployeeInvitationMetadata(invitation.id),
      })
    );

    const payload = buildPayload('user.created', {
      id: clerkId,
      email: invitation.emailNormalized,
      public_metadata: buildEmployeeInvitationMetadata(invitation.id),
    });

    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('BARBER');

    const accepted = await prisma.employeeInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.userId).toBe(user!.id);
  });

  // ========================================
  // user.deleted
  // ========================================
  it('soft-deletes existing user on user.deleted', async () => {
    const clerkId = `user_test_del_${Date.now()}`;

    await prisma.user.create({
      data: {
        clerkUserId: clerkId,
        email: `del_${Date.now()}@example.com`,
        role: 'CLIENT',
      },
    });

    const payload = buildPayload('user.deleted', { id: clerkId });
    const res = await signAndPost(payload);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { clerkUserId: clerkId } });
    expect(user!.deletedAt).not.toBeNull();
  });

  it('returns 200 on user.deleted for non-existent user', async () => {
    const payload = buildPayload('user.deleted', { id: 'user_nonexistent_12345' });
    const res = await signAndPost(payload);
    expect(res.status).toBe(200);
  });

  // ========================================
  // Unknown events
  // ========================================
  it('returns 200 for unknown event types', async () => {
    const payload = buildPayload('session.created', { id: 'sess_123' });
    const res = await signAndPost(payload);
    expect(res.status).toBe(200);
  });

  // ========================================
  // Signature verification
  // ========================================
  it('rejects invalid signature with 400', async () => {
    const payload = buildPayload('user.created');
    const body = JSON.stringify(payload);
    const msgId = `msg_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const wh = new Webhook('whsec_c2VjcmV0X3dyb25nX2tleV8zMl9ieXRlc19mb3JfdGVzdGluZw==');
    const signature = wh.sign(msgId, new Date(timestamp * 1000), body);

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', String(timestamp))
      .set('svix-signature', signature)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('Invalid webhook signature');
  });

  it('rejects missing svix-id header with 400', async () => {
    const payload = buildPayload('user.created');
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const wh = new Webhook(TEST_SECRET);
    const signature = wh.sign(`msg_${Date.now()}`, new Date(timestamp * 1000), body);

    const res = await request(app)
      .post('/api/v1/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-timestamp', String(timestamp))
      .set('svix-signature', signature)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Missing required webhook signature headers');
  });

  // ========================================
  // Regression: JSON parsing still works
  // ========================================
  it('health check still works after webhook wiring', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
