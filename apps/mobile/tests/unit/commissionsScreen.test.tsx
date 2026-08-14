import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionsScreen from '../../app/(tabs)/commissions.js';

const apiMocks = vi.hoisted(() => ({
  createCommissionLiquidation: vi.fn(),
  fetchCommissionLiquidation: vi.fn(),
  fetchCommissionLiquidations: vi.fn(),
  fetchCommissionOverview: vi.fn(),
  fetchCommissionSettings: vi.fn(),
  markCommissionLiquidationPaid: vi.fn(),
  previewCommissionLiquidation: vi.fn(),
  saveCommissionSettings: vi.fn(),
  voidCommissionLiquidation: vi.fn(),
}));
const contextState = vi.hoisted(() => ({
  context: {
    role: 'OWNER' as 'OWNER' | 'BARBER',
    barbershopId: 'shop-1',
    barbershopTimezone: 'America/Argentina/Tucuman',
    employeeId: null as string | null,
  },
}));
const translate = vi.hoisted(() => (key: string) => key);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('expo-router', () => ({ useFocusEffect: vi.fn() }));
vi.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ getToken: async () => 'token', isLoaded: true, isSignedIn: true }) }));
vi.mock('../../src/lib/store.js', () => ({
  useContextStore: (selector: (state: typeof contextState) => unknown) => selector(contextState),
}));
vi.mock('../../src/lib/commissions.js', () => apiMocks);

const settings = {
  defaultPercentageBasisPoints: 2000,
  employees: [{ employeeId: 'employee-1', name: 'Carlos', isActive: true, overridePercentageBasisPoints: null, effectivePercentageBasisPoints: 2000 }],
};
const overview = {
  employeeId: 'employee-1', timezone: 'America/Argentina/Tucuman', dateFrom: '2026-08-01', dateTo: '2026-08-31',
  summary: { grossAmountCents: 10000, commissionAmountCents: 2000, unsettledAmountCents: 2000, openLiquidationAmountCents: 0, paidAmountCents: 0 },
  items: [], page: 1, limit: 25, total: 0, hasMore: false,
};
const liquidation = {
  id: 'liquidation-1', employeeId: 'employee-1', status: 'PAID' as const,
  periodStart: '2026-08-01T03:00:00.000Z', periodEnd: '2026-09-01T03:00:00.000Z',
  grossAmountCents: 10000, commissionAmountCents: 2000, currency: 'ARS', entryCount: 1,
  paidAt: '2026-08-31T12:00:00.000Z', voidedAt: null, voidReason: null, createdAt: '2026-08-31T11:00:00.000Z',
};

async function settle() {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}

describe('commissions role-aware screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextState.context = { role: 'OWNER', barbershopId: 'shop-1', barbershopTimezone: 'America/Argentina/Tucuman', employeeId: null };
    apiMocks.fetchCommissionSettings.mockResolvedValue(settings);
    apiMocks.fetchCommissionOverview.mockResolvedValue(overview);
    apiMocks.fetchCommissionLiquidations.mockResolvedValue([]);
    apiMocks.fetchCommissionLiquidation.mockResolvedValue({
      ...liquidation,
      entries: [{
        id: 'entry-1', grossAmountCents: 10000, percentageBasisPoints: 2000,
        commissionAmountCents: 2000, currency: 'ARS', earnedAt: '2026-08-15T15:00:00.000Z',
        liquidationId: liquidation.id, liquidation: { id: liquidation.id, status: 'PAID', paidAt: liquidation.paidAt },
        appointment: { id: 'appointment-1', startAt: '2026-08-15T14:30:00.000Z', clientName: 'Ana', serviceName: 'Corte', status: 'COMPLETED' },
      }],
    });
    apiMocks.saveCommissionSettings.mockResolvedValue(settings);
  });

  it('renders owner summary, barber filter, settings, and liquidation controls', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CommissionsScreen />); await settle(); });
    expect(renderer.root.findByProps({ testID: 'commissions-screen' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'commission-default-rate' }).props.value).toBe('20');
    expect(renderer.root.findByProps({ testID: 'commission-save-rates' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'commission-preview' })).toBeDefined();
    expect(apiMocks.fetchCommissionOverview).toHaveBeenCalledWith(expect.any(Function), 'shop-1', expect.objectContaining({ role: 'OWNER', employeeId: 'employee-1' }));
  });

  it('renders barber self-service without owner settings or mutation controls', async () => {
    contextState.context = { role: 'BARBER', barbershopId: 'shop-1', barbershopTimezone: 'America/Argentina/Tucuman', employeeId: 'employee-1' };
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CommissionsScreen />); await settle(); });
    expect(apiMocks.fetchCommissionSettings).not.toHaveBeenCalled();
    expect(apiMocks.fetchCommissionOverview).toHaveBeenCalledWith(expect.any(Function), 'shop-1', expect.objectContaining({ role: 'BARBER' }));
    expect(renderer.root.findAllByProps({ testID: 'commission-save-rates' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'commission-create' })).toHaveLength(0);
  });

  it('shows an honest error rather than zero-valued summary after load failure', async () => {
    apiMocks.fetchCommissionOverview.mockRejectedValue(new Error('Network unavailable'));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CommissionsScreen />); await settle(); });
    expect(renderer.root.findByProps({ testID: 'commissions-error' })).toBeDefined();
    expect(renderer.root.findAll((node) => node.props.children === 'commissions.metrics.gross')).toHaveLength(0);
  });

  it('does not show success when saving fails', async () => {
    apiMocks.saveCommissionSettings.mockRejectedValue(new Error('Persistence failed'));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CommissionsScreen />); await settle(); });
    await act(async () => { renderer.root.findByProps({ testID: 'commission-save-rates' }).props.onPress(); await settle(); });
    expect(renderer.root.findByProps({ testID: 'commissions-error' })).toBeDefined();
    expect(renderer.root.findAllByProps({ testID: 'commissions-message' })).toHaveLength(0);
  });

  it('loads tenant-scoped liquidation entries on demand for history detail', async () => {
    apiMocks.fetchCommissionLiquidations.mockResolvedValue([liquidation]);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CommissionsScreen />); await settle(); });
    await act(async () => {
      renderer.root.findByProps({ testID: 'commission-liquidation-detail-liquidation-1' }).props.onPress();
      await settle();
    });
    expect(apiMocks.fetchCommissionLiquidation).toHaveBeenCalledWith(expect.any(Function), 'shop-1', 'liquidation-1');
    expect(renderer.root.findByProps({ testID: 'commission-liquidation-entries-liquidation-1' })).toBeDefined();
  });
});
