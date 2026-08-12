import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { usePhysicalQaRuntime } from '@/components/PhysicalQaRuntimeOverlay.js';
import {
  AppButton,
  AppCard,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

export default function PhysicalQaRuntimeScreen() {
  const runtime = usePhysicalQaRuntime();
  const router = useRouter();
  const { t } = useTranslation();

  if (!runtime.enabled) {
    return null;
  }

  return (
    <Screen scrollable testID="physical-qa-runtime-screen">
      <ScreenHeader
        title={t('runtime.physicalQa.panelTitle')}
        subtitle={t('runtime.physicalQa.openDescription')}
      />
      <AppCard variant="outlined" style={styles.card}>
        <Field
          label={t('runtime.physicalQa.runtime')}
          value={runtime.fingerprint ?? '—'}
        />
        <Field
          label={t('runtime.physicalQa.appHead')}
          value={runtime.appHead?.slice(0, 7) ?? '—'}
        />
        <Field
          label={t('runtime.physicalQa.apiHead')}
          value={runtime.apiHead?.slice(0, 7) ?? '—'}
        />
        <Field
          label={t('runtime.physicalQa.apiTarget')}
          value={runtime.apiTarget ?? '—'}
        />
        <Field
          label={t('runtime.physicalQa.handshake')}
          value={runtime.status}
        />
        <Field
          label={t('runtime.physicalQa.lastHeartbeat')}
          value={runtime.lastHeartbeatAt ?? '—'}
        />
        <Field
          label={t('runtime.physicalQa.trace')}
          value={
            runtime.traceEnabled
              ? t('runtime.physicalQa.enabled')
              : t('runtime.physicalQa.disabled')
          }
        />
      </AppCard>
      <View style={styles.actions}>
        <AppButton
          title={t('common.actions.back')}
          variant="secondary"
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing[4],
  },
  field: {
    gap: tokens.spacing[1],
  },
  label: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  value: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  actions: {
    marginTop: tokens.spacing[4],
  },
});
