import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  disconnectPaymentConnection,
  fetchDepositPolicy,
  fetchPaymentConnection,
  fetchPaymentSummary,
  startMercadoPagoConnect,
  updateDepositPolicy,
} from '@/lib/payments.js';
import { useContextStore } from '@/lib/store.js';
import type { DepositPolicyMode, DepositPolicySettings, PaymentConnection, PaymentOperationsSummary } from '@/lib/types.js';
import { Screen, AppCard, ScreenHeader, SectionHeader } from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

function toMoneyInput(value: number | null) {
  return value === null ? '' : String(value);
}

export default function PaymentsSettingsScreen() {
  const { t } = useTranslation();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const context = useContextStore((state) => state.context);
  const loadContext = useContextStore((state) => state.loadContext);

  const [connection, setConnection] = useState<PaymentConnection | null>(null);
  const [policy, setPolicy] = useState<DepositPolicySettings | null>(null);
  const [summary, setSummary] = useState<PaymentOperationsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!context?.barbershopId || !getTokenRef.current) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const [nextConnection, nextPolicy, nextSummary] = await Promise.all([
        fetchPaymentConnection(getTokenRef.current, context.barbershopId),
        fetchDepositPolicy(getTokenRef.current, context.barbershopId),
        fetchPaymentSummary(getTokenRef.current, context.barbershopId),
      ]);
      setConnection(nextConnection);
      setPolicy(nextPolicy);
      setSummary(nextSummary);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('errors.unknownApi'));
    } finally {
      setIsLoading(false);
    }
  }, [context?.barbershopId, t]);

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return undefined;
    }, [load]),
  );

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (!context || context.role !== 'OWNER' || !context.barbershopId) {
    return (
      <Screen>
        <AppCard variant="outlined">
          <Text style={styles.blockedTitle}>{t('paymentsSettings.blockedTitle')}</Text>
          <Text style={styles.bodyText}>{t('paymentsSettings.blockedMessage')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (isLoading && !policy) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        </View>
      </Screen>
    );
  }

  const statusLabel = connection ? t(`paymentsSettings.connection.status.${connection.status}`) : '—';

  return (
    <Screen scrollable>
      <ScreenHeader title={t('paymentsSettings.title')} subtitle={t('paymentsSettings.subtitle')} />
      <View style={styles.stack}>
        <AppCard variant="outlined">
          <SectionHeader title={t('paymentsSettings.connection.title')} />
          <Text style={styles.bodyText}>{statusLabel}</Text>
          {connection?.lastErrorCode ? (
            <Text style={styles.errorText}>{connection.lastErrorCode}</Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (!getTokenRef.current) return;
                setIsSaving(true);
                void startMercadoPagoConnect(getTokenRef.current, context.barbershopId!)
                  .then(() => setMessage(t('paymentsSettings.messages.connectStarted')))
                  .catch((error) => setMessage(error instanceof Error ? error.message : t('errors.unknownApi')))
                  .finally(() => setIsSaving(false));
              }}
            >
              <Text style={styles.primaryButtonText}>
                {connection?.status === 'CONNECTED'
                  ? t('paymentsSettings.connection.reconnect')
                  : t('paymentsSettings.connection.connect')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                if (!getTokenRef.current) return;
                setIsSaving(true);
                void disconnectPaymentConnection(getTokenRef.current, context.barbershopId!)
                  .then(() => setMessage(t('paymentsSettings.messages.disconnected')))
                  .then(load)
                  .catch((error) => setMessage(error instanceof Error ? error.message : t('errors.unknownApi')))
                  .finally(() => setIsSaving(false));
              }}
            >
              <Text style={styles.secondaryButtonText}>{t('paymentsSettings.connection.disconnect')}</Text>
            </Pressable>
          </View>
        </AppCard>

        {policy ? (
          <AppCard variant="outlined">
            <SectionHeader title={t('paymentsSettings.policy.title')} />
            <PolicyModeSelector
              currentMode={policy.mode}
              onChange={(mode) => setPolicy({ ...policy, mode })}
            />
            {policy.mode === 'FIXED' ? (
              <LabeledInput
                label={t('paymentsSettings.policy.fixedAmount')}
                value={toMoneyInput(policy.fixedAmountCents)}
                onChangeText={(value) => setPolicy({ ...policy, fixedAmountCents: value ? Number(value) : null })}
              />
            ) : null}
            {policy.mode === 'PERCENTAGE' ? (
              <LabeledInput
                label={t('paymentsSettings.policy.percentageBasisPoints')}
                value={policy.percentageBasisPoints ? String(policy.percentageBasisPoints) : ''}
                onChangeText={(value) => setPolicy({ ...policy, percentageBasisPoints: value ? Number(value) : null })}
              />
            ) : null}
            <LabeledInput
              label={t('paymentsSettings.policy.holdDuration')}
              value={String(policy.holdDurationMinutes)}
              onChangeText={(value) => setPolicy({ ...policy, holdDurationMinutes: value ? Number(value) : 15 })}
            />
            <LabeledInput
              label={t('paymentsSettings.policy.publicTerms')}
              value={policy.publicTerms ?? ''}
              onChangeText={(value) => setPolicy({ ...policy, publicTerms: value })}
              multiline
            />
            <Text style={styles.helperText}>{t('paymentsSettings.policy.previewExample')}</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (!getTokenRef.current || !policy) return;
                setIsSaving(true);
                void updateDepositPolicy(getTokenRef.current, context.barbershopId!, policy)
                  .then((nextPolicy) => {
                    setPolicy(nextPolicy);
                    setMessage(t('paymentsSettings.messages.policySaved'));
                  })
                  .catch((error) => setMessage(error instanceof Error ? error.message : t('errors.unknownApi')))
                  .finally(() => setIsSaving(false));
              }}
            >
              <Text style={styles.primaryButtonText}>{isSaving ? t('paymentsSettings.saving') : t('paymentsSettings.save')}</Text>
            </Pressable>
          </AppCard>
        ) : null}

        {summary ? (
          <AppCard variant="outlined">
            <SectionHeader title={t('paymentsSettings.attention.title')} />
            <Text style={styles.bodyText}>{t('paymentsSettings.attention.pendingTooLong', { count: summary.pendingTooLong })}</Text>
            <Text style={styles.bodyText}>{t('paymentsSettings.attention.expired', { count: summary.expired })}</Text>
            <Text style={styles.bodyText}>{t('paymentsSettings.attention.reviewRequired', { count: summary.reviewRequired })}</Text>
            <Text style={styles.bodyText}>{t('paymentsSettings.attention.approvedCancelled', { count: summary.approvedCancelled })}</Text>
          </AppCard>
        ) : null}

        {message ? (
          <AppCard variant="outlined">
            <Text style={styles.bodyText}>{message}</Text>
          </AppCard>
        ) : null}
      </View>
    </Screen>
  );
}

function PolicyModeSelector({
  currentMode,
  onChange,
}: {
  currentMode: DepositPolicyMode;
  onChange: (mode: DepositPolicyMode) => void;
}) {
  const { t } = useTranslation();
  const modes: DepositPolicyMode[] = ['DISABLED', 'FIXED', 'PERCENTAGE'];

  return (
    <View style={styles.buttonRow}>
      {modes.map((mode) => (
        <Pressable
          key={mode}
          style={mode === currentMode ? styles.primaryButton : styles.secondaryButton}
          onPress={() => onChange(mode)}
        >
          <Text style={mode === currentMode ? styles.primaryButtonText : styles.secondaryButtonText}>
            {t(`paymentsSettings.policy.modes.${mode}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.textarea : null]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: tokens.layout.majorSectionGap,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  bodyText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  helperText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[2],
  },
  primaryButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  primaryButtonText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textInverse,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  secondaryButtonText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  inputBlock: {
    gap: tokens.spacing[1],
    marginTop: tokens.spacing[3],
  },
  label: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    color: tokens.colors.textPrimary,
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
