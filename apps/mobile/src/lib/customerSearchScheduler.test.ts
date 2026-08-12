import { describe, expect, it, vi } from 'vitest';

import {
  createCustomerSearchScheduler,
  CUSTOMER_SEARCH_DEBOUNCE_MS,
} from '@/lib/customerSearchScheduler.js';

describe('createCustomerSearchScheduler', () => {
  it('debounces repeated queries and only emits the latest one', () => {
    vi.useFakeTimers();
    const scheduler = createCustomerSearchScheduler(CUSTOMER_SEARCH_DEBOUNCE_MS);
    const callback = vi.fn();

    scheduler.schedule('ju', callback);
    scheduler.schedule('juan', callback);

    vi.advanceTimersByTime(CUSTOMER_SEARCH_DEBOUNCE_MS - 1);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('juan');

    vi.useRealTimers();
  });

  it('cancels a pending search before it fires', () => {
    vi.useFakeTimers();
    const scheduler = createCustomerSearchScheduler(200);
    const callback = vi.fn();

    scheduler.schedule('ana', callback);
    scheduler.cancel();
    vi.advanceTimersByTime(200);

    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
