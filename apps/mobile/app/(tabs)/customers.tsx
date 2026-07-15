import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

import { CustomersScreenView } from '@/components/CustomersScreenView.js';
import {
  createCustomerSearchScheduler,
  CUSTOMER_SEARCH_DEBOUNCE_MS,
} from '@/lib/customerSearchScheduler.js';
import { useCustomersStore } from '@/lib/customersStore.js';
import { useContextStore } from '@/lib/store.js';
import type { CustomerDirectorySort } from '@/lib/types.js';

export default function CustomersScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const searchSchedulerRef = useRef(
    createCustomerSearchScheduler(CUSTOMER_SEARCH_DEBOUNCE_MS)
  );

  const { context, isLoading: isContextLoading, error: contextError, loadContext } =
    useContextStore();
  const {
    items,
    total,
    sort,
    customersError,
    isCustomersLoading,
    isRefreshingCustomers,
    isLoadingMoreCustomers,
    loadCustomers,
    loadMoreCustomers,
    refreshCustomers,
  } = useCustomersStore();

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => () => {
    searchSchedulerRef.current.cancel();
  }, []);

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  const canAccessDirectory = useMemo(
    () =>
      !!context
      && !!context.barbershopId
      && (context.role === 'OWNER' || context.role === 'BARBER'),
    [context]
  );

  useEffect(() => {
    if (!canAccessDirectory || !context?.barbershopId || !getTokenRef.current) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      searchSchedulerRef.current.cancel();
      void loadCustomers(getTokenRef.current, context.barbershopId, {
        query: '',
        sort,
        page: 1,
      });
      return;
    }

    searchSchedulerRef.current.schedule(query, (scheduledQuery) => {
      if (!getTokenRef.current || !context.barbershopId) {
        return;
      }

      void loadCustomers(getTokenRef.current, context.barbershopId, {
        query: scheduledQuery,
        sort,
        page: 1,
      });
    });
  }, [canAccessDirectory, context?.barbershopId, loadCustomers, searchQuery, sort]);

  const handleSortChange = useCallback(
    (nextSort: CustomerDirectorySort) => {
      if (!context?.barbershopId || !getTokenRef.current) {
        return;
      }

      void loadCustomers(getTokenRef.current, context.barbershopId, {
        query: searchQuery.trim(),
        sort: nextSort,
        page: 1,
      });
    },
    [context?.barbershopId, loadCustomers, searchQuery]
  );

  const handleRefresh = useCallback(() => {
    if (!context?.barbershopId || !getTokenRef.current) {
      return;
    }

    void refreshCustomers(getTokenRef.current, context.barbershopId);
  }, [context?.barbershopId, refreshCustomers]);

  const handleLoadMore = useCallback(() => {
    if (!context?.barbershopId || !getTokenRef.current) {
      return;
    }

    void loadMoreCustomers(getTokenRef.current, context.barbershopId);
  }, [context?.barbershopId, loadMoreCustomers]);

  const handleRetry = useCallback(() => {
    if (!context?.barbershopId || !getTokenRef.current) {
      return;
    }

    void loadCustomers(getTokenRef.current, context.barbershopId, {
      query: searchQuery.trim(),
      sort,
      page: 1,
    });
  }, [context?.barbershopId, loadCustomers, searchQuery, sort]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <CustomersScreenView
      canAccessDirectory={canAccessDirectory}
      isContextLoading={isContextLoading}
      contextError={contextError}
      searchQuery={searchQuery}
      sort={sort}
      items={items}
      total={total}
      isCustomersLoading={isCustomersLoading}
      isRefreshingCustomers={isRefreshingCustomers}
      isLoadingMoreCustomers={isLoadingMoreCustomers}
      customersError={customersError}
      onBack={() => router.back()}
      onSearchChange={setSearchQuery}
      onClearSearch={() => setSearchQuery('')}
      onSortChange={handleSortChange}
      onRefresh={handleRefresh}
      onRetry={handleRetry}
      onLoadMore={handleLoadMore}
      onOpenCustomer={(customerId) => {
        router.push({
          pathname: '/(tabs)/customer-detail',
          params: { customerId },
        });
      }}
    />
  );
}
