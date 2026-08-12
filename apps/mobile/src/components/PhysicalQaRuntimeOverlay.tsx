import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  physicalQaRuntimeController,
  type PhysicalQaAppState,
  type PhysicalQaRuntimeSnapshot,
} from '@/lib/physicalQaRuntime.js';
import { tokens } from '@/theme/index.js';

const disabledSnapshot: PhysicalQaRuntimeSnapshot = {
  enabled: false,
  status: 'disabled',
  traceEnabled: false,
};

const PhysicalQaRuntimeContext =
  createContext<PhysicalQaRuntimeSnapshot>(disabledSnapshot);

export function PhysicalQaRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const controller = physicalQaRuntimeController;
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? (() => () => undefined),
    controller?.getSnapshot ?? (() => disabledSnapshot),
    controller?.getSnapshot ?? (() => disabledSnapshot),
  );

  useEffect(() => {
    if (!controller) return;
    void controller.start();
    const subscription = AppState.addEventListener('change', (nextState) => {
      controller.setAppState(normalizeAppState(nextState));
    });
    return () => {
      subscription.remove();
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    if (pathname && snapshot.status === 'ready') {
      controller?.focusScreen(pathname);
    }
  }, [controller, pathname, snapshot.status]);

  return (
    <PhysicalQaRuntimeContext.Provider value={snapshot}>
      {children}
      <PhysicalQaRuntimeOverlayView
        snapshot={snapshot}
        onRetry={() => {
          void controller?.start();
        }}
      />
    </PhysicalQaRuntimeContext.Provider>
  );
}

export function usePhysicalQaRuntime(): PhysicalQaRuntimeSnapshot {
  return useContext(PhysicalQaRuntimeContext);
}

export function PhysicalQaRuntimeOverlayView({
  snapshot,
  onRetry,
}: {
  snapshot: PhysicalQaRuntimeSnapshot;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [panelVisible, setPanelVisible] = useState(false);

  if (!snapshot.enabled || snapshot.status === 'disabled') {
    return null;
  }

  if (snapshot.status !== 'ready') {
    return (
      <View
        accessibilityLabel={t('runtime.physicalQa.blockingAccessibility')}
        accessibilityRole="alert"
        style={styles.blockingOverlay}
        testID="physical-qa-runtime-blocking"
      >
        <View style={styles.blockingCard}>
          {snapshot.status === 'checking' ? (
            <ActivityIndicator
              color={tokens.colors.primaryLight}
              size="large"
            />
          ) : null}
          <Text style={styles.blockingEyebrow}>
            {t('runtime.physicalQa.localQa')}
          </Text>
          <Text style={styles.blockingTitle}>
            {snapshot.status === 'checking'
              ? t('runtime.physicalQa.checkingTitle')
              : t('runtime.physicalQa.invalidTitle')}
          </Text>
          <Text style={styles.blockingMessage}>
            {snapshot.status === 'checking'
              ? t('runtime.physicalQa.checkingMessage')
              : t('runtime.physicalQa.invalidMessage')}
          </Text>
          <Text style={styles.fingerprintText}>
            {formatRuntimeBadge(snapshot)}
          </Text>
          {snapshot.status !== 'checking' ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={styles.retryButton}
              testID="physical-qa-runtime-retry"
            >
              <Text style={styles.retryText}>
                {t('runtime.physicalQa.retry')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.readyLayer, { paddingTop: insets.top + 4 }]}
      testID="physical-qa-runtime-ready"
    >
      <Pressable
        accessibilityLabel={t('runtime.physicalQa.badgeAccessibility', {
          head: snapshot.appHead?.slice(0, 7) ?? '',
          fingerprint: snapshot.fingerprint ?? '',
        })}
        accessibilityRole="button"
        onPress={() => setPanelVisible(true)}
        style={styles.badge}
        testID="physical-qa-runtime-badge"
      >
        <Text style={styles.badgeText}>{formatRuntimeBadge(snapshot)}</Text>
      </Pressable>

      {panelVisible ? (
        <View
          accessibilityLabel={t('runtime.physicalQa.panelAccessibility')}
          style={[styles.panel, { top: insets.top + 40 }]}
          testID="physical-qa-runtime-panel"
        >
          <Text style={styles.panelTitle}>
            {t('runtime.physicalQa.panelTitle')}
          </Text>
          <RuntimeField
            label={t('runtime.physicalQa.runtime')}
            value={snapshot.fingerprint ?? '—'}
          />
          <RuntimeField
            label={t('runtime.physicalQa.appHead')}
            value={snapshot.appHead?.slice(0, 7) ?? '—'}
          />
          <RuntimeField
            label={t('runtime.physicalQa.apiHead')}
            value={snapshot.apiHead?.slice(0, 7) ?? '—'}
          />
          <RuntimeField
            label={t('runtime.physicalQa.apiTarget')}
            value={snapshot.apiTarget ?? '—'}
          />
          <RuntimeField
            label={t('runtime.physicalQa.handshake')}
            value={t('runtime.physicalQa.ready')}
          />
          <RuntimeField
            label={t('runtime.physicalQa.lastHeartbeat')}
            value={snapshot.lastHeartbeatAt ?? '—'}
          />
          <RuntimeField
            label={t('runtime.physicalQa.trace')}
            value={
              snapshot.traceEnabled
                ? t('runtime.physicalQa.enabled')
                : t('runtime.physicalQa.disabled')
            }
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setPanelVisible(false)}
            style={styles.closeButton}
            testID="physical-qa-runtime-panel-close"
          >
            <Text style={styles.closeText}>
              {t('runtime.physicalQa.close')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function formatRuntimeBadge(
  snapshot: PhysicalQaRuntimeSnapshot,
): string {
  const head = snapshot.appHead?.slice(0, 7) ?? 'unknown';
  const fingerprint = snapshot.fingerprint ?? 'UNKNOWN';
  return `QA ${head} · ${fingerprint}`;
}

function RuntimeField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text selectable style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function normalizeAppState(value: string): PhysicalQaAppState {
  if (value === 'background' || value === 'inactive') {
    return value;
  }
  return 'active';
}

const styles = StyleSheet.create({
  readyLayer: {
    alignItems: 'center',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  badge: {
    backgroundColor: '#14261f',
    borderColor: '#5fe0a0',
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1],
  },
  badgeText: {
    ...tokens.typography.variant.caption,
    color: '#91f4bd',
    fontWeight: tokens.typography.weight.semibold,
  },
  blockingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 8, 12, 0.98)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: tokens.spacing[6],
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2000,
  },
  blockingCard: {
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.error,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing[3],
    maxWidth: 460,
    padding: tokens.spacing[6],
    width: '100%',
  },
  blockingEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.error,
    fontWeight: tokens.typography.weight.semibold,
    textTransform: 'uppercase',
  },
  blockingTitle: {
    ...tokens.typography.variant.heading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  blockingMessage: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  fingerprintText: {
    ...tokens.typography.variant.label,
    color: tokens.colors.primaryLight,
  },
  retryButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[3],
  },
  retryText: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textInverse,
  },
  panel: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.primaryLight,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing[2],
    maxWidth: 480,
    padding: tokens.spacing[4],
    position: 'absolute',
    width: '92%',
  },
  panelTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing[2],
  },
  fieldRow: {
    gap: tokens.spacing[1],
  },
  fieldLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  fieldValue: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  closeText: {
    ...tokens.typography.variant.label,
    color: tokens.colors.primaryLight,
  },
});
