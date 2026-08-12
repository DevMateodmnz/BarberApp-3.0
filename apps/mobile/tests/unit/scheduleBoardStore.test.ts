import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyScheduleBoard } from '../../src/lib/types.js';

const mockFetchDailyScheduleBoard = vi.fn();

vi.mock('../../src/lib/appointments.js', () => ({
  fetchDailyScheduleBoard: (...args: unknown[]) => mockFetchDailyScheduleBoard(...args),
}));

async function importStore() {
  return import('../../src/lib/scheduleBoardStore.js');
}

function makeBoard(overrides: Partial<DailyScheduleBoard> = {}): DailyScheduleBoard {
  return {
    date: '2026-07-20',
    timezone: 'America/Argentina/Tucuman',
    generatedAt: '2026-07-20T13:15:00.000Z',
    currentTime: {
      iso: '2026-07-20T13:15:00.000Z',
      localTime: '10:15',
    },
    employees: [],
    ...overrides,
  };
}

describe('useScheduleBoardStore', () => {
  beforeEach(async () => {
    const { useScheduleBoardStore } = await importStore();
    useScheduleBoardStore.getState().clearScheduleBoard();
    vi.clearAllMocks();
  });

  it('loads the schedule board and caches the last query', async () => {
    const { useScheduleBoardStore } = await importStore();
    const board = makeBoard();
    mockFetchDailyScheduleBoard.mockResolvedValueOnce(board);

    const getToken = vi.fn().mockResolvedValue('token');
    await useScheduleBoardStore.getState().loadScheduleBoard(getToken, 'shop-1', {
      date: '2026-07-20',
      employeeId: 'emp-1',
    });

    expect(mockFetchDailyScheduleBoard).toHaveBeenCalledWith(getToken, 'shop-1', {
      date: '2026-07-20',
      employeeId: 'emp-1',
    });
    expect(useScheduleBoardStore.getState().board).toEqual(board);

    mockFetchDailyScheduleBoard.mockResolvedValueOnce(board);
    await useScheduleBoardStore.getState().reloadLastScheduleBoard(getToken);

    expect(mockFetchDailyScheduleBoard).toHaveBeenNthCalledWith(2, getToken, 'shop-1', {
      date: '2026-07-20',
      employeeId: 'emp-1',
    });
  });

  it('ignores stale overlapping responses', async () => {
    const { useScheduleBoardStore } = await importStore();

    let resolveFirst: ((value: DailyScheduleBoard) => void) | null = null;
    let resolveSecond: ((value: DailyScheduleBoard) => void) | null = null;

    mockFetchDailyScheduleBoard
      .mockImplementationOnce(() => new Promise<DailyScheduleBoard>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise<DailyScheduleBoard>((resolve) => {
        resolveSecond = resolve;
      }));

    const getToken = vi.fn().mockResolvedValue('token');
    const firstLoad = useScheduleBoardStore.getState().loadScheduleBoard(getToken, 'shop-1', {
      date: '2026-07-20',
    });
    const secondLoad = useScheduleBoardStore.getState().loadScheduleBoard(getToken, 'shop-1', {
      date: '2026-07-21',
    });

    resolveSecond?.(makeBoard({ date: '2026-07-21' }));
    await secondLoad;

    resolveFirst?.(makeBoard({ date: '2026-07-20' }));
    await firstLoad;

    expect(useScheduleBoardStore.getState().board?.date).toBe('2026-07-21');
    expect(useScheduleBoardStore.getState().scheduleBoardError).toBeNull();
  });
});
