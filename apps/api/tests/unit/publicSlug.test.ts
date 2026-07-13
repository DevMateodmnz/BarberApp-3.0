import { describe, expect, it } from 'vitest';
import {
  assertValidPublicSlug,
  isReservedPublicSlug,
  normalizePublicSlug,
  validatePublicSlug,
} from '../../src/lib/publicSlug.js';

describe('publicSlug', () => {
  describe('validatePublicSlug', () => {
    it('accepts canonical public slugs', () => {
      const validSlugs = [
        'barberup',
        'barberia-central',
        'corte-10',
        'los-primos-2',
      ];

      for (const slug of validSlugs) {
        expect(validatePublicSlug(slug)).toEqual({ success: true });
        expect(() => assertValidPublicSlug(slug)).not.toThrow();
      }
    });

    it('rejects slugs shorter than three characters or longer than fifty', () => {
      expect(validatePublicSlug('ab')).toEqual({
        success: false,
        reason: 'length',
      });
      expect(validatePublicSlug('a'.repeat(51))).toEqual({
        success: false,
        reason: 'length',
      });
    });

    it('rejects invalid characters and separators', () => {
      expect(validatePublicSlug('barberia_central')).toEqual({
        success: false,
        reason: 'format',
      });
      expect(validatePublicSlug('barberia--central')).toEqual({
        success: false,
        reason: 'format',
      });
      expect(validatePublicSlug('barbería')).toEqual({
        success: false,
        reason: 'format',
      });
    });

    it('rejects leading or trailing hyphens', () => {
      expect(validatePublicSlug('-barberia')).toEqual({
        success: false,
        reason: 'format',
      });
      expect(validatePublicSlug('barberia-')).toEqual({
        success: false,
        reason: 'format',
      });
    });

    it('rejects reserved slugs independently of uniqueness', () => {
      expect(isReservedPublicSlug('api')).toBe(true);
      expect(isReservedPublicSlug('barberias')).toBe(true);
      expect(validatePublicSlug('api')).toEqual({
        success: false,
        reason: 'reserved',
      });
      expect(validatePublicSlug('barberias')).toEqual({
        success: false,
        reason: 'reserved',
      });
    });
  });

  describe('normalizePublicSlug', () => {
    it('normalizes uppercase and whitespace into lowercase hyphenated output', () => {
      expect(normalizePublicSlug('  Los Primos  ')).toBe('los-primos');
      expect(normalizePublicSlug('Barbería Central')).toBe(
        'barberia-central'
      );
    });

    it('removes Spanish diacritics and punctuation safely', () => {
      expect(normalizePublicSlug('José & Hijos')).toBe('jose-hijos');
      expect(normalizePublicSlug('Corte---Premium')).toBe('corte-premium');
    });

    it('is deterministic for equivalent inputs', () => {
      const variants = [
        'Barbería Central',
        'barberia central',
        ' BARBERIA-CENTRAL ',
      ];

      const normalized = variants.map((value) => normalizePublicSlug(value));
      expect(normalized).toEqual([
        'barberia-central',
        'barberia-central',
        'barberia-central',
      ]);
    });

    it('rejects empty or punctuation-only input after normalization', () => {
      expect(() => normalizePublicSlug('   ')).toThrow(/public slug/i);
      expect(() => normalizePublicSlug('!!!')).toThrow(/public slug/i);
    });

    it('rejects an overlong normalized slug instead of truncating it', () => {
      const overlong = `${'a'.repeat(30)} ${'b'.repeat(30)}`;
      expect(() => normalizePublicSlug(overlong)).toThrow(/50/i);
    });
  });
});
