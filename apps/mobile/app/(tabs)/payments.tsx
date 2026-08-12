import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  disconnectPaymentConnection,
  fetchDepositPolicy,
  fetchPaymentConnection,
  fetchPaymentSummary,
  startMercadoPagoConnect,
  updateDepositPolicy,
} from '@/lib/payments.js';
import {
  fetchPaymentReviewSummary,
  fetchPaymentReviews,
} from '@/lib/paymentReviews.js';
import {
  PAYMENT_REVIEW_FILTERS,
  type PaymentReviewFilter,
  formatPaymentReviewFilter,
  formatPaymentReviewReason,
  formatPaymentReviewStatus,
  getPaymentReviewFilterStatus,
} from '@/lib/paymentReviewPresentation.js';
import { useContextStore } from '@/lib/store.js';
import type {
  DepositPolicyMode,
  DepositPolicySettings,
  PaymentConnection,
  PaymentOperationsSummary,
  PaymentReviewListItem,
  PaymentReviewSummary,
} from '@/lib/types.js';
import { Screen, AppButton, AppCard, ScreenHeader, SectionHeader } from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

function toMoneyInput(value: number | null) {
  return value === null ? '' : String(value);
}

function formatMoney(valueCents: number, currency: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function PaymentsSettingsScreen() {
  const router = useRouter();
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
  const [reviewSummary, setReviewSummary] = useState<PaymentReviewSummary | null>(null);
  const [reviewItems, setReviewItems] = useState<PaymentReviewListItem[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<PaymentReviewFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [isLoadingMoreReviews, setIsLoadingMoreReviews] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewPage, setReviewPage] = useState(1);

  const loadReviews = useCallback(async (page = 1, append = false) => {
    if (!context?.barbershopId || !getTokenRef.current) {
      return;
    }

    if (page === 1) {
      setIsReviewLoading(true);
      setReviewError(null);
    } else {
      setIsLoadingMoreReviews(true);
    }

    try {
      const [nextSummary, nextPage] = await Promise.all([
        fetchPaymentReviewSummary(getTokenRef.current, context.barbershopId),
        fetchPaymentReviews(getTokenRef.current, context.barbershopId, {
          status: getPaymentReviewFilterStatus(reviewFilter),
          page,
          limit: 10,
          sort: 'newest',
        }),
      ]);
      setReviewSummary(nextSummary);
      setReviewItems(append ? [...reviewItems, ...nextPage.items] : nextPage.items);
      setReviewTotal(nextPage.total);
      setReviewHasMore(nextPage.hasMore);
      setReviewPage(nextPage.page);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : t('errors.unknownApi'));
    } finally {
      setIsReviewLoading(false);
      setIsLoadingMoreReviews(false);
    }
  }, [context?.barbershopId, reviewFilter, reviewItems, t]);

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
      await loadReviews(1, false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('errors.unknownApi'));
    } finally {
      setIsLoading(false);
    }
  }, [context?.barbershopId, loadReviews, t]);

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
    <Screen scrollable keyboardAware>
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

        <AppCard variant="outlined" testID="payment-reviews-section">
          <SectionHeader title={t('paymentsSettings.reviews.title')} />
          {reviewSummary ? (
            <View style={styles.reviewSummaryGrid}>
              <ReviewMetric label={t('paymentsSettings.reviews.summary.open')} value={reviewSummary.open} testID="payment-reviews-open" />
              <ReviewMetric label={t('paymentsSettings.reviews.summary.inProgress')} value={reviewSummary.inProgress} testID="payment-reviews-in-progress" />
              <ReviewMetric label={t('paymentsSettings.reviews.summary.resolvedRecently')} value={reviewSummary.resolvedRecently} testID="payment-reviews-resolved" />
            </View>
          ) : isReviewLoading ? (
            <Text style={styles.helperText}>{t('paymentsSettings.reviews.loadingSummary')}</Text>
          ) : null}

          <View style={styles.filterBar} testID="payment-reviews-filter-bar">
            {PAYMENT_REVIEW_FILTERS.map((filter) => (
              <AppButton
                key={filter}
                testID={`payment-review-filter-${filter}`}
                title={formatPaymentReviewFilter(filter, t)}
                variant={reviewFilter === filter ? 'primary' : 'secondary'}
                onPress={() => {
                  setReviewFilter(filter);
                  void loadReviews(1, false);
                }}
              />
            ))}
          </View>

          {reviewError ? <Text style={styles.errorText}>{reviewError}</Text> : null}
          {isReviewLoading && reviewItems.length === 0 ? (
            <Text style={styles.helperText}>{t('paymentsSettings.reviews.loadingList')}</Text>
          ) : null}
          {!isReviewLoading && !reviewError && reviewItems.length === 0 ? (
            <Text style={styles.helperText}>{t('paymentsSettings.reviews.empty')}</Text>
          ) : null}

          <View style={styles.reviewList}>
            {reviewItems.map((item) => (
              <Pressable
                key={item.id}
                testID={`payment-review-row-${item.id}`}
                style={styles.reviewRow}
                onPress={() => router.push(`/(tabs)/payment-review-detail?reviewId=${encodeURIComponent(item.id)}`)}
              >
                <Text style={styles.reviewCustomer}>{item.customerDisplayName}</Text>
                <Text style={styles.metaText}>{formatMoney(item.amountCents, item.currency)}</Text>
                <Text style={styles.metaText}>{formatPaymentReviewReason(item.reason, t)}</Text>
                <Text style={styles.metaText}>{formatPaymentReviewStatus(item.status, t)}</Text>
                <Text style={styles.metaText}>{formatDateTime(item.appointmentStartAt)}</Text>
                <Text style={styles.metaText}>{item.serviceName}</Text>
                <Text style={styles.metaText}>{formatDateTime(item.openedAt)}</Text>
                {item.latestSafeNotePreview ? (
                  <Text style={styles.helperText}>{item.latestSafeNotePreview}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>

          <Text style={styles.helperText}>{t('paymentsSettings.reviews.results', { count: reviewTotal })}</Text>
          {reviewHasMore ? (
            <AppButton
              testID="payment-reviews-load-more"
              title={t('paymentsSettings.reviews.loadMore')}
              variant="secondary"
              loading={isLoadingMoreReviews}
              loadingText={t('paymentsSettings.reviews.loadingMore')}
              onPress={() => void loadReviews(reviewPage + 1, true)}
            />
          ) : null}
        </AppCard>

        {message ? (
          <AppCard variant="outlined">
            <Text style={styles.bodyText}>{message}</Text>
          </AppCard>
        ) : null}
      </View>
    </Screen>
  );
}

function ReviewMetric({ label, value, testID }: { label: string; value: number; testID: string }) {
  return (
    <View style={styles.metricCard} testID={testID}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.helperText}>{label}</Text>
    </View>
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
    fontWeight: tokens.typography.weight.semibold,
  },
  secondaryButton: {
    backgroundColor: tokens.colors.surfaceVariant,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  secondaryButtonText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.medium,
  },
  inputBlock: {
    gap: tokens.spacing[1],
    marginTop: tokens.spacing[2],
  },
  label: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    color: tokens.colors.textPrimary,
    backgroundColor: tokens.colors.surface,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  reviewSummaryGrid: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    flexWrap: 'wrap',
  },
  metricCard: {
    minWidth: 120,
    gap: tokens.spacing[1],
  },
  metricValue: {
    ...tokens.typography.variant.title,
    color: tokens.colors.textPrimary,
  },
  filterBar: {
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[3],
  },
  reviewList: {
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[3],
  },
  reviewRow: {
    gap: tokens.spacing[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[3],
  },
  reviewCustomer: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
  },
  metaText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
});
