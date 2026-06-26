import {
  EmployeeInvitationStatus,
  Prisma,
  UserRole,
  type EmployeeInvitation,
  type User,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizeEmail } from '../lib/email.js';
import {
  buildEmployeeInvitationMetadata,
  getClerkMetadataRole,
  parseTrustedEmployeeInvitationMetadata,
} from '../lib/employeeInvitationMetadata.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { getClerkGateway, type ClerkUserRecord } from './clerkGateway.js';
import * as employeeService from './employeeService.js';
import type { CreateEmployeeInvitationInput } from '../schemas/employeeInvitation.js';

const INVITATION_EXPIRY_DAYS = 7;
const DISPATCH_STALE_MS = 5 * 60 * 1000;
const DELIVERY_FAILURE_IN_FLIGHT = 'DISPATCH_IN_FLIGHT';
const DELIVERY_FAILURE_LOCAL_PERSISTENCE = 'LOCAL_PERSISTENCE_FAILED';
const DELIVERY_FAILURE_INCOMPLETE_PENDING = 'INCOMPLETE_PENDING';

interface SerializedEmployeeInvitation {
  id: string;
  email: string;
  invitedRole: UserRole;
  status: EmployeeInvitationStatus;
  expiresAt: string | null;
  lastSentAt: string | null;
  resendCount: number;
  acceptedAt: string | null;
  revokedAt: string | null;
  userId: string | null;
  employeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateEmployeeInvitationResult {
  outcome:
    | 'employee_created'
    | 'employee_reactivated'
    | 'invitation_created'
    | 'invitation_pending';
  employee: unknown | null;
  invitation: SerializedEmployeeInvitation | null;
}

interface ReconcileEmployeeInvitationResult {
  outcome: 'ready' | 'reconciled' | 'already_reconciled';
  userId: string;
  employeeId: string;
  barbershopId: string;
}

interface ReconcileOptions {
  clerkUserId: string;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function serializeInvitation(
  invitation: EmployeeInvitation
): SerializedEmployeeInvitation {
  return {
    id: invitation.id,
    email: invitation.emailNormalized,
    invitedRole: invitation.invitedRole,
    status: invitation.status,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    lastSentAt: invitation.lastSentAt?.toISOString() ?? null,
    resendCount: invitation.resendCount,
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    userId: invitation.userId ?? null,
    employeeId: invitation.employeeId ?? null,
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString(),
  };
}

function buildFailureCode(error: unknown): string {
  if (isClerkRateLimitError(error)) {
    return 'CLERK_RATE_LIMITED';
  }

  const code = extractNestedString(error, ['errors', 0, 'code'])
    ?? extractNestedString(error, ['code'])
    ?? extractNestedString(error, ['clerkError', 'code'])
    ?? 'CLERK_INVITATION_FAILED';

  return code.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 64) || 'CLERK_INVITATION_FAILED';
}

function extractNestedString(
  value: unknown,
  path: Array<string | number>
): string | null {
  let current: unknown = value;

  for (const segment of path) {
    if (current == null || typeof current !== 'object') {
      return null;
    }

    current = (current as Record<string | number, unknown>)[segment];
  }

  return typeof current === 'string' ? current : null;
}

function extractStatusCode(error: unknown): number | null {
  const candidates = [
    (error as { status?: unknown })?.status,
    (error as { statusCode?: unknown })?.statusCode,
    (error as { clerkError?: { status?: unknown } })?.clerkError?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number') {
      return candidate;
    }
  }

  return null;
}

function isClerkRateLimitError(error: unknown): boolean {
  return extractStatusCode(error) === 429;
}

function isClerkNotFoundError(error: unknown): boolean {
  return extractStatusCode(error) === 404;
}

function throwInvitationNotFound(): never {
  throw new AppError(
    404,
    'EMPLOYEE_INVITATION_NOT_FOUND',
    'Employee invitation not found'
  );
}

function throwAlreadyActive(): never {
  throw new AppError(
    409,
    'EMPLOYEE_ALREADY_ACTIVE',
    'Employee is already active for this barbershop'
  );
}

function throwRoleNotEligible(message = 'User role is not eligible for employee invitation onboarding'): never {
  throw new AppError(409, 'USER_ROLE_NOT_ELIGIBLE', message);
}

function throwAcceptedInvitation(): never {
  throw new AppError(
    409,
    'EMPLOYEE_INVITATION_ACCEPTED',
    'Employee invitation has already been accepted'
  );
}

function throwRevokedInvitation(): never {
  throw new AppError(
    409,
    'EMPLOYEE_INVITATION_REVOKED',
    'Employee invitation has been revoked'
  );
}

function throwExpiredInvitation(): never {
  throw new AppError(
    409,
    'EMPLOYEE_INVITATION_EXPIRED',
    'Employee invitation has expired'
  );
}

function throwDeliveryFailedInvitation(): never {
  throw new AppError(
    409,
    'EMPLOYEE_INVITATION_DELIVERY_FAILED',
    'Employee invitation delivery failed and must be retried'
  );
}

function throwAmbiguousInvitation(): never {
  throw new AppError(
    409,
    'AMBIGUOUS_EMPLOYEE_INVITATION',
    'Multiple matching employee invitations were found'
  );
}

function throwOnboardingRequired(message = 'A valid employee invitation is required to complete onboarding'): never {
  throw new AppError(409, 'ONBOARDING_INVITATION_REQUIRED', message);
}

function throwInvitationRateLimited(): never {
  throw new AppError(
    429,
    'EMPLOYEE_INVITATION_RATE_LIMITED',
    'Employee invitation requests are being rate limited by Clerk'
  );
}

async function lockInvitationById(
  tx: Prisma.TransactionClient,
  invitationId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id"
    FROM "employee_invitations"
    WHERE "id" = ${invitationId}
    FOR UPDATE
  `;
}

async function findLocalUserByEmail(
  emailNormalized: string
): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email: emailNormalized },
    orderBy: { createdAt: 'asc' },
  });
}

async function findEmployeeForShop(
  userId: string,
  barbershopId: string
) {
  return prisma.employee.findUnique({
    where: {
      barbershopId_userId: {
        barbershopId,
        userId,
      },
    },
  });
}

async function resolveImmediateBarberOutcome(
  barbershopId: string,
  user: User
): Promise<CreateEmployeeInvitationResult> {
  const existingEmployee = await findEmployeeForShop(user.id, barbershopId);

  if (existingEmployee && existingEmployee.isActive && !existingEmployee.deletedAt) {
    throwAlreadyActive();
  }

  if (existingEmployee) {
    const employee = await employeeService.reactivateEmployee(
      barbershopId,
      existingEmployee.id
    );

    return {
      outcome: 'employee_reactivated',
      employee,
      invitation: null,
    };
  }

  const employee = await employeeService.addEmployee(barbershopId, {
    userId: user.id,
  });

  return {
    outcome: 'employee_created',
    employee,
    invitation: null,
  };
}

async function markExpiredInvitationsForShop(
  barbershopId: string,
  now: Date
): Promise<void> {
  await prisma.employeeInvitation.updateMany({
    where: {
      barbershopId,
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  await prisma.employeeInvitation.updateMany({
    where: {
      barbershopId,
      status: 'PENDING',
      clerkInvitationId: null,
      updatedAt: { lt: new Date(now.getTime() - DISPATCH_STALE_MS) },
    },
    data: {
      status: 'DELIVERY_FAILED',
      deliveryFailureCode: DELIVERY_FAILURE_INCOMPLETE_PENDING,
    },
  });
}

async function normalizeInvitationState(
  tx: Prisma.TransactionClient,
  invitation: EmployeeInvitation,
  now: Date
): Promise<EmployeeInvitation> {
  if (invitation.status === 'PENDING' && invitation.expiresAt && invitation.expiresAt < now) {
    return tx.employeeInvitation.update({
      where: { id: invitation.id },
      data: { status: 'EXPIRED' },
    });
  }

  if (
    invitation.status === 'PENDING' &&
    !invitation.clerkInvitationId &&
    invitation.updatedAt.getTime() <= now.getTime() - DISPATCH_STALE_MS
  ) {
    return tx.employeeInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'DELIVERY_FAILED',
        deliveryFailureCode: DELIVERY_FAILURE_INCOMPLETE_PENDING,
      },
    });
  }

  return invitation;
}

async function safeMarkDeliveryFailed(
  invitationId: string,
  failureCode: string
): Promise<void> {
  try {
    await prisma.employeeInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'DELIVERY_FAILED',
        deliveryFailureCode: failureCode,
        clerkInvitationId: null,
        expiresAt: null,
      },
    });
  } catch {
    // Best effort only.
  }
}

async function safeCompensateInvitation(
  invitationId: string,
  clerkInvitationId: string
): Promise<void> {
  try {
    await getClerkGateway().revokeApplicationInvitation(clerkInvitationId);
  } catch (compensationError) {
    console.warn('Failed to compensate Clerk invitation after local persistence error', {
      invitationId,
      clerkInvitationId,
      error: buildFailureCode(compensationError),
    });
  }

  await safeMarkDeliveryFailed(invitationId, DELIVERY_FAILURE_LOCAL_PERSISTENCE);
}

function preferVerifiedEmail(
  clerkUser: ClerkUserRecord,
  emailNormalized: string
): string {
  const exact = clerkUser.emailAddresses.find(
    (email) => normalizeEmail(email.emailAddress) === emailNormalized
  );

  if (exact) {
    return normalizeEmail(exact.emailAddress);
  }

  const primary = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId
  );

  if (primary) {
    return normalizeEmail(primary.emailAddress);
  }

  return emailNormalized;
}

function deriveDisplayName(clerkUser: ClerkUserRecord, fallbackEmail: string): string {
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(
    (part): part is string => Boolean(part)
  );

  if (parts.length > 0) {
    return parts.join(' ').trim();
  }

  return fallbackEmail.split('@')[0] || 'User';
}

async function ensureInvitationDispatchPreparation(input: {
  barbershopId: string;
  invitedByUserId: string;
  emailNormalized: string;
  now: Date;
}): Promise<
  | { type: 'existing_pending'; invitation: EmployeeInvitation }
  | { type: 'send'; invitation: EmployeeInvitation }
> {
  return prisma.$transaction(async (tx) => {
    const upserted = await tx.employeeInvitation.upsert({
      where: {
        barbershopId_emailNormalized: {
          barbershopId: input.barbershopId,
          emailNormalized: input.emailNormalized,
        },
      },
      create: {
        barbershopId: input.barbershopId,
        invitedByUserId: input.invitedByUserId,
        emailNormalized: input.emailNormalized,
        invitedRole: 'BARBER',
        status: 'PENDING',
      },
      update: {
        invitedByUserId: input.invitedByUserId,
      },
    });

    await lockInvitationById(tx, upserted.id);

    let invitation = await tx.employeeInvitation.findUniqueOrThrow({
      where: { id: upserted.id },
    });

    invitation = await normalizeInvitationState(tx, invitation, input.now);

    if (invitation.status === 'ACCEPTED') {
      throwAcceptedInvitation();
    }

    if (
      invitation.status === 'PENDING' &&
      invitation.clerkInvitationId &&
      (!invitation.expiresAt || invitation.expiresAt >= input.now)
    ) {
      return { type: 'existing_pending', invitation };
    }

    const nextResendCount =
      invitation.lastSentAt || invitation.clerkInvitationId || invitation.deliveryFailureCode || invitation.revokedAt
        ? invitation.resendCount + 1
        : invitation.resendCount;

    invitation = await tx.employeeInvitation.update({
      where: { id: invitation.id },
      data: {
        invitedByUserId: input.invitedByUserId,
        invitedRole: 'BARBER',
        status: 'PENDING',
        clerkInvitationId: null,
        expiresAt: null,
        acceptedAt: null,
        revokedAt: null,
        userId: null,
        employeeId: null,
        deliveryFailureCode: DELIVERY_FAILURE_IN_FLIGHT,
        resendCount: nextResendCount,
      },
    });

    return { type: 'send', invitation };
  });
}

async function finalizeInvitationDispatch(input: {
  invitationId: string;
  clerkInvitationId: string;
  now: Date;
}): Promise<EmployeeInvitation> {
  return prisma.employeeInvitation.update({
    where: { id: input.invitationId },
    data: {
      clerkInvitationId: input.clerkInvitationId,
      status: 'PENDING',
      expiresAt: addDays(input.now, INVITATION_EXPIRY_DAYS),
      lastSentAt: input.now,
      deliveryFailureCode: null,
      revokedAt: null,
    },
  });
}

async function loadInvitationForShop(
  barbershopId: string,
  invitationId: string
): Promise<EmployeeInvitation> {
  const invitation = await prisma.employeeInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation || invitation.barbershopId !== barbershopId) {
    throwInvitationNotFound();
  }

  return invitation;
}

async function ensureReinviteAllowed(input: {
  invitation: EmployeeInvitation;
  now: Date;
}): Promise<EmployeeInvitation> {
  return prisma.$transaction(async (tx) => {
    await lockInvitationById(tx, input.invitation.id);

    let invitation = await tx.employeeInvitation.findUniqueOrThrow({
      where: { id: input.invitation.id },
    });

    invitation = await normalizeInvitationState(tx, invitation, input.now);

    if (invitation.status === 'ACCEPTED') {
      throwAcceptedInvitation();
    }

    return invitation;
  });
}

async function findReconciliationCandidates(input: {
  verifiedEmails: string[];
  trustedInvitationId: string | null;
  now: Date;
}): Promise<EmployeeInvitation[]> {
  return prisma.$transaction(async (tx) => {
    if (input.trustedInvitationId) {
      const invitation = await tx.employeeInvitation.findUnique({
        where: { id: input.trustedInvitationId },
      });

      if (!invitation) {
        return [];
      }

      const normalized = await normalizeInvitationState(tx, invitation, input.now);
      return [normalized];
    }

    const invitations = await tx.employeeInvitation.findMany({
      where: {
        emailNormalized: { in: input.verifiedEmails },
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const normalized: EmployeeInvitation[] = [];
    for (const invitation of invitations) {
      normalized.push(await normalizeInvitationState(tx, invitation, input.now));
    }

    return normalized;
  });
}

async function ensureEmployeeMembershipForInvitation(input: {
  tx: Prisma.TransactionClient;
  invitation: EmployeeInvitation;
  userId: string;
}): Promise<{ employeeId: string; outcome: 'created' | 'reactivated' | 'existing' }> {
  const existingEmployee = await input.tx.employee.findUnique({
    where: {
      barbershopId_userId: {
        barbershopId: input.invitation.barbershopId,
        userId: input.userId,
      },
    },
  });

  if (existingEmployee && existingEmployee.isActive && !existingEmployee.deletedAt) {
    return { employeeId: existingEmployee.id, outcome: 'existing' };
  }

  if (existingEmployee) {
    const employee = await input.tx.employee.update({
      where: { id: existingEmployee.id },
      data: {
        isActive: true,
        deletedAt: null,
      },
    });

    return { employeeId: employee.id, outcome: 'reactivated' };
  }

  const employee = await input.tx.employee.create({
    data: {
      barbershopId: input.invitation.barbershopId,
      userId: input.userId,
      isActive: true,
    },
  });

  return { employeeId: employee.id, outcome: 'created' };
}

async function ensureLocalUserForReconcile(input: {
  tx: Prisma.TransactionClient;
  clerkUser: ClerkUserRecord;
  invitation: EmployeeInvitation;
}): Promise<User> {
  const existing = await input.tx.user.findUnique({
    where: { clerkUserId: input.clerkUser.id },
  });

  if (existing) {
    return existing;
  }

  const email = preferVerifiedEmail(input.clerkUser, input.invitation.emailNormalized);
  const name = deriveDisplayName(input.clerkUser, email);

  try {
    return await input.tx.user.create({
      data: {
        clerkUserId: input.clerkUser.id,
        email,
        name,
        role: 'BARBER',
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const concurrent = await input.tx.user.findUnique({
        where: { clerkUserId: input.clerkUser.id },
      });

      if (concurrent) {
        return concurrent;
      }
    }

    throw error;
  }
}

function getVerifiedEmails(clerkUser: ClerkUserRecord): string[] {
  const verified = clerkUser.emailAddresses
    .filter((email) => email.verificationStatus === 'verified')
    .map((email) => normalizeEmail(email.emailAddress));

  return Array.from(new Set(verified));
}

async function resolveInvitationForReconcile(input: {
  clerkUser: ClerkUserRecord;
  now: Date;
}): Promise<EmployeeInvitation> {
  const metadata = parseTrustedEmployeeInvitationMetadata(
    input.clerkUser.publicMetadata
  );
  const verifiedEmails = getVerifiedEmails(input.clerkUser);

  if (verifiedEmails.length === 0) {
    throwOnboardingRequired('A verified email is required to complete employee onboarding');
  }

  const invitations = await findReconciliationCandidates({
    verifiedEmails,
    trustedInvitationId: metadata?.employeeInvitationId ?? null,
    now: input.now,
  });

  if (metadata?.employeeInvitationId) {
    const invitation = invitations[0];

    if (!invitation) {
      throwOnboardingRequired();
    }

    if (!verifiedEmails.includes(invitation.emailNormalized)) {
      throwOnboardingRequired('Verified Clerk email does not match the employee invitation');
    }

    return invitation;
  }

  const pending = invitations.filter(
    (invitation) => invitation.status === 'PENDING' && verifiedEmails.includes(invitation.emailNormalized)
  );

  if (pending.length === 0) {
    throwOnboardingRequired();
  }

  if (pending.length > 1) {
    throwAmbiguousInvitation();
  }

  return pending[0]!;
}

function assertInvitationStillValid(
  invitation: EmployeeInvitation,
  verifiedEmails: string[],
  now: Date
): void {
  if (!verifiedEmails.includes(invitation.emailNormalized)) {
    throwOnboardingRequired('Verified Clerk email does not match the employee invitation');
  }

  if (invitation.status === 'REVOKED') {
    throwRevokedInvitation();
  }

  if (invitation.status === 'EXPIRED') {
    throwExpiredInvitation();
  }

  if (invitation.status === 'DELIVERY_FAILED') {
    throwDeliveryFailedInvitation();
  }

  if (invitation.status === 'PENDING' && invitation.expiresAt && invitation.expiresAt < now) {
    throwExpiredInvitation();
  }
}

export async function createEmployeeInvitation(
  barbershopId: string,
  invitedByUserId: string,
  input: CreateEmployeeInvitationInput,
  now: Date = new Date()
): Promise<CreateEmployeeInvitationResult> {
  const emailNormalized = normalizeEmail(input.email);
  const existingLocalUser = await findLocalUserByEmail(emailNormalized);

  if (existingLocalUser?.deletedAt) {
    throwRoleNotEligible('Deactivated users are not eligible for employee invitation onboarding');
  }

  if (existingLocalUser) {
    if (existingLocalUser.role === 'CLIENT' || existingLocalUser.role === 'OWNER') {
      throwRoleNotEligible();
    }

    return resolveImmediateBarberOutcome(barbershopId, existingLocalUser);
  }

  const preparation = await ensureInvitationDispatchPreparation({
    barbershopId,
    invitedByUserId,
    emailNormalized,
    now,
  });

  if (preparation.type === 'existing_pending') {
    return {
      outcome: 'invitation_pending',
      employee: null,
      invitation: serializeInvitation(preparation.invitation),
    };
  }

  try {
    const created = await getClerkGateway().createApplicationInvitation({
      emailAddress: emailNormalized,
      expiresInDays: INVITATION_EXPIRY_DAYS,
      publicMetadata: buildEmployeeInvitationMetadata(preparation.invitation.id),
    });

    try {
      const invitation = await finalizeInvitationDispatch({
        invitationId: preparation.invitation.id,
        clerkInvitationId: created.id,
        now,
      });

      return {
        outcome: 'invitation_created',
        employee: null,
        invitation: serializeInvitation(invitation),
      };
    } catch (error) {
      await safeCompensateInvitation(preparation.invitation.id, created.id);
      throw error;
    }
  } catch (error) {
    await safeMarkDeliveryFailed(preparation.invitation.id, buildFailureCode(error));

    if (isClerkRateLimitError(error)) {
      throwInvitationRateLimited();
    }

    throw new AppError(
      503,
      'EMPLOYEE_INVITATION_DELIVERY_FAILED',
      'Failed to create the Clerk employee invitation'
    );
  }
}

export async function listEmployeeInvitations(
  barbershopId: string,
  now: Date = new Date()
): Promise<SerializedEmployeeInvitation[]> {
  await markExpiredInvitationsForShop(barbershopId, now);

  const invitations = await prisma.employeeInvitation.findMany({
    where: { barbershopId },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return invitations.map(serializeInvitation);
}

export async function resendEmployeeInvitation(input: {
  barbershopId: string;
  invitationId: string;
  invitedByUserId: string;
  now?: Date;
}): Promise<SerializedEmployeeInvitation> {
  const now = input.now ?? new Date();
  const original = await loadInvitationForShop(input.barbershopId, input.invitationId);
  const invitation = await ensureReinviteAllowed({ invitation: original, now });

  const localUser = await findLocalUserByEmail(invitation.emailNormalized);
  if (localUser?.deletedAt) {
    throwRoleNotEligible('Deactivated users are not eligible for employee invitation onboarding');
  }

  if (localUser) {
    if (localUser.role === 'CLIENT' || localUser.role === 'OWNER') {
      throwRoleNotEligible();
    }

    const existingEmployee = await findEmployeeForShop(localUser.id, input.barbershopId);
    if (existingEmployee && existingEmployee.isActive && !existingEmployee.deletedAt) {
      throwAlreadyActive();
    }
  }

  const previousClerkInvitationId = invitation.clerkInvitationId;

  const prepared = await prisma.$transaction(async (tx) => {
    await lockInvitationById(tx, invitation.id);

    const locked = await tx.employeeInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });

    const normalized = await normalizeInvitationState(tx, locked, now);

    if (normalized.status === 'ACCEPTED') {
      throwAcceptedInvitation();
    }

    return tx.employeeInvitation.update({
      where: { id: normalized.id },
      data: {
        invitedByUserId: input.invitedByUserId,
        status: 'PENDING',
        clerkInvitationId: null,
        expiresAt: null,
        revokedAt: null,
        deliveryFailureCode: DELIVERY_FAILURE_IN_FLIGHT,
        resendCount: normalized.resendCount + 1,
      },
    });
  });

  if (previousClerkInvitationId) {
    try {
      await getClerkGateway().revokeApplicationInvitation(previousClerkInvitationId);
    } catch (error) {
      if (!isClerkNotFoundError(error)) {
        await safeMarkDeliveryFailed(prepared.id, buildFailureCode(error));
        throw new AppError(
          503,
          'EMPLOYEE_INVITATION_DELIVERY_FAILED',
          'Failed to revoke the previous Clerk employee invitation'
        );
      }
    }
  }

  try {
    const created = await getClerkGateway().createApplicationInvitation({
      emailAddress: invitation.emailNormalized,
      expiresInDays: INVITATION_EXPIRY_DAYS,
      publicMetadata: buildEmployeeInvitationMetadata(invitation.id),
    });

    try {
      const updated = await finalizeInvitationDispatch({
        invitationId: invitation.id,
        clerkInvitationId: created.id,
        now,
      });
      return serializeInvitation(updated);
    } catch (error) {
      await safeCompensateInvitation(invitation.id, created.id);
      throw error;
    }
  } catch (error) {
    await safeMarkDeliveryFailed(invitation.id, buildFailureCode(error));

    if (isClerkRateLimitError(error)) {
      throwInvitationRateLimited();
    }

    throw new AppError(
      503,
      'EMPLOYEE_INVITATION_DELIVERY_FAILED',
      'Failed to recreate the Clerk employee invitation'
    );
  }
}

export async function revokeEmployeeInvitation(input: {
  barbershopId: string;
  invitationId: string;
  now?: Date;
}): Promise<SerializedEmployeeInvitation> {
  const now = input.now ?? new Date();
  const invitation = await loadInvitationForShop(input.barbershopId, input.invitationId);

  if (invitation.status === 'ACCEPTED') {
    throwAcceptedInvitation();
  }

  if (invitation.status === 'REVOKED') {
    return serializeInvitation(invitation);
  }

  if (invitation.clerkInvitationId) {
    try {
      await getClerkGateway().revokeApplicationInvitation(invitation.clerkInvitationId);
    } catch (error) {
      if (!isClerkNotFoundError(error)) {
        throw new AppError(
          503,
          'EMPLOYEE_INVITATION_DELIVERY_FAILED',
          'Failed to revoke the Clerk employee invitation'
        );
      }
    }
  }

  const updated = await prisma.employeeInvitation.update({
    where: { id: invitation.id },
    data: {
      status: 'REVOKED',
      revokedAt: now,
      deliveryFailureCode: null,
    },
  });

  return serializeInvitation(updated);
}

export async function reconcileEmployeeInvitation(
  options: ReconcileOptions,
  now: Date = new Date()
): Promise<ReconcileEmployeeInvitationResult> {
  const clerkGateway = getClerkGateway();
  const clerkUser = await clerkGateway.getUserById(options.clerkUserId);
  const verifiedEmails = getVerifiedEmails(clerkUser);

  if (verifiedEmails.length === 0) {
    throwOnboardingRequired('A verified email is required to complete employee onboarding');
  }

  const invitation = await resolveInvitationForReconcile({
    clerkUser,
    now,
  });

  assertInvitationStillValid(invitation, verifiedEmails, now);

  const metadataRole = getClerkMetadataRole(clerkUser.publicMetadata);
  let existingLocalUser = await prisma.user.findUnique({
    where: { clerkUserId: options.clerkUserId },
  });

  if (existingLocalUser?.deletedAt) {
    throwRoleNotEligible('Deactivated users are not eligible for employee invitation onboarding');
  }

  if (existingLocalUser && (existingLocalUser.role === 'CLIENT' || existingLocalUser.role === 'OWNER')) {
    throwRoleNotEligible();
  }

  if (!existingLocalUser && metadataRole === 'OWNER') {
    throwRoleNotEligible('Clerk owner metadata is not eligible for employee invitation onboarding');
  }

  if (!existingLocalUser) {
    await clerkGateway.updateUserPublicMetadata(
      options.clerkUserId,
      buildEmployeeInvitationMetadata(invitation.id)
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockInvitationById(tx, invitation.id);

    let lockedInvitation = await tx.employeeInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });

    lockedInvitation = await normalizeInvitationState(tx, lockedInvitation, now);
    assertInvitationStillValid(lockedInvitation, verifiedEmails, now);

    let outcome: 'ready' | 'reconciled' | 'already_reconciled' = 'reconciled';

    let localUser = existingLocalUser;
    if (!localUser) {
      localUser = await ensureLocalUserForReconcile({
        tx,
        clerkUser,
        invitation: lockedInvitation,
      });
    }

    if (localUser.deletedAt) {
      throwRoleNotEligible('Deactivated users are not eligible for employee invitation onboarding');
    }

    if (localUser.role === 'CLIENT' || localUser.role === 'OWNER') {
      throwRoleNotEligible();
    }

    const employeeResult = await ensureEmployeeMembershipForInvitation({
      tx,
      invitation: lockedInvitation,
      userId: localUser.id,
    });

    if (
      lockedInvitation.status === 'ACCEPTED' &&
      lockedInvitation.userId === localUser.id &&
      lockedInvitation.employeeId === employeeResult.employeeId
    ) {
      outcome = 'already_reconciled';
    } else if (employeeResult.outcome === 'existing') {
      outcome = 'ready';
    }

    const acceptedAt = lockedInvitation.acceptedAt ?? now;

    await tx.employeeInvitation.update({
      where: { id: lockedInvitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt,
        userId: localUser.id,
        employeeId: employeeResult.employeeId,
        deliveryFailureCode: null,
      },
    });

    return {
      outcome,
      userId: localUser.id,
      employeeId: employeeResult.employeeId,
      barbershopId: lockedInvitation.barbershopId,
    };
  });

  existingLocalUser = await prisma.user.findUnique({
    where: { clerkUserId: options.clerkUserId },
  });

  if (!existingLocalUser) {
    throw new NotFoundError('User');
  }

  return result;
}
