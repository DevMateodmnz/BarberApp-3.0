import {
  createClerkClient,
  type Invitation as ClerkBackendInvitation,
  type User as ClerkBackendUser,
} from '@clerk/express';

export interface ClerkInvitationRecord {
  id: string;
  emailAddress: string;
  publicMetadata: Record<string, unknown> | null;
  status: string;
  revoked: boolean;
}

export interface ClerkUserEmailRecord {
  id: string;
  emailAddress: string;
  verificationStatus: string | null;
}

export interface ClerkUserRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddressId: string | null;
  publicMetadata: Record<string, unknown>;
  emailAddresses: ClerkUserEmailRecord[];
}

export interface CreateApplicationInvitationInput {
  emailAddress: string;
  expiresInDays: number;
  publicMetadata: Record<string, unknown>;
}

export interface ClerkGateway {
  createApplicationInvitation(
    input: CreateApplicationInvitationInput
  ): Promise<ClerkInvitationRecord>;
  revokeApplicationInvitation(invitationId: string): Promise<ClerkInvitationRecord>;
  getUserById(clerkUserId: string): Promise<ClerkUserRecord>;
  findUsersByEmail(emailAddress: string): Promise<ClerkUserRecord[]>;
  updateUserPublicMetadata(
    clerkUserId: string,
    publicMetadata: Record<string, unknown>
  ): Promise<ClerkUserRecord>;
}

function mapInvitation(invitation: ClerkBackendInvitation): ClerkInvitationRecord {
  return {
    id: invitation.id,
    emailAddress: invitation.emailAddress,
    publicMetadata: invitation.publicMetadata,
    status: invitation.status,
    revoked: invitation.revoked === true,
  };
}

function mapUser(user: ClerkBackendUser): ClerkUserRecord {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    primaryEmailAddressId: user.primaryEmailAddressId,
    publicMetadata:
      user.publicMetadata && typeof user.publicMetadata === 'object'
        ? (user.publicMetadata as Record<string, unknown>)
        : {},
    emailAddresses: user.emailAddresses.map((email) => ({
      id: email.id,
      emailAddress: email.emailAddress,
      verificationStatus: email.verification?.status ?? null,
    })),
  };
}

function readRedirectUrl(): string | undefined {
  const value = process.env.CLERK_INVITATION_REDIRECT_URL?.trim();
  return value ? value : undefined;
}

function buildClerkGateway(): ClerkGateway {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY is required for employee invitation onboarding');
  }

  const client = createClerkClient({ secretKey });
  const redirectUrl = readRedirectUrl();

  return {
    async createApplicationInvitation(input) {
      const invitation = await client.invitations.createInvitation({
        emailAddress: input.emailAddress,
        expiresInDays: input.expiresInDays,
        ignoreExisting: true,
        notify: true,
        publicMetadata: input.publicMetadata,
        ...(redirectUrl ? { redirectUrl } : {}),
      });

      return mapInvitation(invitation);
    },

    async revokeApplicationInvitation(invitationId) {
      const invitation = await client.invitations.revokeInvitation(invitationId);
      return mapInvitation(invitation);
    },

    async getUserById(clerkUserId) {
      const user = await client.users.getUser(clerkUserId);
      return mapUser(user);
    },

    async findUsersByEmail(emailAddress) {
      const response = await client.users.getUserList({
        emailAddress: [emailAddress],
        limit: 10,
      });

      return response.data.map(mapUser);
    },

    async updateUserPublicMetadata(clerkUserId, publicMetadata) {
      const user = await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata,
      });
      return mapUser(user);
    },
  };
}

let defaultClerkGateway: ClerkGateway | null = null;

export function getClerkGateway(): ClerkGateway {
  if (!defaultClerkGateway) {
    defaultClerkGateway = buildClerkGateway();
  }

  return defaultClerkGateway;
}
