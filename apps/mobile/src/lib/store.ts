/**
 * Context store — Zustand store for current user context.
 *
 * Manages loading state, error state, and the context data itself.
 * Used by the Home screen and role-based navigation logic.
 */
import { create } from 'zustand';
import { fetchCurrentUserContext } from './context.js';
import type { CurrentUserContext } from './types.js';

interface ContextState {
  context: CurrentUserContext | null;
  isLoading: boolean;
  error: string | null;

  /** Fetches user context from the backend and updates the store. */
  loadContext: (getToken: () => Promise<string | null>) => Promise<void>;
  /** Resets the store to initial state. */
  clearContext: () => void;
}

/**
 * Zustand store for authenticated user context.
 *
 * Usage in a React component:
 *   const { context, isLoading, error, loadContext } = useContextStore();
 *
 * Or outside React:
 *   useContextStore.getState().loadContext(getToken);
 */
export const useContextStore = create<ContextState>((set, get) => ({
  context: null,
  isLoading: false,
  error: null,

  loadContext: async (getToken) => {
    // Re-entrancy guard: prevent concurrent duplicate calls.
    // Clerk Expo's useAuth can trigger multiple effect runs during auth
    // transitions, and without this guard loadContext would be called
    // more than once concurrently.
    if (get().isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const context = await fetchCurrentUserContext(getToken);
      set({ context, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ context: null, isLoading: false, error: message });
    }
  },

  clearContext: () => {
    set({ context: null, isLoading: false, error: null });
  },
}));