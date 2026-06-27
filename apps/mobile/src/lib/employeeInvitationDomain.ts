import { ApiError } from './api.js';
import type {
  EmployeeInvitation,
  EmployeeInvitationCreateOutcome,
  EmployeeInvitationStatus,
} from './types.js';

/**
 * The committed Batch 1 backend schema currently applies no explicit max email
 * length beyond zod's `.email()` validation, so mobile must not enforce a
 * stricter length limit yet.
 */
export const EMPLOYEE_INVITATION_EMAIL_MAX_LENGTH: number | null = null;

export type EmployeeInvitationField = 'email';

export type EmployeeInvitationValidationKey =
  | 'emailRequired'
  | 'emailInvalid'
  | 'emailTooLong';

export type EmployeeInvitationErrorKey =
  | 'authenticationRequired'
  | 'barbershopAccessDenied'
  | 'employeeAlreadyActive'
  | 'userRoleNotEligible'
  | 'invitationNotFound'
  | 'invitationAlreadyAccepted'
  | 'invitationRevoked'
  | 'invitationExpired'
  | 'invitationDeliveryFailed'
  | 'invitationRateLimited'
  | 'ambiguousInvitation'
  | 'onboardingInvitationRequired'
  | 'invalidInvitationFields'
  | 'networkError'
  | 'unknownServerError';

export type EmployeeInvitationLoadStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error';

export type EmployeeInvitationMutationStatus =
  | 'idle'
  | 'creating'
  | 'resending'
  | 'revoking';

export type EmployeeInvitationBootstrapStatus =
  | 'idle'
  | 'reconciling'
  | 'ready'
  | 'onboarding_required'
  | 'retryable_error'
  | 'terminal_error';

export type EmployeeInvitationBootstrapSuccessOutcome =
  | 'ready'
  | 'reconciled'
  | 'already_reconciled';

export type EmployeeInvitationValidationResult =
  | {
      ok: true;
      normalizedEmail: string;
      fieldErrors: Record<string, never>;
    }
  | {
      ok: false;
      fieldErrors: Partial<Record<EmployeeInvitationField, EmployeeInvitationValidationKey>>;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function compareIsoDateDesc(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

function lowerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  if (typeof error === 'string') {
    return error.toLowerCase();
  }

  return '';
}

export function normalizeEmployeeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmployeeInvitationEmail(
  value: string
): EmployeeInvitationValidationResult {
  const normalizedEmail = normalizeEmployeeInvitationEmail(value);

  if (!normalizedEmail) {
    return {
      ok: false,
      fieldErrors: { email: 'emailRequired' },
    };
  }

  if (
    EMPLOYEE_INVITATION_EMAIL_MAX_LENGTH !== null
    && normalizedEmail.length > EMPLOYEE_INVITATION_EMAIL_MAX_LENGTH
  ) {
    return {
      ok: false,
      fieldErrors: { email: 'emailTooLong' },
    };
  }

  if (!EMAIL_RE.test(normalizedEmail)) {
    return {
      ok: false,
      fieldErrors: { email: 'emailInvalid' },
    };
  }

  return {
    ok: true,
    normalizedEmail,
    fieldErrors: {},
  };
}

export function mapEmployeeInvitationApiError(
  error: unknown
): EmployeeInvitationErrorKey {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return 'authenticationRequired';
      case 'FORBIDDEN':
        return 'barbershopAccessDenied';
      case 'EMPLOYEE_ALREADY_ACTIVE':
        return 'employeeAlreadyActive';
      case 'USER_ROLE_NOT_ELIGIBLE':
        return 'userRoleNotEligible';
      case 'EMPLOYEE_INVITATION_NOT_FOUND':
      case 'NOT_FOUND':
        return 'invitationNotFound';
      case 'EMPLOYEE_INVITATION_ACCEPTED':
        return 'invitationAlreadyAccepted';
      case 'EMPLOYEE_INVITATION_REVOKED':
        return 'invitationRevoked';
      case 'EMPLOYEE_INVITATION_EXPIRED':
        return 'invitationExpired';
      case 'EMPLOYEE_INVITATION_DELIVERY_FAILED':
        return 'invitationDeliveryFailed';
      case 'EMPLOYEE_INVITATION_RATE_LIMITED':
      case 'RATE_LIMITED':
        return 'invitationRateLimited';
      case 'AMBIGUOUS_EMPLOYEE_INVITATION':
        return 'ambiguousInvitation';
      case 'ONBOARDING_INVITATION_REQUIRED':
        return 'onboardingInvitationRequired';
      case 'VALIDATION_ERROR':
        return 'invalidInvitationFields';
      default:
        break;
    }

    if (error.status === 401) {
      return 'authenticationRequired';
    }

    if (error.status === 403) {
      return 'barbershopAccessDenied';
    }

    if (error.status === 404) {
      return 'invitationNotFound';
    }

    if (error.status === 429) {
      return 'invitationRateLimited';
    }

    if (error.status === 400) {
      return 'invalidInvitationFields';
    }
  }

  const lowerMessage = lowerErrorMessage(error);
  if (
    lowerMessage.includes('network error')
    || lowerMessage.includes('timeout')
    || lowerMessage.includes('failed to fetch')
  ) {
    return 'networkError';
  }

  return 'unknownServerError';
}

export function classifyEmployeeInvitationBootstrapStatus(
  errorKey: EmployeeInvitationErrorKey
): EmployeeInvitationBootstrapStatus {
  if (errorKey === 'onboardingInvitationRequired') {
    return 'onboarding_required';
  }

  if (errorKey === 'userRoleNotEligible') {
    return 'terminal_error';
  }

  return 'retryable_error';
}

export function sortEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  return [...invitations].sort((left, right) => {
    const updatedOrder = compareIsoDateDesc(left.updatedAt, right.updatedAt);
    if (updatedOrder !== 0) {
      return updatedOrder;
    }

    return compareIsoDateDesc(left.createdAt, right.createdAt);
  });
}

export function upsertEmployeeInvitation(
  invitations: readonly EmployeeInvitation[],
  invitation: EmployeeInvitation
): EmployeeInvitation[] {
  const next = invitations.filter((current) => current.id !== invitation.id);
  next.push(invitation);
  return sortEmployeeInvitations(next);
}

export function mergeEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  const byId = new Map<string, EmployeeInvitation>();
  for (const invitation of invitations) {
    byId.set(invitation.id, invitation);
  }

  return sortEmployeeInvitations(Array.from(byId.values()));
}

export function getPendingEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  return invitations.filter((invitation) => invitation.status === 'PENDING');
}

export function getFailedEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  return invitations.filter((invitation) => invitation.status === 'DELIVERY_FAILED');
}

export function getExpiredEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  return invitations.filter((invitation) => invitation.status === 'EXPIRED');
}

export function getRevokedEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  return invitations.filter((invitation) => invitation.status === 'REVOKED');
}

export function getAcceptedEmployeeInvitations(
  invitations: readonly EmployeeInvitation[]
): EmployeeInvitation[] {
  return invitations.filter((invitation) => invitation.status === 'ACCEPTED');
}

export function isEmployeeInvitationResendAllowed(
  invitation: EmployeeInvitation | Pick<EmployeeInvitation, 'status'>
): boolean {
  return (
    invitation.status === 'PENDING'
    || invitation.status === 'EXPIRED'
    || invitation.status === 'DELIVERY_FAILED'
    || invitation.status === 'REVOKED'
  );
}

export function isEmployeeInvitationRevokeAllowed(
  invitation: EmployeeInvitation | Pick<EmployeeInvitation, 'status'>
): boolean {
  return invitation.status !== 'ACCEPTED' && invitation.status !== 'REVOKED';
}

export function isEmployeeInvitationActionable(
  invitation: EmployeeInvitation | Pick<EmployeeInvitation, 'status'>
): boolean {
  return (
    isEmployeeInvitationResendAllowed(invitation)
    || isEmployeeInvitationRevokeAllowed(invitation)
  );
}

export function getEmployeeInvitationDisplayEmail(
  invitation: EmployeeInvitation | Pick<EmployeeInvitation, 'email'>
): string {
  return invitation.email;
}

export function isImmediateEmployeeInvitationOutcome(
  outcome: EmployeeInvitationCreateOutcome
): outcome is Extract<
  EmployeeInvitationCreateOutcome,
  { outcome: 'employee_created' | 'employee_reactivated' }
> {
  return (
    outcome.outcome === 'employee_created'
    || outcome.outcome === 'employee_reactivated'
  );
}

export function isPendingEmployeeInvitationOutcome(
  outcome: EmployeeInvitationCreateOutcome
): outcome is Extract<
  EmployeeInvitationCreateOutcome,
  { outcome: 'invitation_created' | 'invitation_pending' }
> {
  return (
    outcome.outcome === 'invitation_created'
    || outcome.outcome === 'invitation_pending'
  );
}

export function isEmployeeInvitationStatus(
  value: string
): value is EmployeeInvitationStatus {
  return [
    'PENDING',
    'ACCEPTED',
    'REVOKED',
    'EXPIRED',
    'DELIVERY_FAILED',
  ].includes(value);
}
