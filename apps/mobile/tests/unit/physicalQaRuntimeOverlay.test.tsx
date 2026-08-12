import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  usePathname: () => '/(tabs)/manage',
}));

import {
  PhysicalQaRuntimeOverlayView,
  formatRuntimeBadge,
} from '../../src/components/PhysicalQaRuntimeOverlay.js';
import type { PhysicalQaRuntimeSnapshot } from '../../src/lib/physicalQaRuntime.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ready: PhysicalQaRuntimeSnapshot = {
  enabled: true,
  status: 'ready',
  fingerprint: 'A7F2C9D1',
  appHead: '378762a22392eae5cafc903e37018ef23f2eff96',
  apiHead: '378762a22392eae5cafc903e37018ef23f2eff96',
  apiTarget: 'http://192.168.1.25:3000/api/v1',
  appSessionId: 'app-session-1',
  lastHeartbeatAt: '2026-07-24T10:00:00.000Z',
  traceEnabled: true,
};

describe('physical-QA runtime overlay', () => {
  it('is absent outside physical-QA mode', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <PhysicalQaRuntimeOverlayView
          snapshot={{
            enabled: false,
            status: 'disabled',
            traceEnabled: false,
          }}
          onRetry={vi.fn()}
        />,
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it('blocks the app while handshake is not ready', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <PhysicalQaRuntimeOverlayView
          snapshot={{
            ...ready,
            status: 'mismatch',
            safeErrorCategory: 'RUNTIME_MISMATCH',
          }}
          onRetry={vi.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'physical-qa-runtime-blocking',
      }),
    ).toBeDefined();
    expect(() =>
      renderer.root.findByProps({
        testID: 'physical-qa-runtime-badge',
      }),
    ).toThrow();
  });

  it('shows the exact HEAD/fingerprint badge and opens safe details', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <PhysicalQaRuntimeOverlayView
          snapshot={ready}
          onRetry={vi.fn()}
        />,
      );
    });

    expect(formatRuntimeBadge(ready)).toBe('QA 378762a · A7F2C9D1');
    const badge = renderer.root.findByProps({
      testID: 'physical-qa-runtime-badge',
    });
    act(() => {
      badge.props.onPress();
    });
    expect(
      renderer.root.findByProps({
        testID: 'physical-qa-runtime-panel',
      }),
    ).toBeDefined();
  });
});
