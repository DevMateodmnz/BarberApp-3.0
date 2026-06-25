/**
 * Unit tests for service form validation helper — PR-053A
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { validateServiceForm } from '../../src/lib/serviceForm.js';
import { mobileLocalizationRuntime } from '../../src/i18n/runtime.js';

beforeEach(async () => {
  await mobileLocalizationRuntime.bootstrap();
  await mobileLocalizationRuntime.setPreference('en');
});

describe('validateServiceForm', () => {
  it('valid input returns ok true with trimmed name', () => {
    const result = validateServiceForm({
      name: '  Classic Cut  ',
      priceInput: '5000',
      durationInput: '30',
      description: '',
    });
    expect(result).toEqual({
      ok: true,
      payload: { name: 'Classic Cut', priceCents: 500000, durationMinutes: 30 },
    });
  });

  it('valid decimal price (dot) returns integer priceCents', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000.50',
      durationInput: '45',
      description: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.priceCents).toBe(500050);
      expect(result.payload.durationMinutes).toBe(45);
    }
  });

  it('valid comma price returns integer priceCents', () => {
    const result = validateServiceForm({
      name: 'Trim',
      priceInput: '5000,50',
      durationInput: '60',
      description: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.priceCents).toBe(500050);
    }
  });

  it('empty name returns ok false', () => {
    const result = validateServiceForm({
      name: '',
      priceInput: '5000',
      durationInput: '30',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Service name is required.' });
  });

  it('whitespace-only name returns ok false', () => {
    const result = validateServiceForm({
      name: '   ',
      priceInput: '5000',
      durationInput: '30',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Service name is required.' });
  });

  it('invalid price returns ok false', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: 'abc',
      durationInput: '30',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid amount.' });
  });

  it('negative price returns ok false', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '-1',
      durationInput: '30',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid amount.' });
  });

  it('duration zero returns ok false', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: '0',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid duration in minutes.' });
  });

  it('duration negative returns ok false', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: '-5',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid duration in minutes.' });
  });

  it('duration decimal returns ok false', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: '30.5',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid duration in minutes.' });
  });

  it('duration non-numeric returns ok false', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: 'abc',
      description: '',
    });
    expect(result).toEqual({ ok: false, error: 'Enter a valid duration in minutes.' });
  });

  it('blank description is omitted from payload', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: '30',
      description: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).not.toHaveProperty('description');
    }
  });

  it('whitespace-only description is omitted from payload', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: '30',
      description: '   ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).not.toHaveProperty('description');
    }
  });

  it('non-blank description is trimmed and included', () => {
    const result = validateServiceForm({
      name: 'Cut',
      priceInput: '5000',
      durationInput: '30',
      description: '  Scissors and clippers  ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.description).toBe('Scissors and clippers');
    }
  });
});
