import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  WorkingHoursScreenView,
  type WorkingHoursDayViewModel,
} from '@/components/WorkingHoursScreenView.js';
import { formatLocalizedWeekday } from '@/i18n/index.js';
import { useContextStore } from '@/lib/store.js';
import { useWorkingHoursStore } from '@/lib/workingHoursStore.js';
import { useFlashStore } from '@/lib/flashStore.js';
import type { WorkingHoursDay } from '@/lib/types.js';

const TIME_REGEX = /^\d{2}:\d{2}$/;

function blankDay(dayOfWeek: number): WorkingHoursDay {
  return { dayOfWeek, openTime: '', closeTime: '', isActive: false };
}

function allDaysBlank(): WorkingHoursDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => blankDay(dayOfWeek));
}

function mergeDays(apiDays: WorkingHoursDay[]): WorkingHoursDay[] {
  const days = allDaysBlank();
  for (const apiDay of apiDays) {
    days[apiDay.dayOfWeek] = { ...apiDay };
  }
  return days;
}

function validateDay(
  day: WorkingHoursDay,
  t: (key: string) => string,
): string | null {
  if (!day.isActive) return null;

  if (!day.openTime || !TIME_REGEX.test(day.openTime)) {
    return t('workingHours.errors.invalidOpenTime');
  }
  if (!day.closeTime || !TIME_REGEX.test(day.closeTime)) {
    return t('workingHours.errors.invalidCloseTime');
  }

  const openParts = day.openTime.split(':').map(Number);
  const closeParts = day.closeTime.split(':').map(Number);
  const openMin = (openParts[0] ?? 0) * 60 + (openParts[1] ?? 0);
  const closeMin = (closeParts[0] ?? 0) * 60 + (closeParts[1] ?? 0);

  if (closeMin <= openMin) {
    return t('workingHours.errors.closeBeforeOpen');
  }

  return null;
}

export default function WorkingHoursScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useTranslation();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    workingHours: loadedHours,
    isWorkingHoursLoading,
    workingHoursError,
    loadWorkingHours,
    saveWorkingHours,
    clearWorkingHours,
  } = useWorkingHoursStore();

  const [days, setDays] = useState<WorkingHoursDay[]>(() => allDaysBlank());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    void loadWorkingHours(getTokenRef.current, context.barbershopId);
  }, [context, loadWorkingHours]);

  useEffect(() => {
    setDays(mergeDays(loadedHours));
  }, [loadedHours]);

  useEffect(() => {
    return () => {
      clearWorkingHours();
    };
  }, [clearWorkingHours]);

  const handleRefresh = useCallback(() => {
    if (!getTokenRef.current || !context?.barbershopId) return;
    void loadWorkingHours(getTokenRef.current, context.barbershopId);
  }, [context?.barbershopId, loadWorkingHours]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const toggleDay = useCallback((dayOfWeek: number) => {
    setDays((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek ? { ...day, isActive: !day.isActive } : day,
      ),
    );
    setDayErrors((prev) => ({ ...prev, [dayOfWeek]: null }));
    setSaveError(null);
  }, []);

  const updateTime = useCallback((dayOfWeek: number, field: 'openTime' | 'closeTime', value: string) => {
    setDays((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek ? { ...day, [field]: value } : day,
      ),
    );
    setDayErrors((prev) => ({ ...prev, [dayOfWeek]: null }));
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);

    if (!context?.barbershopId || !getTokenRef.current) {
      setSaveError(t('workingHours.errors.missingBarbershop'));
      return;
    }

    const errors: Record<number, string | null> = {};
    let hasErrors = false;
    for (const day of days) {
      const err = validateDay(day, t);
      if (err) {
        errors[day.dayOfWeek] = err;
        hasErrors = true;
      }
    }
    if (hasErrors) {
      setDayErrors(errors);
      return;
    }

    const payload = days.map((day) => ({
      ...day,
      openTime: day.isActive ? day.openTime : '',
      closeTime: day.isActive ? day.closeTime : '',
    }));

    setSaving(true);
    try {
      await saveWorkingHours(getTokenRef.current, context.barbershopId, payload);
      useFlashStore.getState().setMessage(t('workingHours.saveSuccess'));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('errors.unknownApi'));
    } finally {
      setSaving(false);
    }
  }, [context?.barbershopId, days, saveWorkingHours, t]);

  const dayRows = useMemo<WorkingHoursDayViewModel[]>(() => {
    return days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      dayName: formatLocalizedWeekday(day.dayOfWeek) ?? String(day.dayOfWeek),
      isActive: day.isActive,
      openTime: day.openTime,
      closeTime: day.closeTime,
      error: dayErrors[day.dayOfWeek] ?? null,
      onToggle: () => toggleDay(day.dayOfWeek),
      onOpenTimeChange: (value) => updateTime(day.dayOfWeek, 'openTime', value),
      onCloseTimeChange: (value) => updateTime(day.dayOfWeek, 'closeTime', value),
    }));
  }, [dayErrors, days, toggleDay, updateTime]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const isOwner = context?.role === 'OWNER' && !!context.barbershopId;

  return (
    <WorkingHoursScreenView
      context={context}
      isContextLoading={isContextLoading}
      contextError={contextError}
      isOwner={isOwner}
      isWorkingHoursLoading={isWorkingHoursLoading}
      workingHoursError={workingHoursError}
      saveError={saveError}
      saving={saving}
      dayRows={dayRows}
      onRefresh={handleRefresh}
      onSave={() => void handleSave()}
      onBack={handleBack}
    />
  );
}
