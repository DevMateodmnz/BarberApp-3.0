import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmployeeScheduleScreenView, type EmployeeScheduleDayRowViewModel } from '@/components/EmployeeScheduleScreenView.js';
import {
  deleteEmployeeScheduleException,
  fetchEmployeeSchedule,
  putEmployeeSchedule,
  putEmployeeScheduleException,
} from '@/lib/employeeSchedules.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { formatLocalizedWeekday } from '@/i18n/index.js';
import { useContextStore } from '@/lib/store.js';
import type { EmployeeScheduleDetail, EmployeeScheduleMode, EmployeeScheduleWeeklyInterval } from '@/lib/types.js';
import { ApiError } from '@/lib/api.js';

const TIME_REGEX = /^\d{2}:\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface EditableDay {
  dayOfWeek: number;
  isActive: boolean;
  start: string;
  end: string;
}

function blankDay(dayOfWeek: number): EditableDay {
  return { dayOfWeek, isActive: false, start: '', end: '' };
}

function mergeWeeklyIntervals(intervals: EmployeeScheduleWeeklyInterval[]): EditableDay[] {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => blankDay(dayOfWeek));
  for (const interval of intervals) {
    days[interval.dayOfWeek] = {
      dayOfWeek: interval.dayOfWeek,
      isActive: true,
      start: interval.start,
      end: interval.end,
    };
  }
  return days;
}

function validateDay(day: EditableDay, t: (key: string) => string): string | null {
  if (!day.isActive) {
    return null;
  }

  if (!TIME_REGEX.test(day.start)) {
    return t('employeeSchedules.errors.invalidStart');
  }

  if (!TIME_REGEX.test(day.end)) {
    return t('employeeSchedules.errors.invalidEnd');
  }

  if (day.end <= day.start) {
    return t('employeeSchedules.errors.endBeforeStart');
  }

  return null;
}

function mapScheduleError(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'EMPLOYEE_SCHEDULE_VERSION_CONFLICT':
        return t('employeeSchedules.errors.stale');
      case 'EMPLOYEE_SCHEDULE_OUTSIDE_BARBERSHOP_HOURS':
        return t('employeeSchedules.errors.outsideBarbershop');
      case 'EMPLOYEE_TIME_OFF':
        return t('employeeSchedules.errors.timeOff');
      case 'EMPLOYEE_NOT_WORKING':
        return t('employeeSchedules.errors.notWorking');
      case 'EMPLOYEE_SCHEDULE_CONFLICT':
        return t('employeeSchedules.errors.scheduleConflict');
      case 'BARBERSHOP_CLOSED':
        return t('employeeSchedules.errors.barbershopClosed');
      case 'FORBIDDEN_EMPLOYEE_SCOPE':
      case 'NOT_FOUND':
        return t('employeeSchedules.errors.notFound');
      default:
        return error.message;
    }
  }

  return error instanceof Error ? error.message : t('errors.unknownApi');
}

export default function EmployeeScheduleScreen() {
  const router = useRouter();
  const { employeeId: routeEmployeeId } = useLocalSearchParams<{ employeeId?: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  const { t } = useTranslation();

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();

  const [schedule, setSchedule] = useState<EmployeeScheduleDetail | null>(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [mode, setMode] = useState<EmployeeScheduleMode>('INHERIT_BARBERSHOP');
  const [days, setDays] = useState<EditableDay[]>(() => mergeWeeklyIntervals([]));
  const [dayErrors, setDayErrors] = useState<Record<number, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionType, setExceptionType] = useState<'FULL_DAY_OFF' | 'CUSTOM_HOURS'>('FULL_DAY_OFF');
  const [exceptionStart, setExceptionStart] = useState('');
  const [exceptionEnd, setExceptionEnd] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionError, setExceptionError] = useState<string | null>(null);
  const [exceptionSaving, setExceptionSaving] = useState(false);
  const [deletingExceptionDate, setDeletingExceptionDate] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  const targetEmployeeId = routeEmployeeId ?? context?.employeeId ?? null;
  const barbershopId = context?.barbershopId ?? null;
  const isOwner = context?.role === 'OWNER';
  const isReadOnly = !isOwner;

  const applySchedule = useCallback((nextSchedule: EmployeeScheduleDetail) => {
    setSchedule(nextSchedule);
    setMode(nextSchedule.scheduleMode);
    setDays(mergeWeeklyIntervals(nextSchedule.weeklyIntervals));
    setDayErrors({});
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!getTokenRef.current || !barbershopId || !targetEmployeeId) {
      return;
    }

    setIsScheduleLoading(true);
    setScheduleError(null);
    try {
      const nextSchedule = await fetchEmployeeSchedule(
        getTokenRef.current,
        barbershopId,
        targetEmployeeId,
      );
      applySchedule(nextSchedule);
    } catch (error) {
      setScheduleError(mapScheduleError(error, t));
    } finally {
      setIsScheduleLoading(false);
    }
  }, [applySchedule, barbershopId, t, targetEmployeeId]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const handleCopyFromBarbershop = useCallback(() => {
    if (!schedule) {
      return;
    }

    setMode('CUSTOM');
    setDays(mergeWeeklyIntervals(schedule.barbershopWeeklyIntervals));
    setSaveError(null);
  }, [schedule]);

  const handleSave = useCallback(async () => {
    if (!getTokenRef.current || !barbershopId || !targetEmployeeId || !schedule) {
      return;
    }

    setSaveError(null);
    setConflictMessage(null);

    const nextErrors: Record<number, string | null> = {};
    let hasErrors = false;
    for (const day of days) {
      const error = validateDay(day, t);
      if (error) {
        nextErrors[day.dayOfWeek] = error;
        hasErrors = true;
      }
    }
    if (hasErrors) {
      setDayErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const nextSchedule = await putEmployeeSchedule(
        getTokenRef.current,
        barbershopId,
        targetEmployeeId,
        {
          mode,
          expectedUpdatedAt: schedule.expectedUpdatedAt,
          weeklyIntervals:
            mode === 'CUSTOM'
              ? days
                .filter((day) => day.isActive)
                .map((day) => ({
                  dayOfWeek: day.dayOfWeek,
                  start: day.start,
                  end: day.end,
                }))
              : [],
        },
      );
      applySchedule(nextSchedule);
      useFlashStore.getState().setMessage(t('employeeSchedules.feedback.scheduleSaved'));
      if (nextSchedule.conflictingFutureAppointmentsCount > 0) {
        setConflictMessage(t('employeeSchedules.feedback.conflictsRemain'));
      }
    } catch (error) {
      setSaveError(mapScheduleError(error, t));
    } finally {
      setSaving(false);
    }
  }, [applySchedule, barbershopId, days, mode, schedule, t, targetEmployeeId]);

  const handleSaveException = useCallback(async () => {
    if (!getTokenRef.current || !barbershopId || !targetEmployeeId) {
      return;
    }

    setExceptionError(null);
    setConflictMessage(null);

    if (!DATE_REGEX.test(exceptionDate)) {
      setExceptionError(t('employeeSchedules.errors.invalidDate'));
      return;
    }

    if (exceptionType === 'CUSTOM_HOURS') {
      if (!TIME_REGEX.test(exceptionStart)) {
        setExceptionError(t('employeeSchedules.errors.invalidStart'));
        return;
      }
      if (!TIME_REGEX.test(exceptionEnd)) {
        setExceptionError(t('employeeSchedules.errors.invalidEnd'));
        return;
      }
      if (exceptionEnd <= exceptionStart) {
        setExceptionError(t('employeeSchedules.errors.endBeforeStart'));
        return;
      }
    }

    setExceptionSaving(true);
    try {
      const nextSchedule = await putEmployeeScheduleException(
        getTokenRef.current,
        barbershopId,
        targetEmployeeId,
        exceptionDate,
        {
          type: exceptionType,
          reason: exceptionReason,
          intervals:
            exceptionType === 'CUSTOM_HOURS'
              ? [{ start: exceptionStart, end: exceptionEnd }]
              : undefined,
        },
      );
      applySchedule(nextSchedule);
      setExceptionDate('');
      setExceptionStart('');
      setExceptionEnd('');
      setExceptionReason('');
      useFlashStore.getState().setMessage(t('employeeSchedules.feedback.exceptionSaved'));
      if (nextSchedule.conflictingFutureAppointmentsCount > 0) {
        setConflictMessage(t('employeeSchedules.feedback.conflictsRemain'));
      }
    } catch (error) {
      setExceptionError(mapScheduleError(error, t));
    } finally {
      setExceptionSaving(false);
    }
  }, [applySchedule, barbershopId, exceptionDate, exceptionEnd, exceptionReason, exceptionStart, exceptionType, t, targetEmployeeId]);

  const handleDeleteException = useCallback(async (localDate: string) => {
    if (!getTokenRef.current || !barbershopId || !targetEmployeeId) {
      return;
    }

    setDeletingExceptionDate(localDate);
    try {
      const nextSchedule = await deleteEmployeeScheduleException(
        getTokenRef.current,
        barbershopId,
        targetEmployeeId,
        localDate,
      );
      applySchedule(nextSchedule);
      useFlashStore.getState().setMessage(t('employeeSchedules.feedback.exceptionDeleted'));
    } catch (error) {
      setScheduleError(mapScheduleError(error, t));
    } finally {
      setDeletingExceptionDate(null);
    }
  }, [applySchedule, barbershopId, t, targetEmployeeId]);

  const dayRows = useMemo<EmployeeScheduleDayRowViewModel[]>(() => days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    dayName: formatLocalizedWeekday(day.dayOfWeek) ?? String(day.dayOfWeek),
    isActive: day.isActive,
    start: day.start,
    end: day.end,
    error: dayErrors[day.dayOfWeek] ?? null,
    onToggle: () => {
      setDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek
        ? { ...item, isActive: !item.isActive }
        : item));
      setSaveError(null);
    },
    onStartChange: (value) => {
      setDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek
        ? { ...item, start: value }
        : item));
      setSaveError(null);
    },
    onEndChange: (value) => {
      setDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek
        ? { ...item, end: value }
        : item));
      setSaveError(null);
    },
  })), [dayErrors, days]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <EmployeeScheduleScreenView
      context={context}
      isContextLoading={isContextLoading}
      contextError={contextError}
      schedule={schedule}
      isScheduleLoading={isScheduleLoading}
      scheduleError={scheduleError}
      isOwner={isOwner}
      isReadOnly={isReadOnly}
      mode={mode}
      dayRows={dayRows}
      saveError={saveError}
      saving={saving}
      exceptionDate={exceptionDate}
      exceptionType={exceptionType}
      exceptionStart={exceptionStart}
      exceptionEnd={exceptionEnd}
      exceptionReason={exceptionReason}
      exceptionError={exceptionError}
      exceptionSaving={exceptionSaving}
      deletingExceptionDate={deletingExceptionDate}
      conflictMessage={conflictMessage}
      onRefresh={() => void loadSchedule()}
      onBack={() => router.back()}
      onModeChange={setMode}
      onCopyFromBarbershop={handleCopyFromBarbershop}
      onSave={() => void handleSave()}
      onExceptionDateChange={setExceptionDate}
      onExceptionTypeChange={setExceptionType}
      onExceptionStartChange={setExceptionStart}
      onExceptionEndChange={setExceptionEnd}
      onExceptionReasonChange={setExceptionReason}
      onSaveException={() => void handleSaveException()}
      onDeleteException={(localDate) => void handleDeleteException(localDate)}
    />
  );
}
