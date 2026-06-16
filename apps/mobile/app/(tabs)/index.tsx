/**
 * Home screen — protected, shown when user is signed in.
 *
 * Loads user context from backend (/me/context) on mount,
 * then loads today's daily summary based on the user role.
 * OWNER: sees barbershop summary (totals + employee breakdown).
 * BARBER: sees their own employee summary (totals).
 * CLIENT: sees a "coming soon" message.
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/index.js';
import { HomeContent } from '@/components/HomeContent.js';
import { useContextStore } from '@/lib/store.js';
import { useSummaryStore } from '@/lib/summaryStore.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { useRecordsStore } from '@/lib/recordsStore.js';
import {
  getTodayDateString,
  addDaysToDateString,
} from '@/lib/format.js';

export default function HomeScreen() {
  const router = useRouter();
  const { isSignedIn, getToken, isLoaded } = useAuth();

  // Clerk Expo's useAuth creates a new getToken function on every render
  // (unlike Clerk React which uses useCallback). Stabilize via a ref so
  // effect dependency arrays don't cause infinite re-render loops.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const {
    summary,
    isSummaryLoading,
    summaryError,
    loadSummaryForDate,
  } = useSummaryStore();

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const hasFocusedOnceRef = useRef(false);

  const flashMessage = useFlashStore((s) => s.message);
  const clearFlashMessage = useFlashStore((s) => s.clearMessage);

  const {
    records,
    isRecordsLoading,
    recordsError,
    loadRecordsForDate,
  } = useRecordsStore();

  // Auto-clear flash message after a short display period
  useEffect(() => {
    if (!flashMessage) return;
    const timer = setTimeout(() => {
      clearFlashMessage();
    }, 4000);
    return () => clearTimeout(timer);
  }, [flashMessage, clearFlashMessage]);

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current) return;
    loadContext(getTokenRef.current);
  }, [isSignedIn, loadContext]);

  // Load summary and records after context is loaded, for the selected date
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    loadSummaryForDate(getTokenRef.current, context, selectedDate);
    loadRecordsForDate(getTokenRef.current, context, selectedDate);
  }, [context, selectedDate, loadSummaryForDate, loadRecordsForDate]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return undefined;
      }

      if (!context || !getTokenRef.current) {
        return undefined;
      }

      void loadSummaryForDate(getTokenRef.current, context, selectedDate);
      void loadRecordsForDate(getTokenRef.current, context, selectedDate);
      return undefined;
    // getToken intentionally NOT in deps — use getTokenRef to avoid
    // re-creating the callback every render (getToken is a new function
    // every render in Clerk Expo, causing an infinite re-fire loop).
    }, [context, loadSummaryForDate, selectedDate])
  );

  // Pull-to-refresh: reload context then summary for selectedDate
  const handleRefresh = useCallback(async () => {
    if (!getTokenRef.current) return;
    await loadContext(getTokenRef.current);
    // After context reloads, the useEffect above will trigger summary reload.
    // But if context didn't change (same reference), useEffect won't re-fire,
    // so we explicitly reload here too.
    const { context: freshContext } = useContextStore.getState();
    if (freshContext) {
      await loadSummaryForDate(getTokenRef.current, freshContext, selectedDate);
      await loadRecordsForDate(getTokenRef.current, freshContext, selectedDate);
    }
  }, [loadContext, selectedDate, loadSummaryForDate, loadRecordsForDate]);

  const canRecordService =
    !!context && (
      (context.role === 'OWNER' && !!context.barbershopId) ||
      (context.role === 'BARBER' && !!context.barbershopId && !!context.employeeId)
    );

  const isRefreshing = isContextLoading || isSummaryLoading || isRecordsLoading;

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <Screen
      testID="home-screen"
      scrollable
      refreshControl={
        <RefreshControl
          testID="home-refresh"
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
        />
      }
    >
      <HomeContent
        context={context}
        isContextLoading={isContextLoading}
        contextError={contextError}
        summary={summary}
        isSummaryLoading={isSummaryLoading}
        summaryError={summaryError}
        records={records}
        isRecordsLoading={isRecordsLoading}
        recordsError={recordsError}
        selectedDate={selectedDate}
        flashMessage={flashMessage}
        canRecordService={canRecordService}
        onRecordService={() => router.push('/(tabs)/record-service')}
        onServices={() => router.push('/(tabs)/services')}
        onEmployees={() => router.push('/(tabs)/employees')}
        onWorkingHours={() => router.push('/(tabs)/working-hours')}
        onAppointments={() => router.push('/(tabs)/appointments')}
        onPrevDate={() => setSelectedDate((prev) => addDaysToDateString(prev, -1))}
        onNextDate={() => setSelectedDate((prev) => addDaysToDateString(prev, 1))}
        onToday={() => {
          const today = getTodayDateString();
          if (selectedDate !== today) {
            setSelectedDate(today);
          }
        }}
      />
    </Screen>
  );
}
