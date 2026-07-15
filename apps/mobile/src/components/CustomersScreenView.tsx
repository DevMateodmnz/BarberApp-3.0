import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  ListItem,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import { formatLocalizedDate } from '@/i18n/index.js';
import { tokens } from '@/theme/index.js';

import type { CustomerDirectorySort, CustomerSummary } from '@/lib/types.js';

export interface CustomersScreenViewProps {
  canAccessDirectory: boolean;
  isContextLoading: boolean;
  contextError: string | null;
  searchQuery: string;
  sort: CustomerDirectorySort;
  items: CustomerSummary[];
  total: number;
  isCustomersLoading: boolean;
  isRefreshingCustomers: boolean;
  isLoadingMoreCustomers: boolean;
  customersError: string | null;
  onBack: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSortChange: (sort: CustomerDirectorySort) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenCustomer: (customerId: string) => void;
}

function formatCustomerDate(date: string): string {
  return formatLocalizedDate(date.slice(0, 10), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) ?? date;
}

function buildSubtitle(
  customer: CustomerSummary,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const parts = [
    customer.phone,
    `${t('customers.labels.lastVisit')}: ${formatCustomerDate(customer.lastSeenAt)}`,
  ];

  if (customer.lastServiceName) {
    parts.push(customer.lastServiceName);
  }

  return parts.join(' • ');
}

export function CustomersScreenView({
  canAccessDirectory,
  isContextLoading,
  contextError,
  searchQuery,
  sort,
  items,
  total,
  isCustomersLoading,
  isRefreshingCustomers,
  isLoadingMoreCustomers,
  customersError,
  onBack,
  onSearchChange,
  onClearSearch,
  onSortChange,
  onRefresh,
  onRetry,
  onLoadMore,
  onOpenCustomer,
}: CustomersScreenViewProps) {
  const { t } = useTranslation();
  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshingCustomers}
      onRefresh={onRefresh}
      testID="customers-refresh"
    />
  );

  if (isContextLoading && !canAccessDirectory) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="customers-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (contextError && !canAccessDirectory) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <AppCard testID="customers-context-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!canAccessDirectory) {
    return (
      <Screen scrollable refreshControl={refreshControl}>
        <EmptyState
          testID="customers-blocked"
          title={t('customers.blockedTitle')}
          message={t('customers.blockedMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable refreshControl={refreshControl}>
      <ScreenHeader
        testID="customers-header"
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        onBack={onBack}
      />

      <AppCard>
        <View style={styles.searchRow}>
          <AppTextInput
            testID="customers-search-input"
            label={t('customers.labels.search')}
            placeholder={t('customers.searchPlaceholder')}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCorrect={false}
            style={styles.searchInput}
          />
          {searchQuery.trim().length > 0 ? (
            <AppButton
              testID="customers-search-clear"
              title={t('common.actions.clear')}
              variant="ghost"
              onPress={onClearSearch}
              accessibilityLabel={t('customers.accessibility.clearSearch')}
            />
          ) : null}
        </View>
      </AppCard>

      <View style={styles.filterBar} testID="customers-sort-bar">
        {(['recent', 'name', 'no_shows'] as const).map((value) => (
          <AppButton
            key={value}
            testID={`customers-sort-${value}`}
            title={t(`customers.sort.${value}`)}
            variant={sort === value ? 'primary' : 'secondary'}
            onPress={() => onSortChange(value)}
          />
        ))}
      </View>

      {isCustomersLoading && items.length === 0 ? (
        <AppCard testID="customers-list-loading" style={styles.centeredCard}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('customers.loading')}</Text>
        </AppCard>
      ) : null}

      {customersError ? (
        <AppCard testID="customers-error">
          <Text style={styles.errorText}>{customersError}</Text>
          <AppButton
            testID="customers-error-retry"
            title={t('common.actions.retry')}
            variant="secondary"
            onPress={onRetry}
          />
        </AppCard>
      ) : null}

      {!isCustomersLoading && !customersError && items.length === 0 ? (
        <EmptyState
          testID="customers-empty"
          title={t('customers.emptyTitle')}
          message={
            searchQuery.trim().length > 0
              ? t('customers.emptySearchMessage')
              : t('customers.emptyMessage')
          }
        />
      ) : null}

      {items.length > 0 ? (
        <AppCard testID="customers-list">
          <Text style={styles.metaText} testID="customers-total">
            {t('customers.labels.results', { count: total })}
          </Text>
          <View style={styles.listStack}>
            {items.map((customer) => (
              <ListItem
                key={customer.id}
                testID={`customer-row-${customer.id}`}
                title={customer.name}
                subtitle={buildSubtitle(customer, t)}
                accessibilityRole="button"
                accessibilityLabel={t('customers.accessibility.openCustomer', {
                  name: customer.name,
                })}
                onPress={() => onOpenCustomer(customer.id)}
                trailing={(
                  <View style={styles.trailingColumn}>
                    {customer.noShowCount > 0 ? (
                      <Text style={styles.noShowBadge}>
                        {t('customers.labels.noShows', {
                          count: customer.noShowCount,
                        })}
                      </Text>
                    ) : null}
                    {customer.upcomingCount > 0 ? (
                      <Text style={styles.upcomingBadge}>
                        {t('customers.labels.upcoming')}
                      </Text>
                    ) : null}
                  </View>
                )}
              />
            ))}
          </View>
        </AppCard>
      ) : null}

      {items.length > 0 && items.length < total ? (
        <AppButton
          testID="customers-load-more"
          title={t('customers.loadMore')}
          loading={isLoadingMoreCustomers}
          loadingText={t('customers.loadingMore')}
          onPress={onLoadMore}
          disabled={isLoadingMoreCustomers}
        />
      ) : null}
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
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
  },
  searchRow: {
    gap: tokens.spacing[2],
  },
  searchInput: {
    width: '100%',
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
  trailingColumn: {
    alignItems: 'flex-end',
    gap: tokens.spacing[1],
  },
  noShowBadge: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.error,
    fontWeight: tokens.typography.weight.semibold,
  },
  upcomingBadge: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primary,
    fontWeight: tokens.typography.weight.semibold,
  },
});
