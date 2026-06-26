/**
 * User synchronization service
 *
 * Handles Clerk webhook events: user.created, user.updated, user.deleted.
 * Reads role from Clerk public_metadata.role when available.
 * Defaults to CLIENT when no metadata or invalid value.
 * NEVER downgrades an existing OWNER/BARBER role via webhook update.
 *
 * DB User.role remains the runtime source of truth for auth middleware.
 * public_metadata is trusted only at webhook sync time.
 * unsafe_metadata is intentionally NOT used.
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError } from '../lib/errors.js';
import { Prisma } from '@prisma/client';
import type { User, UserRole } from '@prisma/client';
import { normalizeEmail } from '../lib/email.js';
import { parseTrustedEmployeeInvitationMetadata } from '../lib/employeeInvitationMetadata.js';

// ============================================
// TYPES
// ============================================

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkWebhookData {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  public_metadata?: Record<string, unknown>;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkWebhookData;
}

// ============================================
// HELPERS
// ============================================

function extractEmail(data: ClerkWebhookData): string {
  const addresses = data.email_addresses;
  if (!addresses || addresses.length === 0) {
    throw new BadRequestError('User email is required');
  }

  // Use primary email if specified
  if (data.primary_email_address_id) {
    const primary = addresses.find((a) => a.id === data.primary_email_address_id);
    if (primary) return normalizeEmail(primary.email_address);
  }

  // Fallback to first email
  return normalizeEmail(addresses[0]!.email_address);
}

function extractName(data: ClerkWebhookData, email: string): string {
  const parts = [data.first_name, data.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ').trim();
  // Fallback: email local part
  const localPart = email.split('@')[0];
  if (localPart) return localPart;
  return 'User';
}

function deriveTrustedWebhookRole(publicMetadata: unknown): UserRole {
  return parseTrustedEmployeeInvitationMetadata(publicMetadata)?.role ?? 'CLIENT';
}

/**
 * Resolves the effective role when updating an existing user.
 *
 * Rule: NEVER downgrade. OWNER is never granted from generic Clerk metadata.
 * Only trusted backend-controlled employee-invitation metadata may promote
 * CLIENT → BARBER.
 */
function resolveRole(
  existingRole: UserRole | undefined,
  metadataRole: UserRole
): UserRole {
  if (!existingRole) return metadataRole;

  if (existingRole === 'OWNER') {
    return 'OWNER';
  }

  if (existingRole === 'BARBER') {
    return 'BARBER';
  }

  return metadataRole === 'BARBER' ? 'BARBER' : existingRole;
}

// ============================================
// EVENT HANDLERS
// ============================================

export async function handleUserCreated(
  event: ClerkWebhookEvent
): Promise<User> {
  const { data } = event;
  const clerkUserId = data.id;
  const email = extractEmail(data);
  const name = extractName(data, email);
  const role = deriveTrustedWebhookRole(data.public_metadata);

  try {
    return await prisma.user.create({
      data: {
        clerkUserId,
        email,
        name,
        role,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Duplicate — check if soft-deleted and restore
      const existing = await prisma.user.findUnique({
        where: { clerkUserId },
      });
      if (existing?.deletedAt) {
        // Restore preserving the higher of existing or metadata role
        const effectiveRole = resolveRole(existing.role, role);
        return await prisma.user.update({
          where: { clerkUserId },
          data: { deletedAt: null, name, email, role: effectiveRole },
        });
      }
      return existing!;
    }
    throw err;
  }
}

export async function handleUserUpdated(
  event: ClerkWebhookEvent
): Promise<User> {
  const { data } = event;
  const clerkUserId = data.id;
  const email = extractEmail(data);
  const name = extractName(data, email);
  const metadataRole = deriveTrustedWebhookRole(data.public_metadata);

  // Fetch existing user to prevent role downgrades
  const existing = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (existing) {
    // Never downgrade: resolve effective role preserving privilege
    const effectiveRole = resolveRole(existing.role, metadataRole);

    return prisma.user.update({
      where: { clerkUserId },
      data: {
        email,
        name,
        role: effectiveRole,
        deletedAt: null,
      },
    });
  }

  // User doesn't exist yet — create with metadata role
  return prisma.user.create({
    data: {
      clerkUserId,
      email,
      name,
      role: metadataRole,
    },
  });
}

export async function handleUserDeleted(
  event: ClerkWebhookEvent
): Promise<User | null> {
  const clerkUserId = event.data.id;

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (!user) return null; // no-op

  return prisma.user.update({
    where: { clerkUserId },
    data: { deletedAt: new Date() },
  });
}
