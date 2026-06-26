import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/api.js';
import {
  EMPLOYEE_INVITATION_EMAIL_MAX_LENGTH,
  classifyEmployeeInvitationBootstrapStatus,
  getAcceptedEmployeeInvitations,
  getEmployeeInvitationDisplayEmail,
  getExpiredEmployeeInvitations,
  getFailedEmployeeInvitations,
  getPendingEmployeeInvitations,
  getRevokedEmployeeInvitations,
  isEmployeeInvitationActionable,
  isEmployeeInvitationRevokeAllowed,
  isEmployeeInvitationResendAllowed,
  isEmployeeInvitationStatus,
  isImmediateEmployeeInvitationOutcome,
  isPendingEmployeeInvitationOutcome,
  mapEmployeeInvitationApiError,
  mergeEmployeeInvitations,
  normalizeEmployeeInvitationEmail,
  sortEmployeeInvitations,
  upsertEmployeeInvitation,
  validateEmployeeInvitationEmail,
} from '../../src/lib/employeeInvitationDomain.js';
import type {
  EmployeeInvitation,
  EmployeeInvitationCreateOutcome,
} from '../../src/lib/types.js';

function makeInvitation(
  overrides: Partial<EmployeeInvitation> = {},
): EmployeeInvitation {
  return {
    id: 'inv-1',
    email: 'barber@example.com',
    invitedRole: 'BARBER',
    status: 'PENDING',
    expiresAt: '2026-07-01T00:00:00.000Z',
    lastSentAt: '2026-06-26T00:00:00.000Z',
    resendCount: 0,
    acceptedAt: null,
    revokedAt: null,
    userId: null,
    employeeId: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  };
}

function makeOutcome(
  outcome: EmployeeInvitationCreateOutcome['outcome'],
): EmployeeInvitationCreateOutcome {
  if (outcome === 'employee_created' || outcome === 'employee_reactivated') {
    return {
      outcome,
      employee: {
        id: 'emp-1',
        barbershopId: 'shop-1',
        userId: 'user-1',
        isActive: true,
        createdAt: '2026-06-26T00:00:00.000Z',
        updatedAt: '2026-06-26T00:00:00.000Z',
        user: {
          id: 'user-1',
          email: 'barber@example.com',
          name: 'Barber',
          role: 'BARBER',
        },
      },
      invitation: null,
    };
  }

  return {
    outcome,
    employee: null,
    invitation: makeInvitation(),
  };
}

describe('employeeInvitationDomain validation', () => {
  it('normalizes email input', () => {
    expect(normalizeEmployeeInvitationEmail('  BARBER@Example.COM  ')).toBe(
      'barber@example.com',
    );
  });

  it('rejects empty, whitespace-only, and invalid emails with semantic keys', () => {
    expect(validateEmployeeInvitationEmail('').fieldErrors.email).toBe('emailRequired');
    expect(validateEmployeeInvitationEmail('   ').fieldErrors.email).toBe('emailRequired');
    expect(validateEmployeeInvitationEmail('bad-email').fieldErrors.email).toBe('emailInvalid');
  });

  it('matches the committed backend schema by not enforcing a stricter max length', () => {
    expect(EMPLOYEE_INVITATION_EMAIL_MAX_LENGTH).toBeNull();
    const longEmail = `${'x'.repeat(400)}@example.com`;
    const result = validateEmployeeInvitationEmail(longEmail);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedEmail).toBe(longEmail);
    }
  });
});

describe('employeeInvitationDomain semantic error mapping', () => {
  it('maps committed API codes and network failures to semantic keys', () => {
    expect(
      mapEmployeeInvitationApiError(
        new ApiError('active', 'EMPLOYEE_ALREADY_ACTIVE', 409),
      ),
    ).toBe('employeeAlreadyActive');
    expect(
      mapEmployeeInvitationApiError(
        new ApiError('eligible', 'USER_ROLE_NOT_ELIGIBLE', 409),
      ),
    ).toBe('userRoleNotEligible');
    expect(
      mapEmployeeInvitationApiError(
        new ApiError('pending invite required', 'ONBOARDING_INVITATION_REQUIRED', 409),
      ),
    ).toBe('onboardingInvitationRequired');
    expect(
      mapEmployeeInvitationApiError(
        new ApiError('ambiguous', 'AMBIGUOUS_EMPLOYEE_INVITATION', 409),
      ),
    ).toBe('ambiguousInvitation');
    expect(mapEmployeeInvitationApiError(new Error('Network Error'))).toBe('networkError');
    expect(mapEmployeeInvitationApiError(new Error('boom'))).toBe('unknownServerError');
  });

  it('classifies bootstrap-only semantic outcomes', () => {
    expect(
      classifyEmployeeInvitationBootstrapStatus('onboardingInvitationRequired'),
    ).toBe('onboarding_required');
    expect(classifyEmployeeInvitationBootstrapStatus('userRoleNotEligible')).toBe(
      'terminal_error',
    );
    expect(classifyEmployeeInvitationBootstrapStatus('networkError')).toBe(
      'retryable_error',
    );
  });
});

describe('employeeInvitationDomain selectors and helpers', () => {
  const invitations = [
    makeInvitation({ id: 'pending', status: 'PENDING', updatedAt: '2026-06-26T03:00:00.000Z' }),
    makeInvitation({ id: 'failed', status: 'DELIVERY_FAILED', updatedAt: '2026-06-26T02:00:00.000Z' }),
    makeInvitation({ id: 'expired', status: 'EXPIRED', updatedAt: '2026-06-26T01:00:00.000Z' }),
    makeInvitation({ id: 'revoked', status: 'REVOKED', updatedAt: '2026-06-26T00:30:00.000Z' }),
    makeInvitation({ id: 'accepted', status: 'ACCEPTED', updatedAt: '2026-06-26T00:00:00.000Z' }),
  ];

  it('sorts and merges invitations without duplicates', () => {
    expect(sortEmployeeInvitations(invitations).map((invitation) => invitation.id)).toEqual([
      'pending',
      'failed',
      'expired',
      'revoked',
      'accepted',
    ]);

    expect(
      mergeEmployeeInvitations([
        ...invitations,
        makeInvitation({ id: 'pending', status: 'DELIVERY_FAILED' }),
      ]),
    ).toHaveLength(5);
  });

  it('upserts invitations and exposes status selectors', () => {
    const updated = upsertEmployeeInvitation(
      invitations,
      makeInvitation({ id: 'pending', status: 'DELIVERY_FAILED' }),
    );
    expect(updated.find((invitation) => invitation.id === 'pending')?.status).toBe(
      'DELIVERY_FAILED',
    );
    expect(getPendingEmployeeInvitations(invitations)).toHaveLength(1);
    expect(getFailedEmployeeInvitations(invitations)).toHaveLength(1);
    expect(getExpiredEmployeeInvitations(invitations)).toHaveLength(1);
    expect(getRevokedEmployeeInvitations(invitations)).toHaveLength(1);
    expect(getAcceptedEmployeeInvitations(invitations)).toHaveLength(1);
  });

  it('derives resend/revoke/actionable flags and safe display email', () => {
    expect(isEmployeeInvitationResendAllowed(makeInvitation({ status: 'PENDING' }))).toBe(true);
    expect(isEmployeeInvitationResendAllowed(makeInvitation({ status: 'ACCEPTED' }))).toBe(false);
    expect(isEmployeeInvitationRevokeAllowed(makeInvitation({ status: 'REVOKED' }))).toBe(false);
    expect(isEmployeeInvitationActionable(makeInvitation({ status: 'EXPIRED' }))).toBe(true);
    expect(getEmployeeInvitationDisplayEmail(makeInvitation())).toBe('barber@example.com');
    expect(isEmployeeInvitationStatus('DELIVERY_FAILED')).toBe(true);
    expect(isEmployeeInvitationStatus('UNKNOWN_STATUS')).toBe(false);
  });

  it('distinguishes immediate employee outcomes from pending invitation outcomes', () => {
    expect(isImmediateEmployeeInvitationOutcome(makeOutcome('employee_created'))).toBe(true);
    expect(isImmediateEmployeeInvitationOutcome(makeOutcome('employee_reactivated'))).toBe(true);
    expect(isImmediateEmployeeInvitationOutcome(makeOutcome('invitation_created'))).toBe(false);
    expect(isPendingEmployeeInvitationOutcome(makeOutcome('invitation_created'))).toBe(true);
    expect(isPendingEmployeeInvitationOutcome(makeOutcome('invitation_pending'))).toBe(true);
    expect(isPendingEmployeeInvitationOutcome(makeOutcome('employee_created'))).toBe(false);
  });
});
