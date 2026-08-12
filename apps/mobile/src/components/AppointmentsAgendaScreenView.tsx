import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  EmptyState,
  RoleBadge,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/index.js';
import type { AppointmentStatus, CurrentUserContext } from '@/lib/types.js';
import { formatBusinessDateLabel } from '@/lib/format.js';
import { tokens } from '@/theme/index.js';

export interface AppointmentModeOption {
  id: 'list' | 'agenda';
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}

export interface AgendaEmployeeSummaryCard {
  id: string;
  title: string;
  summary: string;
  subtitle?: string | null;
  badgeLabel?: string | null;
  testID: string;
  onPress: () => void;
}

export interface AgendaAppointmentActionViewModel {
  id: string;
  label: string;
  variant: 'secondary' | 'danger';
  testID: string;
  onPress: () => void;
}

export type AgendaTimelineItem =
  | {
      id: string;
      kind: 'currentTime';
      label: string;
    }
  | {
      id: string;
      kind: 'closed';
      title: string;
      message: string;
      timeLabel: string;
    }
  | {
      id: string;
      kind: 'gap';
      title: string;
      timeLabel: string;
      durationLabel: string;
      helper?: string | null;
      actionLabel: string;
      actionAccessibilityLabel: string;
      onPress: () => void;
    }
  | {
      id: string;
      kind: 'appointment';
      timeLabel: string;
      status: AppointmentStatus;
      title: string;
      subtitle: string;
      employeeLabel?: string | null;
      attentionLabels: string[];
      actions: AgendaAppointmentActionViewModel[];
      onPress: () => void;
      isCurrent: boolean;
    };

export interface AppointmentsAgendaScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  isAgendaLoading: boolean;
  agendaError: string | null;
  isRefreshing: boolean;
  flashMessage: string | null;
  showCreateAction: boolean;
  selectedDate: string;
  isTodaySelected: boolean;
  modeOptions: AppointmentModeOption[];
  employeeFilters: Array<{
    id: string;
    label: string;
    selected: boolean;
    testID: string;
    onPress: () => void;
  }>;
  selectedEmployeeTitle?: string | null;
  selectedEmployeeSummary?: string | null;
  selectedEmployeeMeta?: string | null;
  selectedEmployeeException?: string | null;
  summaryCards: AgendaEmployeeSummaryCard[];
  timelineItems: AgendaTimelineItem[];
  emptyTitle: string;
  emptyMessage: string;
  onCreateAppointment: () => void;
  onRefresh: () => void;
  onPrevDate: () => void;
  onToday: () => void;
  onNextDate: () => void;
}

export function AppointmentsAgendaScreenView({
  context,
  isContextLoading,
  isAgendaLoading,
  agendaError,
  isRefreshing,
  flashMessage,
  showCreateAction,
  selectedDate,
  isTodaySelected,
  modeOptions,
  employeeFilters,
  selectedEmployeeTitle,
  selectedEmployeeSummary,
  selectedEmployeeMeta,
  selectedEmployeeException,
  summaryCards,
  timelineItems,
  emptyTitle,
  emptyMessage,
  onCreateAppointment,
  onRefresh,
  onPrevDate,
  onToday,
  onNextDate,
}: AppointmentsAgendaScreenViewProps) {
  const { t } = useTranslation();

  const headerSubtitle = context?.role === 'BARBER'
    ? t('appointments.subtitleBarber')
    : t('appointments.subtitleOwner');

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      testID="appointments-agenda-refresh"
    />
  );

  const listHeader = (
    <View style={styles.content}>
      <ScreenHeader
        title={t('appointments.title')}
        subtitle={headerSubtitle}
        rightAction={context ? <RoleBadge role={context.role} /> : undefined}
      />

      {flashMessage ? (
        <AppCard testID="appointments-flash-message" style={styles.flashBanner}>
          <Text style={styles.flashText}>{flashMessage}</Text>
        </AppCard>
      ) : null}

      {context ? (
        <AppCard testID="appointments-context" variant="outlined" style={styles.contextCard}>
          <Text style={styles.contextEyebrow}>{t('common.labels.scheduleScope')}</Text>
          <Text style={styles.contextTitle}>
            {context.barbershopName ?? t('appointments.contextFallbackTitle')}
          </Text>
          <Text style={styles.contextBody}>
            {context.role === 'OWNER'
              ? t('appointments.contextOwnerBody')
              : t('appointments.contextBarberBody')}
          </Text>
        </AppCard>
      ) : null}

      <AppCard testID="appointments-mode-switch" variant="outlined">
        <SectionHeader title={t('appointments.modeTitle')} />
        <View style={styles.modeRow}>
          {modeOptions.map((option) => (
            <AppButton
              key={option.id}
              testID={option.testID}
              title={option.label}
              variant={option.selected ? 'primary' : 'ghost'}
              size="sm"
              onPress={option.onPress}
              style={styles.modeButton}
            />
          ))}
        </View>
      </AppCard>

      {showCreateAction ? (
        <AppButton
          testID="appointments-create-button"
          title={t('appointments.newAction')}
          accessibilityLabel={t('appointmentCreation.accessibility.openCreate')}
          onPress={onCreateAppointment}
        />
      ) : null}

      <AppCard testID="appointments-date-controls" variant="outlined" style={styles.dateCard}>
        <Text style={styles.dateEyebrow}>{t('common.labels.selectedDate')}</Text>
        <Text style={styles.dateDisplay}>{formatBusinessDateLabel(selectedDate)}</Text>
        <Text style={styles.dateHint}>
          {isTodaySelected
            ? t('appointments.selectedDateHintToday')
            : t('appointments.selectedDateHintBrowse')}
        </Text>
        <View style={styles.dateActions}>
          <AppButton
            testID="appointments-date-prev"
            title={t('common.actions.previous')}
            variant="secondary"
            size="sm"
            onPress={onPrevDate}
            style={styles.dateActionButton}
          />
          <AppButton
            testID="appointments-date-today"
            title={t('common.actions.today')}
            variant={isTodaySelected ? 'secondary' : 'primary'}
            size="sm"
            onPress={onToday}
            disabled={isTodaySelected}
            style={styles.dateActionButton}
          />
          <AppButton
            testID="appointments-date-next"
            title={t('common.actions.next')}
            variant="secondary"
            size="sm"
            onPress={onNextDate}
            style={styles.dateActionButton}
          />
        </View>
      </AppCard>

      {employeeFilters.length > 0 ? (
        <AppCard testID="appointments-employee-filter" variant="outlined">
          <SectionHeader title={t('common.labels.barberFilter')} />
          <View style={styles.filterWrap}>
            {employeeFilters.map((filter) => (
              <AppButton
                key={filter.id}
                testID={filter.testID}
                title={filter.label}
                variant={filter.selected ? 'primary' : 'ghost'}
                size="sm"
                onPress={filter.onPress}
                style={styles.filterButton}
              />
            ))}
          </View>
        </AppCard>
      ) : null}

      {selectedEmployeeTitle ? (
        <AppCard testID="appointments-agenda-summary" variant="outlined">
          <Text style={styles.summaryTitle}>{selectedEmployeeTitle}</Text>
          {selectedEmployeeSummary ? (
            <Text style={styles.summaryBody}>{selectedEmployeeSummary}</Text>
          ) : null}
          {selectedEmployeeMeta ? (
            <Text style={styles.summaryMeta}>{selectedEmployeeMeta}</Text>
          ) : null}
          {selectedEmployeeException ? (
            <Text style={styles.exceptionText}>{selectedEmployeeException}</Text>
          ) : null}
        </AppCard>
      ) : null}

      {summaryCards.length > 0 ? (
        <View style={styles.summaryCards}>
          {summaryCards.map((card) => (
            <Pressable key={card.id} testID={card.testID} onPress={card.onPress}>
              <AppCard variant="outlined" style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>{card.title}</Text>
                <Text style={styles.summaryCardBody}>{card.summary}</Text>
                {card.subtitle ? (
                  <Text style={styles.summaryCardMeta}>{card.subtitle}</Text>
                ) : null}
                {card.badgeLabel ? (
                  <Text style={styles.summaryCardBadge}>{card.badgeLabel}</Text>
                ) : null}
              </AppCard>
            </Pressable>
          ))}
        </View>
      ) : null}

      {isContextLoading ? (
        <AppCard style={styles.stateCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.stateText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      ) : null}

      {isAgendaLoading ? (
        <AppCard style={styles.stateCard}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
          <Text style={styles.stateText}>{t('appointments.agenda.loading')}</Text>
        </AppCard>
      ) : null}

      {agendaError ? (
        <AppCard style={styles.stateCard}>
          <Text style={styles.errorText} testID="appointments-agenda-error">
            {agendaError}
          </Text>
          <Text style={styles.stateText}>{t('appointments.errorHint')}</Text>
        </AppCard>
      ) : null}
    </View>
  );

  if (timelineItems.length === 0 && summaryCards.length === 0 && !isAgendaLoading && !agendaError) {
    return (
      <Screen>
        {listHeader}
        <View style={styles.content}>
          <AppCard testID="appointments-agenda-empty">
            <EmptyState title={emptyTitle} message={emptyMessage} />
          </AppCard>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={timelineItems}
        keyExtractor={(item) => item.id}
        refreshControl={refreshControl}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => {
          if (item.kind === 'currentTime') {
            return (
              <View style={styles.currentTimeRow}>
                <View style={styles.currentTimeLine} />
                <Text style={styles.currentTimeText}>{item.label}</Text>
              </View>
            );
          }

          if (item.kind === 'closed') {
            return (
              <AppCard testID={`agenda-item-${item.id}`} variant="outlined" style={styles.closedCard}>
                <Text style={styles.closedTitle}>{item.title}</Text>
                <Text style={styles.closedTime}>{item.timeLabel}</Text>
                <Text style={styles.closedMessage}>{item.message}</Text>
              </AppCard>
            );
          }

          if (item.kind === 'gap') {
            return (
              <AppCard testID={`agenda-item-${item.id}`} variant="outlined" style={styles.gapCard}>
                <Text style={styles.gapTitle}>{item.title}</Text>
                <Text style={styles.gapTime}>{item.timeLabel}</Text>
                <Text style={styles.gapMeta}>{item.durationLabel}</Text>
                {item.helper ? (
                  <Text style={styles.gapHelper}>{item.helper}</Text>
                ) : null}
                <AppButton
                  testID={`agenda-gap-action-${item.id}`}
                  title={item.actionLabel}
                  accessibilityLabel={item.actionAccessibilityLabel}
                  size="sm"
                  onPress={item.onPress}
                />
              </AppCard>
            );
          }

          return (
            <Pressable
              testID={`agenda-item-${item.id}`}
              onPress={item.onPress}
              accessibilityRole="button"
            >
              <AppCard
                variant="outlined"
                style={[
                  styles.appointmentCard,
                  item.isCurrent ? styles.currentAppointmentCard : null,
                ]}
              >
                <View style={styles.appointmentHeader}>
                  <View style={styles.appointmentHeaderCopy}>
                    <Text style={styles.appointmentTime}>{item.timeLabel}</Text>
                    <Text style={styles.appointmentTitle}>{item.title}</Text>
                    <Text style={styles.appointmentSubtitle}>{item.subtitle}</Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>

                {item.employeeLabel ? (
                  <Text style={styles.appointmentMeta}>{item.employeeLabel}</Text>
                ) : null}

                {item.attentionLabels.length > 0 ? (
                  <View style={styles.attentionWrap}>
                    {item.attentionLabels.map((label) => (
                      <Text key={label} style={styles.attentionLabel}>
                        {label}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={styles.actionRow}>
                  {item.actions.map((action) => (
                    <AppButton
                      key={action.id}
                      testID={action.testID}
                      title={action.label}
                      variant={action.variant}
                      size="sm"
                      onPress={action.onPress}
                    />
                  ))}
                </View>
              </AppCard>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
    gap: tokens.spacing[4],
  },
  listContent: {
    paddingBottom: tokens.spacing[8],
  },
  flashBanner: {
    backgroundColor: tokens.colors.primary,
  },
  flashText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  contextCard: {
    gap: tokens.spacing[2],
  },
  contextEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
  },
  contextTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  contextBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  modeRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  modeButton: {
    flex: 1,
  },
  dateCard: {
    gap: tokens.spacing[2],
  },
  dateEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
  },
  dateDisplay: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  dateHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  dateActions: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  dateActionButton: {
    flex: 1,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  filterButton: {
    minWidth: 96,
  },
  summaryCards: {
    gap: tokens.spacing[3],
  },
  summaryCard: {
    gap: tokens.spacing[1],
  },
  summaryTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  summaryBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  summaryMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  exceptionText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.warning,
  },
  summaryCardTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  summaryCardBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  summaryCardMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  summaryCardBadge: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primaryLight,
  },
  stateCard: {
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  stateText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  currentTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: tokens.colors.primary,
  },
  currentTimeText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primaryLight,
    fontWeight: tokens.typography.weight.semibold,
  },
  closedCard: {
    marginHorizontal: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
    gap: tokens.spacing[1],
  },
  closedTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  closedTime: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  closedMessage: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  gapCard: {
    marginHorizontal: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
    gap: tokens.spacing[2],
  },
  gapTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  gapTime: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  gapMeta: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  gapHelper: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  appointmentCard: {
    marginHorizontal: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
    gap: tokens.spacing[3],
  },
  currentAppointmentCard: {
    borderColor: tokens.colors.primary,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[3],
  },
  appointmentHeaderCopy: {
    flex: 1,
    gap: tokens.spacing[1],
  },
  appointmentTime: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  appointmentTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  appointmentSubtitle: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  appointmentMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
  },
  attentionWrap: {
    gap: tokens.spacing[1],
  },
  attentionLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primaryLight,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
});
