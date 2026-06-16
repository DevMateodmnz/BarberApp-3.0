/**
 * Working Hours screen — OWNER-only barbershop weekly schedule.
 *
 * Hidden route (href: null in _layout.tsx). Accessible via
 * "View Working Hours" card on Home for OWNER users with a barbershop.
 * OWNER can view and edit weekly open/close times per day.
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

import {
  WorkingHoursScreenView,
  type WorkingHoursDayViewModel,
} from '@/components/WorkingHoursScreenView.js';
import { useContextStore } from '@/lib/store.js';
import { useWorkingHoursStore } from '@/lib/workingHoursStore.js';
import type { WorkingHoursDay } from '@/lib/types.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_REGEX = /^\d{2}:\d{2}$/;

/**
 * Creates a blank pre-populated day.
 */
function blankDay(dayOfWeek: number): WorkingHoursDay {
  return { dayOfWeek, openTime: '', closeTime: '', isActive: false };
}

/**
 * Pre-populates all 7 days with blank (closed) state.
 */
function allDaysBlank(): WorkingHoursDay[] {
  return DAY_NAMES.map((_, i) => blankDay(i));
}

/**
 * Merges API data into the pre-populated blank days.
 * Days present in the API response overwrite the blank defaults.
 */
function mergeDays(apiDays: WorkingHoursDay[]): WorkingHoursDay[] {
  const days = allDaysBlank();
  for (const apiDay of apiDays) {
    days[apiDay.dayOfWeek] = { ...apiDay };
  }
  return days;
}

/**
 * Validates a single day row for local (pre-submit) errors.
 * Returns an error message string, or null if valid.
 */
function validateDay(day: WorkingHoursDay): string | null {
  if (!day.isActive) return null;

  if (!day.openTime || !TIME_REGEX.test(day.openTime)) {
    return 'Open time must be in HH:mm format (e.g. 09:00)';
  }
  if (!day.closeTime || !TIME_REGEX.test(day.closeTime)) {
    return 'Close time must be in HH:mm format (e.g. 18:00)';
  }

  const openParts = day.openTime.split(':').map(Number);
  const closeParts = day.closeTime.split(':').map(Number);
  const openMin = (openParts[0] ?? 0) * 60 + (openParts[1] ?? 0);
  const closeMin = (closeParts[0] ?? 0) * 60 + (closeParts[1] ?? 0);

  if (closeMin <= openMin) {
    return 'Close time must be after open time';
  }

  return null;
}

export default function WorkingHoursScreen() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  // Stabilize getToken with a ref to avoid infinite re-renders
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

  // Local editable copy of the 7 days
  const [days, setDays] = useState<WorkingHoursDay[]>(() => allDaysBlank());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<number, string | null>>({});

  // Load context
  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) return;
    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  // Load working hours when context is ready
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    void loadWorkingHours(getTokenRef.current, context.barbershopId);
  }, [context, loadWorkingHours]);

  // Merge loaded hours into editable days when data arrives
  useEffect(() => {
    setDays(mergeDays(loadedHours));
  }, [loadedHours]);

  // Cleanup store on unmount
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
    // Clear any error for this day
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
      setSaveError('No barbershop context available.');
      return;
    }

    // Local validation: all active days must have valid times
    const errors: Record<number, string | null> = {};
    let hasErrors = false;
    for (const day of days) {
      const err = validateDay(day);
      if (err) {
        errors[day.dayOfWeek] = err;
        hasErrors = true;
      }
    }
    if (hasErrors) {
      setDayErrors(errors);
      return;
    }

    // Prepare payload: closed days have openTime/closeTime cleared
    const payload = days.map((day) => ({
      ...day,
      openTime: day.isActive ? day.openTime : '',
      closeTime: day.isActive ? day.closeTime : '',
    }));

    setSaving(true);
    try {
      await saveWorkingHours(getTokenRef.current, context.barbershopId, payload);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save working hours');
    } finally {
      setSaving(false);
    }
  }, [context?.barbershopId, days, saveWorkingHours]);

  const dayRows = useMemo<WorkingHoursDayViewModel[]>(() => {
    return days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      dayName: DAY_NAMES[day.dayOfWeek] ?? `Day ${day.dayOfWeek}`,
      isActive: day.isActive,
      openTime: day.openTime,
      closeTime: day.closeTime,
      error: dayErrors[day.dayOfWeek] ?? null,
      onToggle: () => toggleDay(day.dayOfWeek),
      onOpenTimeChange: (value) => updateTime(day.dayOfWeek, 'openTime', value),
      onCloseTimeChange: (value) => updateTime(day.dayOfWeek, 'closeTime', value),
    }));
  }, [dayErrors, days, toggleDay, updateTime]);

  // --- Guards ---
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
