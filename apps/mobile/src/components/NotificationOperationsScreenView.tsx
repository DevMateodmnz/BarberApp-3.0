import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  EmptyState,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '@/components/ui/index.js';
import {
  formatNotificationDateTime,
  getFilterLabel,
  getNotificationStatusLabel,
  getNotificationTypeLabel,
  type NotificationOperationsFilter,
} from '@/lib/notificationOperationsPresentation.js';
import type {
  NotificationOperationsListItem,
  NotificationOperationsSummary,
} from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

export interface NotificationOperationsScreenViewProps {
  canAccess: boolean;
  isContextLoading: boolean;
  contextError: string | null;
  summary: NotificationOperationsSummary | null;
  isSummaryLoading: boolean;
  summaryError: string | null;
  items: NotificationOperationsListItem[];
  total: number;
  selectedFilter: NotificationOperationsFilter;
  isNotificationsLoading: boolean;
  isRefreshingNotifications: boolean;
  isLoadingMoreNotifications: boolean;
  notificationsError: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onFilterChange: (filter: NotificationOperationsFilter) => void;
  onOpenNotification: (notificationId: string) => void;
  onLoadMore: () => void;
}

export function NotificationOperationsScreenView({
  canAccess,
  isContextLoading,
  contextError,
  summary,
  isSummaryLoading,
  summaryError,
  items,
  total,
  selectedFilter,
  isNotificationsLoading,
  isRefreshingNotifications,
  isLoadingMoreNotifications,
  notificationsError,
  onBack,
  onRefresh,
  onRetry,
  onFilterChange,
  onOpenNotification,
  onLoadMore,
}: NotificationOperationsScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshingNotifications}
      onRefresh={onRefresh}
      testID="notifications-operations-refresh"
    />
  );

  if (isContextLoading && !canAccess) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="notifications-operations-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (contextError && !canAccess) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="notifications-operations-context-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!canAccess) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <EmptyState
          testID="notifications-operations-blocked"
          title={t('notificationsOperations.blockedTitle')}
          message={t('notificationsOperations.blockedMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable refreshControl={refreshControl}>
      <ScreenHeader
        testID="notifications-operations-header"
        title={t('notificationsOperations.title')}
        subtitle={t('notificationsOperations.subtitle')}
        onBack={onBack}
      />

      <AppCard testID="notifications-operations-summary">
        <SectionHeader title={t('notificationsOperations.summaryTitle')} />
        {isSummaryLoading && !summary ? (
          <View style={styles.inlineState}>
            <ActivityIndicator size="small" color={tokens.colors.primary} />
            <Text style={styles.helperText}>{t('notificationsOperations.loadingSummary')}</Text>
          </View>
        ) : null}
        {summaryError ? (
          <View style={styles.inlineState}>
            <Text style={styles.errorText}>{summaryError}</Text>
            <AppButton
              testID="notifications-operations-summary-retry"
              title={t('common.actions.retry')}
              variant="secondary"
              onPress={onRetry}
            />
          </View>
        ) : null}
        {summary ? (
          <View style={styles.summaryGrid}>
            <SummaryMetricCard
              testID="notifications-summary-pending"
              label={t('notificationsOperations.summary.pending')}
              value={summary.pending}
            />
            <SummaryMetricCard
              testID="notifications-summary-sent"
              label={t('notificationsOperations.summary.sent')}
              value={summary.sent}
            />
            <SummaryMetricCard
              testID="notifications-summary-failed"
              label={t('notificationsOperations.summary.failed')}
              value={summary.failed}
            />
            <SummaryMetricCard
              testID="notifications-summary-cancelled"
              label={t('notificationsOperations.summary.cancelled')}
              value={summary.cancelled}
            />
          </View>
        ) : null}
      </AppCard>

      <View style={styles.filterBar} testID="notifications-operations-filter-bar">
        {(['ALL', 'PENDING', 'SENT', 'FAILED', 'CANCELLED'] as const).map((filter) => (
          <AppButton
            key={filter}
            testID={`notifications-filter-${filter}`}
            title={getFilterLabel(filter, t)}
            variant={selectedFilter === filter ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => onFilterChange(filter)}
          />
        ))}
      </View>

      {isNotificationsLoading && items.length === 0 ? (
        <AppCard testID="notifications-operations-list-loading" style={styles.centeredCard}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('notificationsOperations.loadingList')}</Text>
        </AppCard>
      ) : null}

      {notificationsError ? (
        <AppCard testID="notifications-operations-error">
          <Text style={styles.errorText}>{notificationsError}</Text>
          <AppButton
            testID="notifications-operations-error-retry"
            title={t('common.actions.retry')}
            variant="secondary"
            onPress={onRetry}
          />
        </AppCard>
      ) : null}

      {!isNotificationsLoading && !notificationsError && items.length === 0 ? (
        <EmptyState
          testID="notifications-operations-empty"
          title={t('notificationsOperations.emptyTitle')}
          message={t('notificationsOperations.emptyMessage')}
        />
      ) : null}

      {items.length > 0 ? (
        <AppCard testID="notifications-operations-list">
          <Text style={styles.metaText} testID="notifications-operations-total">
            {t('notificationsOperations.results', { count: total })}
          </Text>
          <View style={styles.listStack}>
            {items.map((item) => (
              <AppCard
                key={item.id}
                testID={`notification-row-${item.id}`}
                variant="outlined"
                style={styles.rowCard}
              >
                <AppButton
                  testID={`notification-open-${item.id}`}
                  title={item.customerDisplayName}
                  variant="ghost"
                  onPress={() => onOpenNotification(item.id)}
                  style={styles.rowButton}
                  accessibilityLabel={t('notificationsOperations.accessibility.openNotification', {
                    customer: item.customerDisplayName,
                  })}
                />
                <Text style={styles.rowMeta}>{item.maskedRecipient}</Text>
                <Text style={styles.rowMeta}>
                  {getNotificationTypeLabel(item.type, t)} • {getNotificationStatusLabel(item.status, t)}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatNotificationDateTime(item.appointmentStartAt)} • {item.serviceName} • {item.employeeName}
                </Text>
                {item.status === 'FAILED' ? (
                  <Text style={styles.failureText}>
                    {t('notificationsOperations.attemptsLabel', { count: item.attempts })}
                  </Text>
                ) : null}
                {item.status === 'PENDING' && item.attempts > 0 ? (
                  <Text style={styles.pendingText}>
                    {t('notificationsOperations.nextRetryAt', {
                      value: formatNotificationDateTime(item.nextAttemptAt),
                    })}
                  </Text>
                ) : null}
              </AppCard>
            ))}
          </View>
        </AppCard>
      ) : null}

      {items.length > 0 && items.length < total ? (
        <AppButton
          testID="notifications-operations-load-more"
          title={t('notificationsOperations.loadMore')}
          loading={isLoadingMoreNotifications}
          loadingText={t('notificationsOperations.loadingMore')}
          onPress={onLoadMore}
          disabled={isLoadingMoreNotifications}
        />
      ) : null}
    </Screen>
  );
}

function SummaryMetricCard({
  label,
  value,
  testID,
}: {
  label: string;
  value: number;
  testID: string;
}) {
  return (
    <AppCard testID={testID} style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </AppCard>
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
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
  },
  inlineState: {
    gap: tokens.spacing[2],
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  metricCard: {
    flexBasis: '47%',
  },
  metricValue: {
    ...tokens.typography.variant.heading,
    color: tokens.colors.textPrimary,
  },
  metricLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  metaText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing[2],
  },
  listStack: {
    gap: tokens.spacing[2],
  },
  rowCard: {
    gap: tokens.spacing[1],
  },
  rowButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
  },
  rowMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  failureText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.error,
    fontWeight: tokens.typography.weight.semibold,
  },
  pendingText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primary,
    fontWeight: tokens.typography.weight.semibold,
  },
});
