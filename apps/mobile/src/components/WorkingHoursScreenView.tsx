import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  ActionRow,
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  RoleBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import type { CurrentUserContext } from '@/lib/types.js';

export interface WorkingHoursDayViewModel {
  dayOfWeek: number;
  dayName: string;
  isActive: boolean;
  openTime: string;
  closeTime: string;
  error: string | null;
  onToggle: () => void;
  onOpenTimeChange: (value: string) => void;
  onCloseTimeChange: (value: string) => void;
}

export interface WorkingHoursScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  contextError: string | null;
  isOwner: boolean;
  isWorkingHoursLoading: boolean;
  workingHoursError: string | null;
  saveError: string | null;
  saving: boolean;
  dayRows: WorkingHoursDayViewModel[];
  onRefresh: () => void;
  onSave: () => void;
  onBack: () => void;
}

export function WorkingHoursScreenView({
  context,
  isContextLoading,
  contextError,
  isOwner,
  isWorkingHoursLoading,
  workingHoursError,
  saveError,
  saving,
  dayRows,
  onRefresh,
  onSave,
  onBack,
}: WorkingHoursScreenViewProps) {
  const refreshControl = (
    <RefreshControl refreshing={isWorkingHoursLoading} onRefresh={onRefresh} />
  );

  const header = (
    <ScreenHeader
      title="Working Hours"
      subtitle="Set your barbershop weekly schedule."
      rightAction={context ? <RoleBadge role={context.role} /> : undefined}
    />
  );

  if (isContextLoading && !context) {
    return (
      <Screen testID="working-hours-screen">
        {header}
        <AppCard testID="loading" style={styles.stateCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.stateText}>Loading your context…</Text>
        </AppCard>
      </Screen>
    );
  }

  if (contextError && !context) {
    return (
      <Screen testID="working-hours-screen">
        {header}
        <AppCard style={styles.stateCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      </Screen>
    );
  }

  if (!context) {
    return (
      <Screen testID="working-hours-screen">
        {header}
        <AppCard>
          <EmptyState
            testID="working-hours-no-context"
            title="No context available"
            message="No context available yet."
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen
      testID="working-hours-screen"
      scrollable
      keyboardAware
      refreshControl={refreshControl}
    >
      {header}

      <AppCard testID="working-hours-context" variant="outlined" style={styles.contextCard}>
        <Text style={styles.contextEyebrow}>Weekly schedule</Text>
        <Text style={styles.contextTitle}>{context.barbershopName ?? 'Barbershop schedule'}</Text>
        <Text style={styles.contextBody}>
          {isOwner
            ? 'Configure the weekly opening hours for your barbershop.'
            : 'Only barbershop owners can manage the weekly schedule.'}
        </Text>
      </AppCard>

      {!isOwner && (
        <AppCard>
          <EmptyState
            testID="working-hours-blocked"
            title="Owner access only"
            message="Only barbershop owners can manage the weekly schedule."
          />
        </AppCard>
      )}

      {isOwner && (
        <>
          {isWorkingHoursLoading && (
            <AppCard testID="loading" style={styles.stateCard}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.stateText}>Loading working hours…</Text>
            </AppCard>
          )}

          {workingHoursError && (
            <AppCard style={styles.stateCard}>
              <Text style={styles.errorText} testID="error">{workingHoursError}</Text>
            </AppCard>
          )}

          {!isWorkingHoursLoading && !workingHoursError && (
            <AppCard>
              <SectionHeader title="Weekly schedule" />
              <FormSection helper="Enable each day you are open and set the opening and closing times in HH:mm format.">
                <View style={styles.daysList}>
                  {dayRows.map((day) => (
                    <AppCard
                      key={day.dayOfWeek}
                      testID={`day-row-${day.dayOfWeek}`}
                      variant="outlined"
                      style={styles.dayCard}
                    >
                      <View style={styles.dayHeader}>
                        <Text style={styles.dayName}>{day.dayName}</Text>
                        <StatusBadge status={day.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </View>

                      <ActionRow label="Day status" style={styles.dayActionRow}>
                        <AppButton
                          testID={`day-toggle-${day.dayOfWeek}`}
                          title={day.isActive ? 'Open' : 'Closed'}
                          variant={day.isActive ? 'secondary' : 'ghost'}
                          size="sm"
                          onPress={day.onToggle}
                        />
                      </ActionRow>

                      {day.isActive ? (
                        <View style={styles.timeFields}>
                          <AppTextInput
                            testID={`day-open-${day.dayOfWeek}`}
                            label="Open"
                            value={day.openTime}
                            onChangeText={day.onOpenTimeChange}
                            placeholder="HH:mm"
                            keyboardType="numbers-and-punctuation"
                            autoCorrect={false}
                            maxLength={5}
                            style={styles.timeInput}
                          />
                          <AppTextInput
                            testID={`day-close-${day.dayOfWeek}`}
                            label="Close"
                            value={day.closeTime}
                            onChangeText={day.onCloseTimeChange}
                            placeholder="HH:mm"
                            keyboardType="numbers-and-punctuation"
                            autoCorrect={false}
                            maxLength={5}
                            style={styles.timeInput}
                          />
                        </View>
                      ) : (
                        <Text style={styles.closedHint}>Closed for this day.</Text>
                      )}

                      {day.error && <Text style={styles.fieldError}>{day.error}</Text>}
                    </AppCard>
                  ))}
                </View>
              </FormSection>
            </AppCard>
          )}

          {saveError && (
            <AppCard>
              <Text style={styles.errorText}>{saveError}</Text>
            </AppCard>
          )}

          {!isWorkingHoursLoading && !workingHoursError && (
            <AppButton
              testID="save-button"
              title={saving ? 'Saving…' : 'Save Schedule'}
              onPress={onSave}
              loading={saving}
              disabled={saving}
            />
          )}
        </>
      )}

      <AppButton
        testID="working-hours-back"
        title="Back to Home"
        variant="ghost"
        onPress={onBack}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  contextCard: {
    marginBottom: tokens.spacing[4],
  },
  contextEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: tokens.spacing[1],
  },
  contextTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  contextBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
  },
  stateCard: {
    alignItems: 'center',
    marginTop: tokens.spacing[4],
  },
  stateText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  daysList: {
    gap: tokens.spacing[3],
  },
  dayCard: {
    padding: tokens.spacing[3],
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  dayName: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
    flex: 1,
  },
  dayActionRow: {
    marginTop: tokens.spacing[3],
  },
  timeFields: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
    marginTop: tokens.spacing[3],
  },
  timeInput: {
    flex: 1,
  },
  closedHint: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[3],
    fontStyle: 'italic',
  },
  fieldError: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.error,
    marginTop: tokens.spacing[2],
  },
});
