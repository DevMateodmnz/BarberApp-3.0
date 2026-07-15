import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';

import { NotificationOperationsScreenView } from '@/components/NotificationOperationsScreenView.js';
import {
  type NotificationOperationsFilter,
} from '@/lib/notificationOperationsPresentation.js';
import { useNotificationOperationsStore } from '@/lib/notificationOperationsStore.js';
import { useContextStore } from '@/lib/store.js';

export default function NotificationsOperationsScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);

  const { context, isLoading: isContextLoading, error: contextError, loadContext } =
    useContextStore();
  const {
    summary,
    isSummaryLoading,
    summaryError,
    items,
    total,
    query,
    isNotificationsLoading,
    isRefreshingNotifications,
    isLoadingMoreNotifications,
    notificationsError,
    loadSummary,
    loadNotifications,
    loadMoreNotifications,
    refreshNotifications,
  } = useNotificationOperationsStore();

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    if (!isSignedIn || context || !getTokenRef.current) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  const canAccess = useMemo(
    () => !!context?.barbershopId && context.role === 'OWNER',
    [context],
  );

  useEffect(() => {
    if (!canAccess || !context?.barbershopId || !getTokenRef.current) {
      return;
    }

    void Promise.all([
      loadSummary(getTokenRef.current, context.barbershopId),
      loadNotifications(getTokenRef.current, context.barbershopId, query),
    ]);
  }, [canAccess, context?.barbershopId, loadNotifications, loadSummary]);

  useFocusEffect(
    useCallback(() => {
      if (!canAccess || !context?.barbershopId || !getTokenRef.current) {
        return undefined;
      }

      void refreshNotifications(getTokenRef.current, context.barbershopId);
      return undefined;
    }, [canAccess, context?.barbershopId, refreshNotifications]),
  );

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <NotificationOperationsScreenView
      canAccess={canAccess}
      isContextLoading={isContextLoading}
      contextError={contextError}
      summary={summary}
      isSummaryLoading={isSummaryLoading}
      summaryError={summaryError}
      items={items}
      total={total}
      selectedFilter={(query.status as NotificationOperationsFilter | undefined) ?? 'ALL'}
      isNotificationsLoading={isNotificationsLoading}
      isRefreshingNotifications={isRefreshingNotifications}
      isLoadingMoreNotifications={isLoadingMoreNotifications}
      notificationsError={notificationsError}
      onBack={() => router.back()}
      onRefresh={() => {
        if (!context?.barbershopId || !getTokenRef.current) {
          return;
        }
        void refreshNotifications(getTokenRef.current, context.barbershopId);
      }}
      onRetry={() => {
        if (!context?.barbershopId || !getTokenRef.current) {
          return;
        }
        void Promise.all([
          loadSummary(getTokenRef.current, context.barbershopId),
          loadNotifications(getTokenRef.current, context.barbershopId, query),
        ]);
      }}
      onFilterChange={(filter) => {
        if (!context?.barbershopId || !getTokenRef.current) {
          return;
        }
        void loadNotifications(getTokenRef.current, context.barbershopId, {
          ...query,
          status: filter,
        });
      }}
      onOpenNotification={(notificationId) => {
        router.push({
          pathname: '/(tabs)/notification-detail',
          params: { notificationId },
        });
      }}
      onLoadMore={() => {
        if (!getTokenRef.current) {
          return;
        }
        void loadMoreNotifications(getTokenRef.current);
      }}
    />
  );
}
