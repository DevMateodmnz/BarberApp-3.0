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
import { fetchEmployees } from '@/lib/employees.js';
import { useContextStore } from '@/lib/store.js';
import { useSummaryStore } from '@/lib/summaryStore.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { useRecordsStore } from '@/lib/recordsStore.js';
import {
  getTodayDateString,
  addDaysToDateString,
} from '@/lib/format.js';
import type {
  CurrentUserContext,
  EmployeeListItem,
  RevenueSummaryPeriod,
} from '@/lib/types.js';

const SUMMARY_PERIOD_LABELS: Record<RevenueSummaryPeriod, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

function buildSummaryQuery(
  context: CurrentUserContext,
  period: RevenueSummaryPeriod,
  employeeId: string | null,
) {
  return {
    period,
    ...(context.role === 'OWNER' && employeeId ? { employeeId } : {}),
  };
}

function normalizeOwnerEmployeeFilter(
  activeEmployees: EmployeeListItem[],
  currentFilter: string | null,
) {
  if (!currentFilter) {
    return null;
  }

  return activeEmployees.some((employee) => employee.id === currentFilter)
    ? currentFilter
    : null;
}

function getOwnerEmployeeFilterErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to load barbers.';
}

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
    loadSummary,
  } = useSummaryStore();

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedSummaryPeriod, setSelectedSummaryPeriod] = useState<RevenueSummaryPeriod>('today');
  const [summaryEmployeeFilter, setSummaryEmployeeFilter] = useState<string | null>(null);
  const [ownerEmployees, setOwnerEmployees] = useState<EmployeeListItem[]>([]);
  const [hasLoadedOwnerEmployeeFilters, setHasLoadedOwnerEmployeeFilters] = useState(false);
  const [isOwnerEmployeeFiltersLoading, setIsOwnerEmployeeFiltersLoading] = useState(false);
  const [ownerEmployeeFiltersError, setOwnerEmployeeFiltersError] = useState<string | null>(null);
  const hasFocusedOnceRef = useRef(false);
  const summaryEmployeeFilterRef = useRef<string | null>(summaryEmployeeFilter);
  const ownerEmployeeRequestIdRef = useRef(0);

  const flashMessage = useFlashStore((s) => s.message);
  const clearFlashMessage = useFlashStore((s) => s.clearMessage);

  const {
    records,
    isRecordsLoading,
    recordsError,
    loadRecordsForDate,
  } = useRecordsStore();

  useEffect(() => {
    summaryEmployeeFilterRef.current = summaryEmployeeFilter;
  }, [summaryEmployeeFilter]);

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

  const resetOwnerEmployeeFilters = useCallback(() => {
    setOwnerEmployees([]);
    setSummaryEmployeeFilter(null);
    setHasLoadedOwnerEmployeeFilters(false);
    setIsOwnerEmployeeFiltersLoading(false);
    setOwnerEmployeeFiltersError(null);
  }, []);

  const loadOwnerEmployeeFilters = useCallback(
    async (
      targetContext: CurrentUserContext | null,
      options?: { preserveExisting?: boolean },
    ) => {
      if (
        !targetContext ||
        targetContext.role !== 'OWNER' ||
        !targetContext.barbershopId ||
        !getTokenRef.current
      ) {
        resetOwnerEmployeeFilters();
        return null;
      }

      const requestId = ownerEmployeeRequestIdRef.current + 1;
      ownerEmployeeRequestIdRef.current = requestId;

      if (!options?.preserveExisting) {
        setOwnerEmployees([]);
        setHasLoadedOwnerEmployeeFilters(false);
      }

      setIsOwnerEmployeeFiltersLoading(true);
      setOwnerEmployeeFiltersError(null);

      try {
        const employees = await fetchEmployees(getTokenRef.current, targetContext.barbershopId);
        if (requestId !== ownerEmployeeRequestIdRef.current) {
          return summaryEmployeeFilterRef.current;
        }

        const activeEmployees = employees.filter((employee) => employee.isActive);
        const nextSelectedEmployeeFilter = normalizeOwnerEmployeeFilter(
          activeEmployees,
          summaryEmployeeFilterRef.current,
        );

        setOwnerEmployees(activeEmployees);
        setSummaryEmployeeFilter(nextSelectedEmployeeFilter);
        setHasLoadedOwnerEmployeeFilters(true);
        setOwnerEmployeeFiltersError(null);

        return nextSelectedEmployeeFilter;
      } catch (error) {
        if (requestId !== ownerEmployeeRequestIdRef.current) {
          return summaryEmployeeFilterRef.current;
        }

        if (!options?.preserveExisting) {
          setOwnerEmployees([]);
          setSummaryEmployeeFilter(null);
        }

        setHasLoadedOwnerEmployeeFilters(false);
        setOwnerEmployeeFiltersError(getOwnerEmployeeFilterErrorMessage(error));

        return options?.preserveExisting ? summaryEmployeeFilterRef.current : null;
      } finally {
        if (requestId === ownerEmployeeRequestIdRef.current) {
          setIsOwnerEmployeeFiltersLoading(false);
        }
      }
    },
    [resetOwnerEmployeeFilters],
  );

  useEffect(() => {
    if (!context || context.role !== 'OWNER' || !context.barbershopId) {
      resetOwnerEmployeeFilters();
      return;
    }

    void loadOwnerEmployeeFilters(context);
  }, [context, loadOwnerEmployeeFilters, resetOwnerEmployeeFilters]);

  // Load summary after context is loaded, for the selected summary period/employee
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    void loadSummary(
      getTokenRef.current,
      context,
      buildSummaryQuery(context, selectedSummaryPeriod, summaryEmployeeFilter),
    );
  }, [context, selectedSummaryPeriod, summaryEmployeeFilter, loadSummary]);

  // Load records after context is loaded, for the selected date
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    loadRecordsForDate(getTokenRef.current, context, selectedDate);
  }, [context, selectedDate, loadRecordsForDate]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return undefined;
      }

      if (!context || !getTokenRef.current) {
        return undefined;
      }

      let isActive = true;

      void (async () => {
        let nextSummaryEmployeeFilter = summaryEmployeeFilterRef.current;

        if (context.role === 'OWNER') {
          nextSummaryEmployeeFilter = await loadOwnerEmployeeFilters(context, {
            preserveExisting: true,
          });
        }

        if (!isActive || !getTokenRef.current) {
          return;
        }

        await loadSummary(
          getTokenRef.current,
          context,
          buildSummaryQuery(context, selectedSummaryPeriod, nextSummaryEmployeeFilter),
        );

        if (!isActive || !getTokenRef.current) {
          return;
        }

        await loadRecordsForDate(getTokenRef.current, context, selectedDate);
      })();

      return () => {
        isActive = false;
      };
    // getToken intentionally NOT in deps — use getTokenRef to avoid
    // re-creating the callback every render (getToken is a new function
    // every render in Clerk Expo, causing an infinite re-fire loop).
    }, [
      context,
      loadOwnerEmployeeFilters,
      loadSummary,
      loadRecordsForDate,
      selectedDate,
      selectedSummaryPeriod,
    ])
  );

  // Pull-to-refresh: reload context, owner filters, summary, and records
  const handleRefresh = useCallback(async () => {
    if (!getTokenRef.current) return;
    await loadContext(getTokenRef.current);
    const { context: freshContext } = useContextStore.getState();
    if (!freshContext || !getTokenRef.current) {
      return;
    }

    let nextSummaryEmployeeFilter = summaryEmployeeFilterRef.current;
    if (freshContext.role === 'OWNER') {
      nextSummaryEmployeeFilter = await loadOwnerEmployeeFilters(freshContext, {
        preserveExisting: true,
      });
    }

    if (!getTokenRef.current) {
      return;
    }

    await Promise.all([
      loadSummary(
        getTokenRef.current,
        freshContext,
        buildSummaryQuery(freshContext, selectedSummaryPeriod, nextSummaryEmployeeFilter),
      ),
      loadRecordsForDate(getTokenRef.current, freshContext, selectedDate),
    ]);
  }, [
    loadContext,
    loadOwnerEmployeeFilters,
    loadRecordsForDate,
    loadSummary,
    selectedDate,
    selectedSummaryPeriod,
  ]);

  const canRecordService =
    !!context && (
      (context.role === 'OWNER' && !!context.barbershopId) ||
      (context.role === 'BARBER' && !!context.barbershopId && !!context.employeeId)
    );

  const isRefreshing = isContextLoading || isSummaryLoading || isRecordsLoading;
  const summaryPeriodLabel = SUMMARY_PERIOD_LABELS[selectedSummaryPeriod];
  const ownerEmployeeFilters = context?.role === 'OWNER' && ownerEmployees.length > 0
    ? [
        {
          id: 'all',
          label: 'All barbers',
          selected: summaryEmployeeFilter === null,
          testID: 'summary-employee-filter-all',
          onPress: () => setSummaryEmployeeFilter(null),
        },
        ...ownerEmployees.map((employee) => ({
          id: employee.id,
          label: employee.user.name ?? employee.user.email,
          selected: summaryEmployeeFilter === employee.id,
          testID: `summary-employee-filter-${employee.id}`,
          onPress: () => setSummaryEmployeeFilter(employee.id),
        })),
      ]
    : [];

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
        summaryPeriod={selectedSummaryPeriod}
        summaryPeriodLabel={summaryPeriodLabel}
        onSummaryPeriodChange={setSelectedSummaryPeriod}
        ownerEmployeeFilters={ownerEmployeeFilters}
        hasLoadedOwnerEmployeeFilters={hasLoadedOwnerEmployeeFilters}
        isOwnerEmployeeFiltersLoading={isOwnerEmployeeFiltersLoading}
        ownerEmployeeFiltersError={ownerEmployeeFiltersError}
        onRetryOwnerEmployeeFilters={() => {
          void loadOwnerEmployeeFilters(context, {
            preserveExisting: ownerEmployees.length > 0,
          });
        }}
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
