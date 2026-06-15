/**
 * Working Hours screen — OWNER-only barbershop weekly schedule.
 *
 * Hidden route (href: null in _layout.tsx). Accessible via
 * "View Working Hours" card on Home for OWNER users with a barbershop.
 * OWNER can view and edit weekly open/close times per day.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
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

  function toggleDay(dayOfWeek: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, isActive: !d.isActive } : d,
      ),
    );
    // Clear any error for this day
    setDayErrors((prev) => ({ ...prev, [dayOfWeek]: null }));
    setSaveError(null);
  }

  function updateTime(dayOfWeek: number, field: 'openTime' | 'closeTime', value: string) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d,
      ),
    );
    setDayErrors((prev) => ({ ...prev, [dayOfWeek]: null }));
    setSaveError(null);
  }

  async function handleSave() {
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
    const payload = days.map((d) => ({
      ...d,
      openTime: d.isActive ? d.openTime : '',
      closeTime: d.isActive ? d.closeTime : '',
    }));

    setSaving(true);
    try {
      await saveWorkingHours(getTokenRef.current, context.barbershopId, payload);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save working hours');
    } finally {
      setSaving(false);
    }
  }

  // --- Guards ---
  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isContextLoading && !context) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading your context…</Text>
      </View>
    );
  }

  if (contextError && !context) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>{contextError}</Text>
      </View>
    );
  }

  if (!context) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.emptyText}>No context available yet.</Text>
      </View>
    );
  }

  const isOwner = context.role === 'OWNER' && !!context.barbershopId;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isWorkingHoursLoading}
          onRefresh={handleRefresh}
        />
      }
      testID="working-hours-screen"
    >
      <View style={styles.headerCard}>
        <Text style={styles.title}>Working Hours</Text>
        <Text style={styles.subtitle}>Set your barbershop weekly schedule.</Text>
      </View>

      {!isOwner && (
        <View style={styles.messageCard}>
          <Text style={styles.emptyText}>
            Only barbershop owners can manage the weekly schedule.
          </Text>
        </View>
      )}

      {isOwner && (
        <>
          {isWorkingHoursLoading && (
            <View style={styles.loadingRow} testID="loading">
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Loading working hours…</Text>
            </View>
          )}

          {workingHoursError && (
            <View style={styles.messageCard}>
              <Text style={styles.errorText} testID="error">{workingHoursError}</Text>
            </View>
          )}

          {!isWorkingHoursLoading && !workingHoursError && (
            <View style={styles.listCard}>
              {days.map((day) => (
                <View
                  key={day.dayOfWeek}
                  style={styles.dayRow}
                  testID={`day-row-${day.dayOfWeek}`}
                >
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayName}>{DAY_NAMES[day.dayOfWeek]}</Text>
                    <TouchableOpacity
                      onPress={() => toggleDay(day.dayOfWeek)}
                      style={[
                        styles.toggleButton,
                        day.isActive ? styles.toggleOpen : styles.toggleClosed,
                      ]}
                      testID={`day-toggle-${day.dayOfWeek}`}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          day.isActive ? styles.toggleOpenText : styles.toggleClosedText,
                        ]}
                      >
                        {day.isActive ? 'Open' : 'Closed'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {day.isActive && (
                    <View style={styles.timeRow}>
                      <View style={styles.timeField}>
                        <Text style={styles.timeLabel}>Open</Text>
                        <TextInput
                          value={day.openTime}
                          onChangeText={(v) => updateTime(day.dayOfWeek, 'openTime', v)}
                          placeholder="HH:mm"
                          style={styles.timeInput}
                          testID={`day-open-${day.dayOfWeek}`}
                          maxLength={5}
                          autoCorrect={false}
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                      <Text style={styles.timeSeparator}>to</Text>
                      <View style={styles.timeField}>
                        <Text style={styles.timeLabel}>Close</Text>
                        <TextInput
                          value={day.closeTime}
                          onChangeText={(v) => updateTime(day.dayOfWeek, 'closeTime', v)}
                          placeholder="HH:mm"
                          style={styles.timeInput}
                          testID={`day-close-${day.dayOfWeek}`}
                          maxLength={5}
                          autoCorrect={false}
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                    </View>
                  )}

                  {dayErrors[day.dayOfWeek] && (
                    <Text style={styles.fieldError}>{dayErrors[day.dayOfWeek]}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {saveError && (
            <View style={styles.messageCard}>
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          {!isWorkingHoursLoading && !workingHoursError && (
            <TouchableOpacity
              onPress={() => void handleSave()}
              disabled={saving}
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              testID="save-button"
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving…' : 'Save Schedule'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="working-hours-back">
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 24, alignItems: 'center' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FFFFFF' },
  headerCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6 },
  loadingText: { fontSize: 14, color: '#666', marginTop: 8 },
  errorText: { fontSize: 14, color: '#D32F2F', textAlign: 'center', marginTop: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
  messageCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  listCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400, marginTop: 16 },
  dayRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD', paddingVertical: 12, gap: 8 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName: { fontSize: 14, fontWeight: '600', color: '#333' },
  toggleButton: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  toggleOpen: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#2E7D32' },
  toggleClosed: { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#E65100' },
  toggleText: { fontSize: 12, fontWeight: '600' },
  toggleOpenText: { color: '#2E7D32' },
  toggleClosedText: { color: '#E65100' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeField: { flex: 1 },
  timeLabel: { fontSize: 11, fontWeight: '600', color: '#777', marginBottom: 4 },
  timeInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  timeSeparator: { fontSize: 12, color: '#999', paddingBottom: 10 },
  fieldError: { fontSize: 12, color: '#D32F2F', marginTop: 4 },
  saveButton: { marginTop: 16, backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 20, width: '100%', maxWidth: 400, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#999999' },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  backButton: { marginTop: 16, marginBottom: 24, backgroundColor: '#333333', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, width: '100%', maxWidth: 400, alignItems: 'center' },
  backButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
