import { describe, expect, it } from 'vitest';
import {
  createPublicBookingPolicy,
  getPublicBookingPolicy,
  validatePublicBookingPolicy,
} from '../../src/lib/publicBookingPolicy.js';

describe('publicBookingPolicy', () => {
  it('returns the approved server defaults', () => {
    expect(getPublicBookingPolicy()).toEqual({
      minimumNoticeMinutes: 60,
      maximumBookingHorizonDays: 30,
      slotIntervalMinutes: 30,
    });
  });

  it('creates a typed valid policy override when values remain possible', () => {
    const policy = createPublicBookingPolicy({
      minimumNoticeMinutes: 90,
      maximumBookingHorizonDays: 45,
      slotIntervalMinutes: 15,
    });

    expect(policy.minimumNoticeMinutes).toBe(90);
    expect(policy.maximumBookingHorizonDays).toBe(45);
    expect(policy.slotIntervalMinutes).toBe(15);
  });

  it('validates the default policy object successfully', () => {
    expect(() =>
      validatePublicBookingPolicy({
        minimumNoticeMinutes: 60,
        maximumBookingHorizonDays: 30,
        slotIntervalMinutes: 30,
      })
    ).not.toThrow();
  });

  it('rejects impossible policy values', () => {
    expect(() =>
      createPublicBookingPolicy({ minimumNoticeMinutes: 0 })
    ).toThrow(/minimum notice/i);
    expect(() =>
      createPublicBookingPolicy({ maximumBookingHorizonDays: 0 })
    ).toThrow(/horizon/i);
    expect(() =>
      createPublicBookingPolicy({ slotIntervalMinutes: 7 })
    ).toThrow(/slot interval/i);
  });
});
