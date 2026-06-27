/**
 * Context store — Zustand store for current user context.
 *
 * Manages loading state, error state, reconciliation bootstrap state, and the
 * context data itself. Used by the Home screen and role-based navigation logic.
 */
import { create } from 'zustand';
import { translate } from '@/i18n/helpers.js';
import {
  classifyEmployeeInvitationBootstrapStatus,
  mapEmployeeInvitationApiError,
  type EmployeeInvitationBootstrapStatus,
  type EmployeeInvitationBootstrapSuccessOutcome,
  type EmployeeInvitationErrorKey,
} from './employeeInvitationDomain.js';
import { reconcileEmployeeInvitationOnboarding } from './employeeInvitations.js';
import { fetchCurrentUserContext } from './context.js';
import type { CurrentUserContext } from './types.js';

interface BootstrapAuthenticatedContextInput {
  clerkUserId: string;
  getToken: () => Promise<string | null>;
}

interface ContextState {
  context: CurrentUserContext | null;
  isLoading: boolean;
  error: string | null;
  bootstrapStatus: EmployeeInvitationBootstrapStatus;
  bootstrapErrorKey: EmployeeInvitationErrorKey | null;
  activeClerkUserId: string | null;
  lastBootstrapOutcome: EmployeeInvitationBootstrapSuccessOutcome | null;

  /** Fetches user context from the backend and updates the store. */
  loadContext: (getToken: () => Promise<string | null>) => Promise<void>;
  /**
   * Reconciles invitation onboarding first, then loads /me/context.
   * This is the authoritative signed-in bootstrap path.
   */
  bootstrapAuthenticatedContext: (
    input: BootstrapAuthenticatedContextInput
  ) => Promise<void>;
  /** Resets the store to initial state. */
  clearContext: () => void;
}

const defaultUnknownApiMessage = () => translate('errors.unknownApi');

/**
 * Zustand store for authenticated user context.
 *
 * Usage in a React component:
 *   const { context, isLoading, error, loadContext } = useContextStore();
 *
 * Or outside React:
 *   useContextStore.getState().loadContext(getToken);
 */
export const useContextStore = create<ContextState>((set, get) => {
  let sessionGeneration = 0;
  let contextRequestId = 0;
  let bootstrapPromise: Promise<void> | null = null;
  let bootstrapPromiseUserId: string | null = null;

  function isCurrentGeneration(generation: number): boolean {
    return generation === sessionGeneration;
  }

  function isCurrentClerkUser(
    generation: number,
    clerkUserId: string,
  ): boolean {
    return (
      isCurrentGeneration(generation)
      && get().activeClerkUserId === clerkUserId
    );
  }

  async function loadContextForCurrentSession(
    getToken: () => Promise<string | null>,
    options: {
      generation: number;
      requestId: number;
      clerkUserId: string | null;
      bootstrapOutcome: EmployeeInvitationBootstrapSuccessOutcome | null;
    },
  ): Promise<boolean> {
    try {
      const context = await fetchCurrentUserContext(getToken);
      if (
        !isCurrentGeneration(options.generation)
        || options.requestId !== contextRequestId
        || (
          options.clerkUserId !== null
          && !isCurrentClerkUser(options.generation, options.clerkUserId)
        )
      ) {
        return false;
      }

      set({
        context,
        isLoading: false,
        error: null,
        bootstrapStatus: 'ready',
        bootstrapErrorKey: null,
        lastBootstrapOutcome: options.bootstrapOutcome,
      });
      return true;
    } catch (err) {
      if (
        !isCurrentGeneration(options.generation)
        || options.requestId !== contextRequestId
        || (
          options.clerkUserId !== null
          && !isCurrentClerkUser(options.generation, options.clerkUserId)
        )
      ) {
        return false;
      }

      const errorKey = mapEmployeeInvitationApiError(err);
      const message = err instanceof Error ? err.message : defaultUnknownApiMessage();
      set({
        context: null,
        isLoading: false,
        error: message,
        bootstrapStatus:
          options.clerkUserId === null
            ? 'retryable_error'
            : classifyEmployeeInvitationBootstrapStatus(errorKey),
        bootstrapErrorKey: errorKey,
        lastBootstrapOutcome: null,
      });
      return false;
    }
  }

  return {
    context: null,
    isLoading: false,
    error: null,
    bootstrapStatus: 'idle',
    bootstrapErrorKey: null,
    activeClerkUserId: null,
    lastBootstrapOutcome: null,

    loadContext: async (getToken) => {
      const state = get();

      // ---- Stale-state recovery ----
      // Zustand stores survive Expo Go hot reloads and tab navigations.
      // If a previous render cycle called set({ isLoading: true }) but the
      // promise chain was severed (hot reload, crash, unmount before resolve),
      // the store is left with { isLoading: true, context: null, error: null }.
      //
      // Without this recovery, the re-entrancy guard below would see
      // isLoading: true and return, permanently blocking all future
      // loadContext calls — the app stays stuck on "Loading your context…".
      //
      // During the new invitation bootstrap path, `isLoading` + null context +
      // null error can also represent an active reconciliation request, so we
      // must not reset that legitimate in-flight state.
      if (
        state.isLoading
        && state.context === null
        && state.error === null
        && state.bootstrapStatus !== 'reconciling'
      ) {
        set({ isLoading: false });
      }

      // ---- Re-entrancy guard ----
      // Prevent concurrent duplicate calls. Clerk Expo's useAuth can
      // trigger multiple effect runs during auth transitions; without this
      // guard loadContext would initiate two parallel API requests.
      if (get().isLoading) return;

      const generation = sessionGeneration;
      const requestId = ++contextRequestId;

      set({ isLoading: true, error: null });
      await loadContextForCurrentSession(getToken, {
        generation,
        requestId,
        clerkUserId: null,
        bootstrapOutcome: null,
      });
    },

    bootstrapAuthenticatedContext: async ({ clerkUserId, getToken }) => {
      const state = get();
      if (
        state.context
        && state.bootstrapStatus === 'ready'
        && state.activeClerkUserId === clerkUserId
      ) {
        return;
      }

      if (bootstrapPromise && bootstrapPromiseUserId === clerkUserId) {
        return bootstrapPromise;
      }

      const generation = sessionGeneration;
      set({
        isLoading: true,
        error: null,
        bootstrapStatus: 'reconciling',
        bootstrapErrorKey: null,
        activeClerkUserId: clerkUserId,
        lastBootstrapOutcome: null,
      });

      let currentPromise: Promise<void> | null = null;
      const promise = (async () => {
        try {
          const reconciliation = await reconcileEmployeeInvitationOnboarding(getToken);
          if (!isCurrentClerkUser(generation, clerkUserId)) {
            return;
          }

          const requestId = ++contextRequestId;
          await loadContextForCurrentSession(getToken, {
            generation,
            requestId,
            clerkUserId,
            bootstrapOutcome: reconciliation.outcome,
          });
        } catch (err) {
          if (!isCurrentClerkUser(generation, clerkUserId)) {
            return;
          }

          const errorKey = mapEmployeeInvitationApiError(err);
          const message = err instanceof Error ? err.message : defaultUnknownApiMessage();
          set({
            context: null,
            isLoading: false,
            error: message,
            bootstrapStatus: classifyEmployeeInvitationBootstrapStatus(errorKey),
            bootstrapErrorKey: errorKey,
            lastBootstrapOutcome: null,
          });
        } finally {
          if (bootstrapPromise === currentPromise) {
            bootstrapPromise = null;
            bootstrapPromiseUserId = null;
          }
        }
      })();
      currentPromise = promise;

      bootstrapPromise = promise;
      bootstrapPromiseUserId = clerkUserId;

      return promise;
    },

    clearContext: () => {
      sessionGeneration += 1;
      bootstrapPromise = null;
      bootstrapPromiseUserId = null;
      set({
        context: null,
        isLoading: false,
        error: null,
        bootstrapStatus: 'idle',
        bootstrapErrorKey: null,
        activeClerkUserId: null,
        lastBootstrapOutcome: null,
      });
    },
  };
});
