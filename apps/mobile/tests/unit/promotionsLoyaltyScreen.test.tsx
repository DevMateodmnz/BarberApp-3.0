import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PromotionsScreen from '../../app/(tabs)/promotions.js';
import type { LoyaltyProgramSettings } from '../../src/lib/types.js';

const apiMocks = vi.hoisted(() => ({
  fetchBarbershopServices: vi.fn(),
  fetchLoyaltyLedger: vi.fn(),
  fetchLoyaltyProgram: vi.fn(),
  fetchPromotionSummary: vi.fn(),
  fetchPromotions: vi.fn(),
  updateLoyaltyProgram: vi.fn(),
}));

const translate = vi.hoisted(() => (key: string) => key);
const contextStoreState = vi.hoisted(() => ({
  context: {
    role: 'OWNER',
    barbershopId: 'shop-1',
    barbershopName: 'Main Shop',
    employeeId: null,
    employeeName: null,
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => 'owner-token'),
    isLoaded: true,
    isSignedIn: true,
  }),
}));

vi.mock('../../src/lib/store.js', () => ({
  useContextStore: () => ({
    context: contextStoreState.context,
    isLoading: false,
    error: null,
    loadContext: vi.fn(),
  }),
}));

vi.mock('../../src/lib/services.js', () => ({
  fetchBarbershopServices: apiMocks.fetchBarbershopServices,
}));

vi.mock('../../src/lib/promotions.js', () => ({
  createPromotion: vi.fn(),
  fetchLoyaltyLedger: apiMocks.fetchLoyaltyLedger,
  fetchLoyaltyProgram: apiMocks.fetchLoyaltyProgram,
  fetchPromotionDetail: vi.fn(),
  fetchPromotionRedemptions: vi.fn(),
  fetchPromotions: apiMocks.fetchPromotions,
  fetchPromotionSummary: apiMocks.fetchPromotionSummary,
  setPromotionActive: vi.fn(),
  updateLoyaltyProgram: apiMocks.updateLoyaltyProgram,
  updatePromotion: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function program(visitsRequired: number): LoyaltyProgramSettings {
  return {
    id: 'program-1',
    isEnabled: true,
    visitsRequired,
    rewardValidityDays: 30,
    rewardPromotion: {
      id: 'promotion-1',
      name: 'Loyalty reward',
      code: 'LOYALTY',
      discountType: 'FIXED',
      fixedDiscountCents: 1500,
      percentageBasisPoints: null,
      minimumPriceCents: null,
      serviceScope: 'ALL',
      appliesToPublicBookings: true,
      appliesToStaffBookings: true,
      serviceIds: [],
    },
  };
}

function inputWithin(instance: ReactTestInstance): ReactTestInstance {
  return instance.findByType('TextInput');
}

describe('OWNER loyalty settings screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextStoreState.context = {
      role: 'OWNER',
      barbershopId: 'shop-1',
      barbershopName: 'Main Shop',
      employeeId: null,
      employeeName: null,
    };
    apiMocks.fetchBarbershopServices.mockResolvedValue([]);
    apiMocks.fetchLoyaltyLedger.mockResolvedValue({ items: [], page: 1, limit: 10, total: 0 });
    apiMocks.fetchPromotionSummary.mockResolvedValue({
      activePromotions: 0,
      upcomingPromotions: 0,
      totalConsumedRedemptions: 0,
      totalDiscountCents: 0,
    });
    apiMocks.fetchPromotions.mockResolvedValue([]);
  });

  it('keeps the authoritative saved threshold when an older screen load resolves last', async () => {
    const initialSummary = deferred<{
      activePromotions: number;
      upcomingPromotions: number;
      totalConsumedRedemptions: number;
      totalDiscountCents: number;
    }>();

    apiMocks.fetchPromotionSummary
      .mockReturnValueOnce(initialSummary.promise)
      .mockResolvedValueOnce({
        activePromotions: 0,
        upcomingPromotions: 0,
        totalConsumedRedemptions: 0,
        totalDiscountCents: 0,
      });
    apiMocks.fetchLoyaltyProgram
      .mockResolvedValueOnce(program(5))
      .mockResolvedValueOnce(program(2));
    apiMocks.updateLoyaltyProgram.mockResolvedValueOnce(program(2));

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<PromotionsScreen />);
      await Promise.resolve();
    });

    const visitsField = renderer!.root.findByProps({
      testID: 'promotions-loyalty-visits-required',
    });

    await act(async () => {
      inputWithin(visitsField).props.onChangeText('2');
    });

    await act(async () => {
      renderer!.root.findByProps({ testID: 'promotions-loyalty-save' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMocks.updateLoyaltyProgram).toHaveBeenCalledWith(
      expect.any(Function),
      'shop-1',
      expect.objectContaining({ visitsRequired: 2 }),
    );

    await act(async () => {
      initialSummary.resolve({
        activePromotions: 0,
        upcomingPromotions: 0,
        totalConsumedRedemptions: 0,
        totalDiscountCents: 0,
      });
      await initialSummary.promise;
    });

    const finalVisitsField = renderer!.root.findByProps({
      testID: 'promotions-loyalty-visits-required',
    });
    expect(inputWithin(finalVisitsField).props.value).toBe('2');
  });

  it('does not show success or discard the entered threshold when Save fails', async () => {
    apiMocks.fetchLoyaltyProgram.mockResolvedValueOnce(program(5));
    apiMocks.updateLoyaltyProgram.mockRejectedValueOnce(new Error('Threshold was not persisted'));

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<PromotionsScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const visitsField = renderer!.root.findByProps({
      testID: 'promotions-loyalty-visits-required',
    });
    await act(async () => {
      inputWithin(visitsField).props.onChangeText('2');
    });

    await act(async () => {
      renderer!.root.findByProps({ testID: 'promotions-loyalty-save' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(inputWithin(renderer!.root.findByProps({
      testID: 'promotions-loyalty-visits-required',
    })).props.value).toBe('2');
    expect(renderer!.root.findAllByProps({ testID: 'promotions-message-card' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ testID: 'promotions-error-card' })).toBeTruthy();
    expect(renderer!.root.findAllByType('Text').some((node) =>
      node.props.children === 'Threshold was not persisted'
    )).toBe(true);
  });

  it('discards an unsaved edit after unmount and reloads the server value on remount', async () => {
    apiMocks.fetchLoyaltyProgram
      .mockResolvedValueOnce(program(7))
      .mockResolvedValueOnce(program(7));

    let firstRenderer: ReturnType<typeof create>;
    await act(async () => {
      firstRenderer = create(<PromotionsScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      inputWithin(firstRenderer!.root.findByProps({
        testID: 'promotions-loyalty-visits-required',
      })).props.onChangeText('2');
    });
    expect(inputWithin(firstRenderer!.root.findByProps({
      testID: 'promotions-loyalty-visits-required',
    })).props.value).toBe('2');

    await act(async () => {
      firstRenderer!.unmount();
    });

    let secondRenderer: ReturnType<typeof create>;
    await act(async () => {
      secondRenderer = create(<PromotionsScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(inputWithin(secondRenderer!.root.findByProps({
      testID: 'promotions-loyalty-visits-required',
    })).props.value).toBe('7');
    expect(apiMocks.updateLoyaltyProgram).not.toHaveBeenCalled();
  });

  it('blocks a non-OWNER tenant context without allowing Save or success feedback', async () => {
    contextStoreState.context = {
      role: 'BARBER',
      barbershopId: 'shop-2',
      barbershopName: 'Other Shop',
      employeeId: 'employee-2',
      employeeName: 'Other Barber',
    };
    apiMocks.fetchLoyaltyProgram.mockResolvedValueOnce(program(5));

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<PromotionsScreen />);
      await Promise.resolve();
    });

    expect(renderer!.root.findByProps({ testID: 'promotions-blocked' })).toBeTruthy();
    expect(renderer!.root.findAllByProps({ testID: 'promotions-loyalty-save' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'promotions-message-card' })).toHaveLength(0);
    expect(apiMocks.fetchLoyaltyProgram).toHaveBeenCalledWith(expect.any(Function), 'shop-2');
    expect(apiMocks.updateLoyaltyProgram).not.toHaveBeenCalled();
  });
});
