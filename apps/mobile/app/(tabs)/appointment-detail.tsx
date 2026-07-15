import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppointmentDetailScreenView, type AppointmentDetailActionViewModel } from '@/components/AppointmentDetailScreenView.js';
import { getAppointmentTransitionLabel } from '@/i18n/index.js';
import { buildAppointmentNotificationLabels, canRescheduleAppointment, getAvailableAppointmentTransitions } from '@/lib/appointmentActions.js';
import {
  cancelAppointment as cancelAppointmentApi,
  fetchAppointment,
  fetchAppointmentChanges,
  fetchAppointmentNotifications,
  transitionAppointmentStatus,
} from '@/lib/appointments.js';
import { useAppointmentsStore } from '@/lib/appointmentsStore.js';
import { formatBusinessDateLabel, formatRecordTime } from '@/lib/format.js';
import { useScheduleBoardStore } from '@/lib/scheduleBoardStore.js';
import { useContextStore } from '@/lib/store.js';
import type { Appointment, AppointmentChange, AppointmentNotificationSummary } from '@/lib/types.js';

export default function AppointmentDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const context = useContextStore((state) => state.context);
  const reloadLastAppointments = useAppointmentsStore((state) => state.reloadLastAppointments);
  const reloadLastScheduleBoard = useScheduleBoardStore((state) => state.reloadLastScheduleBoard);

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [changes, setChanges] = useState<AppointmentChange[]>([]);
  const [notifications, setNotifications] = useState<AppointmentNotificationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (typeof appointmentId !== 'string' || !getTokenRef.current) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextAppointment, nextChanges, nextNotifications] = await Promise.all([
        fetchAppointment(getTokenRef.current, appointmentId),
        fetchAppointmentChanges(getTokenRef.current, appointmentId),
        fetchAppointmentNotifications(getTokenRef.current, appointmentId),
      ]);

      setAppointment(nextAppointment);
      setChanges(nextChanges);
      setNotifications(nextNotifications);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi'));
      setAppointment(null);
      setChanges([]);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [appointmentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return undefined;
    }, [load]),
  );

  const handleMutation = useCallback(async (
    action: () => Promise<void>,
  ) => {
    if (!getTokenRef.current) {
      return;
    }

    setIsMutating(true);
    setError(null);

    try {
      await action();
      await Promise.all([
        reloadLastAppointments(getTokenRef.current),
        reloadLastScheduleBoard(getTokenRef.current),
        load(),
      ]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('errors.unknownApi'));
    } finally {
      setIsMutating(false);
    }
  }, [load, reloadLastAppointments, reloadLastScheduleBoard, t]);

  const actions = useMemo<AppointmentDetailActionViewModel[]>(() => {
    if (!appointment) {
      return [];
    }

    const nextActions: AppointmentDetailActionViewModel[] = [];

    if (canRescheduleAppointment(appointment)) {
      nextActions.push({
        id: 'reschedule',
        label: t('appointments.rescheduleAction'),
        variant: 'secondary',
        testID: 'appointment-detail-reschedule',
        onPress: () => {
          router.push({
            pathname: '/(tabs)/appointments-reschedule',
            params: { appointmentId: appointment.id },
          });
        },
      });
    }

    for (const targetStatus of getAvailableAppointmentTransitions(context, appointment.status)) {
      nextActions.push({
        id: targetStatus,
        label: getAppointmentTransitionLabel(targetStatus),
        variant: targetStatus === 'CANCELLED' ? 'danger' : 'secondary',
        testID: `appointment-detail-action-${targetStatus}`,
        onPress: () => {
          void handleMutation(async () => {
            if (!getTokenRef.current) {
              return;
            }

            if (targetStatus === 'CANCELLED') {
              await cancelAppointmentApi(getTokenRef.current, appointment.id);
              return;
            }

            await transitionAppointmentStatus(getTokenRef.current, appointment.id, targetStatus);
          });
        },
      });
    }

    return nextActions;
  }, [appointment, context, handleMutation, router, t]);

  const notificationLabels = useMemo(
    () => buildAppointmentNotificationLabels(notifications, t),
    [notifications, t],
  );

  const notificationRows = useMemo(() => notifications.map((notification, index) => ({
    id: notification.id,
    label: notificationLabels[index] ?? t('appointments.notification.deliveryError'),
    meta: formatBusinessDateLabel(notification.scheduledFor.slice(0, 10)),
  })), [notificationLabels, notifications, t]);

  const changeRows = useMemo(() => changes.map((change) => ({
    id: change.id,
    title: t('appointmentReschedule.historyItemTitle'),
    body: `${formatBusinessDateLabel(change.previousStartAt.slice(0, 10))} ${formatRecordTime(change.previousStartAt) ?? '--:--'} → ${formatBusinessDateLabel(change.newStartAt.slice(0, 10))} ${formatRecordTime(change.newStartAt) ?? '--:--'}`,
    meta: change.changedByDisplayName,
  })), [changes, t]);

  const summaryTimeLabel = appointment
    ? `${formatBusinessDateLabel(appointment.startAt.slice(0, 10))} · ${formatRecordTime(appointment.startAt) ?? '--:--'}–${formatRecordTime(appointment.endAt) ?? '--:--'}`
    : null;
  const employeeDisplayLabel = appointment
    ? t('appointments.employeeLabel', {
      name: appointment.employee.user.name ?? t('common.states.unknown'),
    })
    : null;

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <AppointmentDetailScreenView
      appointment={appointment}
      summaryTimeLabel={summaryTimeLabel}
      employeeDisplayLabel={employeeDisplayLabel}
      changeRows={changeRows}
      notificationRows={notificationRows}
      actions={actions}
      isLoading={isLoading}
      error={error}
      isMutating={isMutating}
      onBack={() => router.back()}
    />
  );
}
