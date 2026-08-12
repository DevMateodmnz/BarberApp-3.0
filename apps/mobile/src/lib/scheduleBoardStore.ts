import { create } from 'zustand';

import { localizeUnknownError } from '@/i18n/errors.js';

import { fetchDailyScheduleBoard } from './appointments.js';
import type { DailyScheduleBoard } from './types.js';

interface LoadScheduleBoardInput {
  date: string;
  employeeId?: string | null;
  refresh?: boolean;
}

interface ScheduleBoardState {
  board: DailyScheduleBoard | null;
  isScheduleBoardLoading: boolean;
  isScheduleBoardRefreshing: boolean;
  scheduleBoardError: string | null;
  loadScheduleBoard: (
    getToken: () => Promise<string | null>,
    barbershopId: string,
    input: LoadScheduleBoardInput,
  ) => Promise<void>;
  reloadLastScheduleBoard: (
    getToken: () => Promise<string | null>,
  ) => Promise<void>;
  clearScheduleBoard: () => void;
}

let requestId = 0;
let activeRequestKey: string | null = null;
let lastBarbershopId: string | null = null;
let lastQuery: { date: string; employeeId?: string | null } | null = null;

function buildRequestKey(
  barbershopId: string,
  input: { date: string; employeeId?: string | null },
) {
  return `${barbershopId}::${input.date}::${input.employeeId ?? 'all'}`;
}

export const useScheduleBoardStore = create<ScheduleBoardState>((set, get) => ({
  board: null,
  isScheduleBoardLoading: false,
  isScheduleBoardRefreshing: false,
  scheduleBoardError: null,

  loadScheduleBoard: async (getToken, barbershopId, input) => {
    const nextQuery = {
      date: input.date,
      employeeId: input.employeeId ?? null,
    };
    const nextRequestKey = buildRequestKey(barbershopId, nextQuery);
    const state = get();

    if (
      state.isScheduleBoardLoading &&
      activeRequestKey === nextRequestKey &&
      !input.refresh
    ) {
      return;
    }

    const currentRequestId = requestId + 1;
    requestId = currentRequestId;
    activeRequestKey = nextRequestKey;
    lastBarbershopId = barbershopId;
    lastQuery = nextQuery;

    set({
      isScheduleBoardLoading: !input.refresh,
      isScheduleBoardRefreshing: !!input.refresh,
      scheduleBoardError: null,
    });

    try {
      const board = await fetchDailyScheduleBoard(getToken, barbershopId, nextQuery);

      if (currentRequestId !== requestId) {
        return;
      }

      set({
        board,
        isScheduleBoardLoading: false,
        isScheduleBoardRefreshing: false,
        scheduleBoardError: null,
      });
    } catch (error) {
      if (currentRequestId !== requestId) {
        return;
      }

      set({
        isScheduleBoardLoading: false,
        isScheduleBoardRefreshing: false,
        scheduleBoardError:
          error instanceof Error
            ? error.message
            : localizeUnknownError('Failed to load daily schedule board'),
      });
    }
  },

  reloadLastScheduleBoard: async (getToken) => {
    if (!lastBarbershopId || !lastQuery) {
      return;
    }

    await get().loadScheduleBoard(getToken, lastBarbershopId, {
      ...lastQuery,
      refresh: true,
    });
  },

  clearScheduleBoard: () => {
    requestId = 0;
    activeRequestKey = null;
    lastBarbershopId = null;
    lastQuery = null;
    set({
      board: null,
      isScheduleBoardLoading: false,
      isScheduleBoardRefreshing: false,
      scheduleBoardError: null,
    });
  },
}));
