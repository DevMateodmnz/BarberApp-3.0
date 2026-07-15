import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NotificationOperationDetailScreenView } from '@/components/NotificationOperationDetailScreenView.js';
import { useNotificationOperationsStore } from '@/lib/notificationOperationsStore.js';
import { useContextStore } from '@/lib/store.js';

export default function NotificationDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { notificationId } = useLocalSearchParams<{ notificationId?: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);

  const { context, isLoading: isContextLoading, error: contextError, loadContext } =
    useContextStore();
  const {
    detail,
    isDetailLoading,
    detailError,
    isRetryingNotification,
    retryError,
    retryErrorCode,
    loadDetail,
    retryNotification,
    clearDetail,
  } = useNotificationOperationsStore();

  const [retrySuccessMessage, setRetrySuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => () => {
    clearDetail();
  }, [clearDetail]);

  useEffect(() => {
    if (!isSignedIn || context || !getTokenRef.current) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context?.barbershopId || typeof notificationId !== 'string' || !getTokenRef.current) {
      return;
    }

    void loadDetail(getTokenRef.current, context.barbershopId, notificationId);
  }, [context?.barbershopId, loadDetail, notificationId]);

  const mergedError = detailError ?? (!detail ? contextError : null);
  const canRetry = useMemo(
    () => !!detail?.retryEligible && context?.role === 'OWNER',
    [context?.role, detail?.retryEligible],
  );

  useEffect(() => {
    if (!retryErrorCode || retryErrorCode !== 'NOTIFICATION_RETRY_CONFLICT') {
      return;
    }

    setRetrySuccessMessage(null);
  }, [retryErrorCode]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <NotificationOperationDetailScreenView
      detail={detail}
      isLoading={isContextLoading || isDetailLoading}
      error={mergedError}
      isRetrying={isRetryingNotification}
      retryError={retryErrorCode === 'NOTIFICATION_RETRY_CONFLICT'
        ? t('notificationsOperations.retryConflict')
        : retryError}
      retrySuccessMessage={retrySuccessMessage}
      canRetry={canRetry}
      onBack={() => router.back()}
      onRefresh={() => {
        if (!context?.barbershopId || typeof notificationId !== 'string' || !getTokenRef.current) {
          return;
        }
        void loadDetail(getTokenRef.current, context.barbershopId, notificationId);
      }}
      onRetry={() => {
        if (!context?.barbershopId || typeof notificationId !== 'string' || !getTokenRef.current) {
          return;
        }

        Alert.alert(
          t('notificationsOperations.retryConfirmTitle'),
          t('notificationsOperations.retryConfirmMessage'),
          [
            {
              text: t('common.actions.cancel'),
              style: 'cancel',
            },
            {
              text: t('notificationsOperations.retryAction'),
              onPress: async () => {
                setRetrySuccessMessage(null);
                await retryNotification(getTokenRef.current!, context.barbershopId!, notificationId);
                const { retryErrorCode: nextRetryErrorCode } = useNotificationOperationsStore.getState();
                if (!nextRetryErrorCode) {
                  setRetrySuccessMessage(t('notificationsOperations.retryScheduled'));
                }
              },
            },
          ],
        );
      }}
    />
  );
}
