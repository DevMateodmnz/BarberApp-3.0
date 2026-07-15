export const CUSTOMER_SEARCH_DEBOUNCE_MS = 400;

export interface CustomerSearchScheduler {
  cancel: () => void;
  schedule: (query: string, callback: (query: string) => void) => void;
}

export function createCustomerSearchScheduler(
  delayMs = CUSTOMER_SEARCH_DEBOUNCE_MS
): CustomerSearchScheduler {
  let handle: ReturnType<typeof setTimeout> | null = null;

  return {
    cancel() {
      if (handle) {
        clearTimeout(handle);
        handle = null;
      }
    },
    schedule(query, callback) {
      if (handle) {
        clearTimeout(handle);
      }

      handle = setTimeout(() => {
        handle = null;
        callback(query);
      }, delayMs);
    },
  };
}
