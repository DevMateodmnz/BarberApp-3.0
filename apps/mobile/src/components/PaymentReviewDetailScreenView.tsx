import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, EmptyState, Screen, ScreenHeader } from '@/components/ui/index.js';
import {
  PAYMENT_REVIEW_RESOLUTION_OPTIONS,
  formatPaymentReviewReason,
  formatPaymentReviewResolution,
  formatPaymentReviewStatus,
} from '@/lib/paymentReviewPresentation.js';
import type { PaymentReviewDetail, PaymentReviewResolution } from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

export interface PaymentReviewDetailScreenViewProps {
  detail: PaymentReviewDetail | null;
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
  actionMessage: string | null;
  noteDraft: string;
  onChangeNote: (value: string) => void;
  selectedResolution: PaymentReviewResolution;
  onSelectResolution: (value: PaymentReviewResolution) => void;
  onBack: () => void;
  onRefresh: () => void;
  onStart: () => void;
  onAddNote: () => void;
  onResolve: () => void;
  onReopen: () => void;
}

function formatMoney(valueCents: number, currency: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function PaymentReviewDetailScreenView({
  detail,
  isLoading,
  error,
  isSubmitting,
  actionMessage,
  noteDraft,
  onChangeNote,
  selectedResolution,
  onSelectResolution,
  onBack,
  onRefresh,
  onStart,
  onAddNote,
  onResolve,
  onReopen,
}: PaymentReviewDetailScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl refreshing={isLoading} onRefresh={onRefresh} testID="payment-review-detail-refresh" />
  );

  if (isLoading && !detail) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="payment-review-detail-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('paymentsSettings.reviews.detailLoading')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="payment-review-detail-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{error}</Text>
          <AppButton testID="payment-review-detail-error-retry" title={t('common.actions.retry')} variant="secondary" onPress={onRefresh} />
        </AppCard>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <EmptyState
          testID="payment-review-detail-empty"
          title={t('paymentsSettings.reviews.detailMissingTitle')}
          message={t('paymentsSettings.reviews.detailMissingMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        refreshControl={refreshControl}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          testID="payment-review-detail-header"
          title={t('paymentsSettings.reviews.detailTitle')}
          subtitle={detail.appointment.customerDisplayName}
          onBack={onBack}
        />

        {actionMessage ? (
          <AppCard testID="payment-review-detail-message" style={styles.feedbackCard}>
            <Text style={styles.helperText}>{actionMessage}</Text>
          </AppCard>
        ) : null}

        <AppCard testID="payment-review-detail-summary">
          <Text style={styles.sectionTitle}>{detail.appointment.serviceName}</Text>
          <Text style={styles.metaText}>{formatDateTime(detail.appointment.startAt)}</Text>
          <Text style={styles.metaText}>{formatMoney(detail.payment.amountCents, detail.payment.currency)}</Text>
          <Text style={styles.metaText}>
            {t('paymentsSettings.reviews.labels.paymentState')}: {detail.payment.providerStatus ?? detail.payment.status}
          </Text>
          <Text style={styles.metaText}>
            {t('paymentsSettings.reviews.labels.reviewReason')}: {formatPaymentReviewReason(detail.review.reason, t)}
          </Text>
          <Text style={styles.metaText}>
            {t('paymentsSettings.reviews.labels.reviewStatus')}: {formatPaymentReviewStatus(detail.review.status, t)}
          </Text>
          {detail.review.resolution ? (
            <Text style={styles.metaText}>
              {t('paymentsSettings.reviews.labels.currentResolution')}: {formatPaymentReviewResolution(detail.review.resolution, t)}
            </Text>
          ) : null}
          <Text style={styles.metaText}>{t('paymentsSettings.reviews.operationalExplanation')}</Text>
        </AppCard>

        <AppCard testID="payment-review-detail-actions">
          <Text style={styles.sectionTitle}>{t('paymentsSettings.reviews.actionsTitle')}</Text>
          {detail.allowedActions.canStart ? (
            <AppButton
              testID="payment-review-start"
              title={t('paymentsSettings.reviews.startAction')}
              loading={isSubmitting}
              loadingText={t('paymentsSettings.reviews.submitting')}
              onPress={onStart}
            />
          ) : null}

          <TextInput
            testID="payment-review-note-input"
            style={styles.input}
            value={noteDraft}
            onChangeText={onChangeNote}
            multiline
            placeholder={t('paymentsSettings.reviews.notePlaceholder')}
          />

          {detail.allowedActions.canAddNote ? (
            <AppButton
              testID="payment-review-add-note"
              title={t('paymentsSettings.reviews.addNoteAction')}
              variant="secondary"
              loading={isSubmitting}
              loadingText={t('paymentsSettings.reviews.submitting')}
              onPress={onAddNote}
            />
          ) : null}

          {detail.allowedActions.canResolve ? (
            <View style={styles.stack}>
              <Text style={styles.sectionTitle}>{t('paymentsSettings.reviews.resolveAction')}</Text>
              <View style={styles.optionGrid}>
                {PAYMENT_REVIEW_RESOLUTION_OPTIONS.map((option) => (
                  <AppButton
                    key={option}
                    testID={`payment-review-resolution-${option}`}
                    title={formatPaymentReviewResolution(option, t)}
                    variant={selectedResolution === option ? 'primary' : 'secondary'}
                    onPress={() => onSelectResolution(option)}
                  />
                ))}
              </View>
              {selectedResolution === 'REFUNDED_EXTERNALLY' ? (
                <Text testID="payment-review-external-refund-warning" style={styles.warningText}>
                  {t('paymentsSettings.reviews.externalRefundWarning')}
                </Text>
              ) : null}
              <AppButton
                testID="payment-review-resolve"
                title={t('paymentsSettings.reviews.resolveAction')}
                loading={isSubmitting}
                loadingText={t('paymentsSettings.reviews.submitting')}
                onPress={onResolve}
              />
            </View>
          ) : null}

          {detail.allowedActions.canReopen ? (
            <AppButton
              testID="payment-review-reopen"
              title={t('paymentsSettings.reviews.reopenAction')}
              variant="secondary"
              loading={isSubmitting}
              loadingText={t('paymentsSettings.reviews.submitting')}
              onPress={onReopen}
            />
          ) : null}
        </AppCard>

        <AppCard testID="payment-review-detail-timeline">
          <Text style={styles.sectionTitle}>{t('paymentsSettings.reviews.timelineTitle')}</Text>
          <View style={styles.stack}>
            {detail.timeline.map((item) => (
              <View key={`${item.type}-${item.occurredAt}`} style={styles.timelineRow}>
                <Text style={styles.timelineTitle}>{item.label}</Text>
                <Text style={styles.metaText}>{formatDateTime(item.occurredAt)}</Text>
                {item.detail ? <Text style={styles.metaText}>{item.detail}</Text> : null}
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard testID="payment-review-detail-history">
          <Text style={styles.sectionTitle}>{t('paymentsSettings.reviews.historyTitle')}</Text>
          <View style={styles.stack}>
            {detail.actions.map((action) => (
              <View key={action.id} style={styles.timelineRow} testID={`payment-review-action-${action.id}`}>
                <Text style={styles.timelineTitle}>{action.action}</Text>
                <Text style={styles.metaText}>{formatDateTime(action.createdAt)}</Text>
                {action.note ? <Text style={styles.metaText}>{action.note}</Text> : null}
                {action.resolution ? (
                  <Text style={styles.metaText}>{formatPaymentReviewResolution(action.resolution, t)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </AppCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredCard: {
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  feedbackCard: {
    gap: tokens.spacing[1],
  },
  helperText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
  },
  metaText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  sectionTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
    marginBottom: tokens.spacing[2],
  },
  stack: {
    gap: tokens.spacing[2],
  },
  optionGrid: {
    gap: tokens.spacing[2],
  },
  input: {
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[3],
    color: tokens.colors.textPrimary,
    textAlignVertical: 'top',
  },
  warningText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.warning ?? tokens.colors.error,
  },
  timelineRow: {
    gap: tokens.spacing[1],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.border,
    paddingTop: tokens.spacing[2],
  },
  timelineTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
});
