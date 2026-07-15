import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  EmptyState,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import {
  formatNotificationDateTime,
  getAttemptOutcomeLabel,
  getNotificationStatusLabel,
  getNotificationTypeLabel,
} from '@/lib/notificationOperationsPresentation.js';
import type { NotificationOperationsDetail } from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

export interface NotificationOperationDetailScreenViewProps {
  detail: NotificationOperationsDetail | null;
  isLoading: boolean;
  error: string | null;
  isRetrying: boolean;
  retryError: string | null;
  retrySuccessMessage: string | null;
  canRetry: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onRetry: () => void;
}

export function NotificationOperationDetailScreenView({
  detail,
  isLoading,
  error,
  isRetrying,
  retryError,
  retrySuccessMessage,
  canRetry,
  onBack,
  onRefresh,
  onRetry,
}: NotificationOperationDetailScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isLoading}
      onRefresh={onRefresh}
      testID="notification-detail-refresh"
    />
  );

  if (isLoading && !detail) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="notification-detail-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('notificationsOperations.detailLoading')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="notification-detail-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{error}</Text>
          <AppButton
            testID="notification-detail-error-retry"
            title={t('common.actions.retry')}
            variant="secondary"
            onPress={onRefresh}
          />
        </AppCard>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <EmptyState
          testID="notification-detail-empty"
          title={t('notificationsOperations.detailMissingTitle')}
          message={t('notificationsOperations.detailMissingMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable refreshControl={refreshControl}>
      <ScreenHeader
        testID="notification-detail-header"
        title={t('notificationsOperations.detailTitle')}
        subtitle={detail.customerDisplayName}
        onBack={onBack}
      />

      {retrySuccessMessage ? (
        <AppCard testID="notification-detail-retry-success" style={styles.feedbackCard}>
          <Text style={styles.successText}>{retrySuccessMessage}</Text>
        </AppCard>
      ) : null}

      {retryError ? (
        <AppCard testID="notification-detail-retry-error" style={styles.feedbackCard}>
          <Text style={styles.errorText}>{retryError}</Text>
        </AppCard>
      ) : null}

      <AppCard testID="notification-detail-summary">
        <Text style={styles.titleText}>{getNotificationTypeLabel(detail.type, t)}</Text>
        <Text style={styles.metaText}>{getNotificationStatusLabel(detail.status, t)}</Text>
        <Text style={styles.metaText}>{detail.maskedRecipient}</Text>
        <Text style={styles.metaText}>
          {t('notificationsOperations.labels.scheduledFor')}: {formatNotificationDateTime(detail.scheduledFor)}
        </Text>
        <Text style={styles.metaText}>
          {t('notificationsOperations.labels.appointmentAt')}: {formatNotificationDateTime(detail.appointmentStartAt)}
        </Text>
        <Text style={styles.metaText}>{detail.serviceName} • {detail.employeeName}</Text>
        <Text style={styles.metaText}>
          {t('notificationsOperations.labels.manualRetryCount')}: {detail.manualRetryCount}
        </Text>
        {detail.sentAt ? (
          <Text style={styles.metaText}>
            {t('notificationsOperations.labels.sentAt')}: {formatNotificationDateTime(detail.sentAt)}
          </Text>
        ) : null}
        {detail.cancelledAt ? (
          <Text style={styles.metaText}>
            {t('notificationsOperations.labels.cancelledAt')}: {formatNotificationDateTime(detail.cancelledAt)}
          </Text>
        ) : null}
        {detail.lastManualRetryAt ? (
          <Text style={styles.metaText}>
            {t('notificationsOperations.labels.lastManualRetryAt')}: {formatNotificationDateTime(detail.lastManualRetryAt)}
          </Text>
        ) : null}
        {detail.lastError ? (
          <Text style={styles.errorText} testID="notification-detail-last-error">
            {detail.lastError}
          </Text>
        ) : null}
        {canRetry ? (
          <AppButton
            testID="notification-detail-retry-button"
            title={t('notificationsOperations.retryAction')}
            loading={isRetrying}
            loadingText={t('notificationsOperations.retryScheduling')}
            onPress={onRetry}
            disabled={isRetrying}
          />
        ) : null}
      </AppCard>

      <AppCard testID="notification-detail-attempts">
        <Text style={styles.sectionTitle}>{t('notificationsOperations.attemptHistoryTitle')}</Text>
        {detail.attemptsHistory.length === 0 ? (
          <Text style={styles.metaText}>{t('notificationsOperations.emptyAttempts')}</Text>
        ) : (
          <View style={styles.attemptList}>
            {detail.attemptsHistory.map((attempt) => (
              <View key={attempt.id} style={styles.attemptRow} testID={`notification-attempt-${attempt.id}`}>
                <Text style={styles.attemptTitle}>
                  {t('notificationsOperations.attemptLabel', { count: attempt.attemptNumber })}
                </Text>
                <Text style={styles.metaText}>{getAttemptOutcomeLabel(attempt.outcome, t)}</Text>
                <Text style={styles.metaText}>{formatNotificationDateTime(attempt.attemptedAt)}</Text>
                {attempt.sanitizedError ? (
                  <Text style={styles.errorText}>{attempt.sanitizedError}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredCard: {
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  helperText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  feedbackCard: {
    gap: tokens.spacing[1],
  },
  successText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.primary,
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
  },
  titleText: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
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
  attemptList: {
    gap: tokens.spacing[2],
  },
  attemptRow: {
    gap: tokens.spacing[1],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.border,
    paddingTop: tokens.spacing[2],
  },
  attemptTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
});
