/**
 * Unit tests for the appointment lifecycle helper.
 *
 * This module is the single source of truth for translating an appointment
 * status change into the matching timestamp + actor persistence payload.
 * If these tests are wrong, every transition and every customer insight
 * derived from `startedAt` / `confirmedAt` / `completedAt` / `cancelledAt` /
 * `noShowAt` will be wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  buildLifecycleUpdateForStatus,
  buildLifecycleUpdateForCancel,
  isTerminalStatus,
  isRecordedTransition,
} from '../../src/lib/appointmentLifecycle.js';

const NOW = new Date('2026-07-15T13:30:00.000Z');

describe('buildLifecycleUpdateForStatus', () => {
  it('stamps confirmedAt when transitioning to CONFIRMED', () => {
    const update = buildLifecycleUpdateForStatus('CONFIRMED', 'OWNER', NOW);
    expect(update.confirmedAt).toEqual(NOW);
    expect(update.startedAt).toBeUndefined();
    expect(update.completedAt).toBeUndefined();
    expect(update.cancelledAt).toBeUndefined();
    expect(update.noShowAt).toBeUndefined();
  });

  it('stamps startedAt when transitioning to IN_PROGRESS', () => {
    const update = buildLifecycleUpdateForStatus('IN_PROGRESS', 'BARBER', NOW);
    expect(update.startedAt).toEqual(NOW);
    expect(update.confirmedAt).toBeUndefined();
    expect(update.completedAt).toBeUndefined();
  });

  it('stamps completedAt when transitioning to COMPLETED', () => {
    const update = buildLifecycleUpdateForStatus('COMPLETED', 'BARBER', NOW);
    expect(update.completedAt).toEqual(NOW);
    expect(update.startedAt).toBeUndefined();
  });

  it('stamps noShowAt when transitioning to NO_SHOW', () => {
    const update = buildLifecycleUpdateForStatus('NO_SHOW', 'OWNER', NOW);
    expect(update.noShowAt).toEqual(NOW);
    expect(update.cancelledAt).toBeUndefined();
  });

  it('does not stamp anything when transitioning to PENDING (re-open)', () => {
    const update = buildLifecycleUpdateForStatus('PENDING', 'OWNER', NOW);
    expect(update).toEqual({});
  });

  it('does not stamp anything when transitioning to CANCELLED (use buildLifecycleUpdateForCancel instead)', () => {
    const update = buildLifecycleUpdateForStatus('CANCELLED', 'OWNER', NOW);
    expect(update).toEqual({});
  });

  it('defaults to the current wall clock when no `now` is provided', () => {
    const before = new Date();
    const update = buildLifecycleUpdateForStatus('CONFIRMED', 'OWNER');
    const after = new Date();
    expect(update.confirmedAt).toBeInstanceOf(Date);
    const stamped = update.confirmedAt as Date;
    expect(stamped.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(stamped.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('buildLifecycleUpdateForCancel', () => {
  it('stamps cancelledAt, cancelledByRole, and cancelReason for staff cancel', () => {
    const update = buildLifecycleUpdateForCancel('OWNER', NOW, 'Cliente no respondió');
    expect(update.cancelledAt).toEqual(NOW);
    expect(update.cancelledByRole).toBe('OWNER');
    expect(update.cancelReason).toBe('Cliente no respondió');
  });

  it('records CLIENT as the actor for anonymous/public cancellations', () => {
    const update = buildLifecycleUpdateForCancel('CLIENT', NOW, 'Cambio de planes');
    expect(update.cancelledByRole).toBe('CLIENT');
    expect(update.cancelReason).toBe('Cambio de planes');
  });

  it('normalizes a missing reason to NULL rather than empty string', () => {
    const update = buildLifecycleUpdateForCancel('OWNER', NOW);
    expect(update.cancelReason).toBeNull();
  });

  it('trims and clamps reason to 500 characters', () => {
    const longReason = `${'x'.repeat(550)}`;
    const update = buildLifecycleUpdateForCancel(
      'BARBER',
      NOW,
      `   ${longReason}   `
    );
    expect(update.cancelReason).toHaveLength(500);
    expect(update.cancelReason?.startsWith('x')).toBe(true);
  });
});

describe('isTerminalStatus', () => {
  it('returns true for terminal states', () => {
    expect(isTerminalStatus('CANCELLED')).toBe(true);
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('NO_SHOW')).toBe(true);
  });

  it('returns false for active states', () => {
    expect(isTerminalStatus('PENDING')).toBe(false);
    expect(isTerminalStatus('CONFIRMED')).toBe(false);
    expect(isTerminalStatus('IN_PROGRESS')).toBe(false);
  });
});

describe('isRecordedTransition', () => {
  it('returns true for transitions that produce a recorded timestamp', () => {
    expect(isRecordedTransition('CONFIRMED')).toBe(true);
    expect(isRecordedTransition('IN_PROGRESS')).toBe(true);
    expect(isRecordedTransition('COMPLETED')).toBe(true);
    expect(isRecordedTransition('NO_SHOW')).toBe(true);
  });

  it('returns false for PENDING (re-open) and CANCELLED (handled by cancel helper)', () => {
    expect(isRecordedTransition('PENDING')).toBe(false);
    expect(isRecordedTransition('CANCELLED')).toBe(false);
  });
});
