/**
 * User synchronization service
 *
 * Handles Clerk webhook events: user.created, user.updated, user.deleted.
 * All webhook-created users default to role CLIENT.
 * Idempotent: duplicates return 200 with no side effects.
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError } from '../lib/errors.js';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';

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
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkWebhookData;
}

function extractEmail(data: ClerkWebhookData): string {
  const addresses = data.email_addresses;
  if (!addresses || addresses.length === 0) {
    throw new BadRequestError('User email is required');
  }

  // Use primary email if specified
  if (data.primary_email_address_id) {
    const primary = addresses.find((a) => a.id === data.primary_email_address_id);
    if (primary) return primary.email_address;
  }

  // Fallback to first email
  return addresses[0]!.email_address;
}

function extractName(data: ClerkWebhookData, email: string): string {
  const parts = [data.first_name, data.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ').trim();
  // Fallback: email local part
  const localPart = email.split('@')[0];
  if (localPart) return localPart;
  return 'User';
}

export async function handleUserCreated(
  event: ClerkWebhookEvent
): Promise<User> {
  const { data } = event;
  const clerkUserId = data.id;
  const email = extractEmail(data);
  const name = extractName(data, email);

  try {
    return await prisma.user.create({
      data: {
        clerkUserId,
        email,
        name,
        role: 'CLIENT',
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
        return await prisma.user.update({
          where: { clerkUserId },
          data: { deletedAt: null, name, email },
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

  return prisma.user.upsert({
    where: { clerkUserId },
    update: { email, name, deletedAt: null },
    create: {
      clerkUserId,
      email,
      name,
      role: 'CLIENT',
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
