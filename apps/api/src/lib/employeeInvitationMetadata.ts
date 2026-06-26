export const EMPLOYEE_INVITATION_METADATA_SOURCE = 'employee_invitation';

export interface EmployeeInvitationMetadata extends Record<string, unknown> {
  role: 'BARBER';
  employeeInvitationId: string;
  roleSource: typeof EMPLOYEE_INVITATION_METADATA_SOURCE;
}

export function buildEmployeeInvitationMetadata(
  employeeInvitationId: string
): EmployeeInvitationMetadata {
  return {
    role: 'BARBER',
    employeeInvitationId,
    roleSource: EMPLOYEE_INVITATION_METADATA_SOURCE,
  };
}

export function parseTrustedEmployeeInvitationMetadata(
  publicMetadata: unknown
): EmployeeInvitationMetadata | null {
  if (!publicMetadata || typeof publicMetadata !== 'object' || Array.isArray(publicMetadata)) {
    return null;
  }

  const metadata = publicMetadata as Record<string, unknown>;

  if (
    metadata.role === 'BARBER' &&
    typeof metadata.employeeInvitationId === 'string' &&
    metadata.employeeInvitationId.length > 0 &&
    metadata.roleSource === EMPLOYEE_INVITATION_METADATA_SOURCE
  ) {
    return {
      role: 'BARBER',
      employeeInvitationId: metadata.employeeInvitationId,
      roleSource: EMPLOYEE_INVITATION_METADATA_SOURCE,
    };
  }

  return null;
}

export function getClerkMetadataRole(publicMetadata: unknown): string | null {
  if (!publicMetadata || typeof publicMetadata !== 'object' || Array.isArray(publicMetadata)) {
    return null;
  }

  const role = (publicMetadata as Record<string, unknown>).role;
  return typeof role === 'string' ? role : null;
}
