import { describe, expect, it } from 'vitest';
import {
  normalizePublicBookingClientName,
  normalizePublicBookingNotes,
} from '../../src/lib/publicBookingInput.js';

describe('publicBookingInput', () => {
  it('trims and preserves valid Unicode client names', () => {
    expect(normalizePublicBookingClientName('  Mateo Domínguez  ')).toBe(
      'Mateo Domínguez'
    );
    expect(normalizePublicBookingClientName('María-José Ñúñez')).toBe(
      'María-José Ñúñez'
    );
  });

  it('rejects blank or control-character client names', () => {
    expect(() => normalizePublicBookingClientName('   ')).toThrow(/name/i);
    expect(() => normalizePublicBookingClientName('Mateo\nDomínguez')).toThrow(
      /name/i
    );
  });

  it('normalizes notes and converts empty strings to null', () => {
    expect(normalizePublicBookingNotes(undefined)).toBeNull();
    expect(normalizePublicBookingNotes('   ')).toBeNull();
    expect(normalizePublicBookingNotes('  Prefiere tijera  ')).toBe(
      'Prefiere tijera'
    );
  });
});
