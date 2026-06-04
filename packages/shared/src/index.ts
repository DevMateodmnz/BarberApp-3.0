/**
 * Shared types for BarberApp
 * Phase 1: Minimal placeholder for type checking validation
 */

// User roles
export type UserRole = 'OWNER' | 'BARBER' | 'CLIENT';

// API response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

// Placeholder for schema validation - will be expanded in Phase 2
export const RoleValues = ['OWNER', 'BARBER', 'CLIENT'] as const;
