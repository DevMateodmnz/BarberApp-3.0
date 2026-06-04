/**
 * Shared package test - validates test infrastructure works
 */

import { describe, it, expect } from 'vitest';
import { RoleValues, type UserRole } from '../../src/index';

describe('Shared Package', () => {
  it('should export RoleValues', () => {
    expect(RoleValues).toEqual(['OWNER', 'BARBER', 'CLIENT']);
  });

  it('should support type exports', () => {
    const role: UserRole = 'OWNER';
    expect(role).toBe('OWNER');
  });
});
