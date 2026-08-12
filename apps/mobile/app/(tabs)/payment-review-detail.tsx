import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PaymentReviewDetailScreenView } from '@/components/PaymentReviewDetailScreenView.js';
import {
  addPaymentReviewNote,
  fetchPaymentReviewDetail,
  reopenPaymentReview,
  resolvePaymentReview,
  startPaymentReview,
} from '@/lib/paymentReviews.js';
import type { PaymentReviewDetail, PaymentReviewResolution } from '@/lib/types.js';
import { useContextStore } from '@/lib/store.js';

export default function PaymentReviewDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { reviewId } = useLocalSearchParams<{ reviewId?: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();

  const [detail, setDetail] = useState<PaymentReviewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedResolution, setSelectedResolution] = useState<PaymentReviewResolution>('REFUNDED_EXTERNALLY');

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    if (!isSignedIn || context || !getTokenRef.current) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  async function load() {
    if (!context?.barbershopId || typeof reviewId !== 'string' || !getTokenRef.current) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextDetail = await fetchPaymentReviewDetail(getTokenRef.current, context.barbershopId, reviewId);
      setDetail(nextDetail);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [context?.barbershopId, reviewId]);

  async function runMutation(run: () => Promise<PaymentReviewDetail>, successMessage: string) {
    setIsSubmitting(true);
    setActionMessage(null);
    try {
      const nextDetail = await run();
      setDetail(nextDetail);
      setNoteDraft('');
      setActionMessage(successMessage);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : t('errors.unknownApi');
      setActionMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const mergedError = error ?? (!detail ? contextError : null);
  const canMutate = Boolean(context?.barbershopId && typeof reviewId === 'string' && getTokenRef.current);

  return (
    <PaymentReviewDetailScreenView
      detail={detail}
      isLoading={isContextLoading || isLoading}
      error={mergedError}
      isSubmitting={isSubmitting}
      actionMessage={actionMessage}
      noteDraft={noteDraft}
      onChangeNote={setNoteDraft}
      selectedResolution={selectedResolution}
      onSelectResolution={setSelectedResolution}
      onBack={() => router.back()}
      onRefresh={() => { void load(); }}
      onStart={() => {
        if (!canMutate || !context?.barbershopId || typeof reviewId !== 'string') return;
        Alert.alert(
          t('paymentsSettings.reviews.startAction'),
          t('paymentsSettings.reviews.startConfirm'),
          [
            { text: t('common.actions.cancel'), style: 'cancel' },
            {
              text: t('paymentsSettings.reviews.startAction'),
              onPress: () => void runMutation(
                () => startPaymentReview(getTokenRef.current!, context.barbershopId!, reviewId),
                t('paymentsSettings.reviews.startSuccess'),
              ),
            },
          ],
        );
      }}
      onAddNote={() => {
        if (!canMutate || !context?.barbershopId || typeof reviewId !== 'string') return;
        void runMutation(
          () => addPaymentReviewNote(getTokenRef.current!, context.barbershopId!, reviewId, noteDraft),
          t('paymentsSettings.reviews.noteSuccess'),
        );
      }}
      onResolve={() => {
        if (!canMutate || !context?.barbershopId || typeof reviewId !== 'string') return;
        Alert.alert(
          t('paymentsSettings.reviews.resolveAction'),
          t('paymentsSettings.reviews.resolveConfirm'),
          [
            { text: t('common.actions.cancel'), style: 'cancel' },
            {
              text: t('paymentsSettings.reviews.resolveAction'),
              onPress: () => void runMutation(
                () => resolvePaymentReview(getTokenRef.current!, context.barbershopId!, reviewId, selectedResolution, noteDraft || undefined),
                t('paymentsSettings.reviews.resolveSuccess'),
              ),
            },
          ],
        );
      }}
      onReopen={() => {
        if (!canMutate || !context?.barbershopId || typeof reviewId !== 'string') return;
        Alert.alert(
          t('paymentsSettings.reviews.reopenAction'),
          t('paymentsSettings.reviews.reopenConfirm'),
          [
            { text: t('common.actions.cancel'), style: 'cancel' },
            {
              text: t('paymentsSettings.reviews.reopenAction'),
              onPress: () => void runMutation(
                () => reopenPaymentReview(getTokenRef.current!, context.barbershopId!, reviewId, noteDraft || undefined),
                t('paymentsSettings.reviews.reopenSuccess'),
              ),
            },
          ],
        );
      }}
    />
  );
}
