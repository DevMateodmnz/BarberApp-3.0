import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  EmptyState,
  NavigationTile,
  RoleBadge,
  ScreenHeader,
  SectionHeader,
} from '@/components/ui/index.js';
import { DailySummarySection } from '@/components/DailySummarySection.js';
import { APP_NAME } from '@/lib/constants.js';
import {
  formatBusinessDateLabel,
  formatCentsForDisplay,
  formatPaymentMethodLabel,
  formatRecordTime,
  isTodayDateString,
} from '@/lib/format.js';
import type { DailySummary, RevenueSummaryPeriod, ServiceRecord } from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

interface FilterOption {
  id: string;
  label: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}

export interface HomeContentProps {
  context: {
    role: 'OWNER' | 'BARBER' | 'CLIENT';
    barbershopId: string | null;
    barbershopName: string | null;
    employeeId: string | null;
    employeeName: string | null;
  } | null;
  isContextLoading: boolean;
  contextError: string | null;
  summary: DailySummary | null;
  isSummaryLoading: boolean;
  summaryError: string | null;
  records: ServiceRecord[];
  isRecordsLoading: boolean;
  recordsError: string | null;
  summaryPeriod: RevenueSummaryPeriod;
  summaryPeriodLabel: string;
  onSummaryPeriodChange: (period: RevenueSummaryPeriod) => void;
  ownerEmployeeFilters: FilterOption[];
  hasLoadedOwnerEmployeeFilters: boolean;
  isOwnerEmployeeFiltersLoading: boolean;
  ownerEmployeeFiltersError: string | null;
  onRetryOwnerEmployeeFilters: () => void;
  selectedDate: string;
  flashMessage: string | null;
  canRecordService: boolean;
  onRecordService: () => void;
  onAppointments: () => void;
  onCommissions?: () => void;
  onCustomers: () => void;
  onPrevDate: () => void;
  onNextDate: () => void;
  onToday: () => void;
  onOpenLanguageSettings?: () => void;
}

export function HomeContent({
  context,
  isContextLoading,
  contextError,
  summary,
  isSummaryLoading,
  summaryError,
  records,
  isRecordsLoading,
  recordsError,
  summaryPeriod,
  summaryPeriodLabel,
  onSummaryPeriodChange,
  ownerEmployeeFilters,
  hasLoadedOwnerEmployeeFilters,
  isOwnerEmployeeFiltersLoading,
  ownerEmployeeFiltersError,
  onRetryOwnerEmployeeFilters,
  selectedDate,
  flashMessage,
  canRecordService,
  onRecordService,
  onAppointments,
  onCommissions = () => undefined,
  onCustomers,
  onPrevDate,
  onNextDate,
  onToday,
  onOpenLanguageSettings,
}: HomeContentProps) {
  const { t } = useTranslation();
  const summaryPeriodOptions: Array<{ value: RevenueSummaryPeriod; label: string }> = [
    { value: 'today', label: t('common.periods.today') },
    { value: 'week', label: t('common.periods.week') },
    { value: 'month', label: t('common.periods.month') },
    { value: 'year', label: t('common.periods.year') },
  ];

  const role = context?.role;
  const showBarberNames = role === 'OWNER';
  const canShowDashboard = role === 'OWNER' || role === 'BARBER';
  const showRevenueSection = canShowDashboard && !!context?.barbershopId;
  const showRecordsSection = canShowDashboard && !!context?.barbershopId;
  const showAppointmentsAction = canShowDashboard && !!context?.barbershopId;
  const showCustomersAction = canShowDashboard && !!context?.barbershopId;
  const showOwnerEmployeeFilterCard = role === 'OWNER' && !!context?.barbershopId;
  const showOwnerEmployeeFilterEmptyState =
    showOwnerEmployeeFilterCard &&
    hasLoadedOwnerEmployeeFilters &&
    !isOwnerEmployeeFiltersLoading &&
    !ownerEmployeeFiltersError &&
    ownerEmployeeFilters.length === 0;
  const showDailyActions = canRecordService || showAppointmentsAction;

  return (
    <>
      <ScreenHeader
        title={APP_NAME}
        subtitle={t('home.dashboardSubtitle')}
        rightAction={onOpenLanguageSettings ? (
          <AppButton
            testID="home-language-settings"
            title={t('languageSelector.openFromApp')}
            variant="ghost"
            size="sm"
            onPress={onOpenLanguageSettings}
            accessibilityLabel={t('accessibility.languageSettings')}
          />
        ) : undefined}
      />

      <View style={styles.contentStack}>
        {flashMessage ? (
          <AppCard testID="home-flash-message" style={styles.flashBanner}>
            <Text style={styles.flashText}>{flashMessage}</Text>
          </AppCard>
        ) : null}

        {isContextLoading ? (
          <AppCard style={styles.centeredCard}>
            <ActivityIndicator testID="home-loading" size="large" />
            <Text style={styles.loadingText}>{t('runtime.loadingContext')}</Text>
          </AppCard>
        ) : null}

        {contextError ? (
          <AppCard style={styles.centeredCard}>
            <Text style={styles.errorText} testID="home-error">
              {contextError}
            </Text>
          </AppCard>
        ) : null}

        {context && !isContextLoading && !contextError ? (
          <>
            <AppCard testID="home-context">
              <View style={styles.contextHeader}>
                <RoleBadge role={context.role} />

                {context.barbershopName ? (
                  <Text style={styles.detailText} testID="home-barbershop-name">
                    {context.barbershopName}
                  </Text>
                ) : null}

                {context.employeeName ? (
                  <Text style={styles.detailText} testID="home-employee-name">
                    {context.employeeName}
                  </Text>
                ) : null}

                {canShowDashboard && !context.barbershopName ? (
                  <Text style={styles.emptyHint} testID="home-no-context">
                    {t('home.noBarbershopAssigned')}
                  </Text>
                ) : null}
              </View>
            </AppCard>

            {showDailyActions ? (
              <View style={styles.sectionBlock} testID="home-daily-actions-section">
                <SectionHeader title={t('home.dailyActionsTitle')} />
                <Text style={styles.sectionHint}>{t('home.dailyActionsHint')}</Text>
                <View style={styles.tileGrid}>
                  {canRecordService ? (
                    <NavigationTile
                      testID="home-daily-action-record"
                      title={t('home.actionCards.recordService.title')}
                      description={t('home.actionCards.recordService.description')}
                      iconName="add-circle-outline"
                      accessibilityLabel={t('home.dailyActionsAccessibility.recordService')}
                      onPress={onRecordService}
                      style={styles.tileGridItem}
                      variant="primary"
                    />
                  ) : null}

                  {showAppointmentsAction ? (
                    <NavigationTile
                      testID="home-daily-action-appointments"
                      title={t('home.actionCards.appointments.title')}
                      description={t('home.actionCards.appointments.description')}
                      iconName="calendar-outline"
                      accessibilityLabel={t('home.dailyActionsAccessibility.appointments')}
                      onPress={onAppointments}
                      style={styles.tileGridItem}
                    />
                  ) : null}

                  {showAppointmentsAction ? (
                    <NavigationTile
                      testID="home-daily-action-commissions"
                      title={role === 'BARBER' ? t('commissions.myTitle') : t('commissions.title')}
                      description={t('commissions.homeDescription')}
                      iconName="cash-outline"
                      accessibilityLabel={t('navigation.accessibility.commissions')}
                      onPress={onCommissions}
                      style={styles.tileGridItem}
                    />
                  ) : null}

                  {showCustomersAction ? (
                    <NavigationTile
                      testID="home-daily-action-customers"
                      title={t('home.actionCards.customers.title')}
                      description={t('home.actionCards.customers.description')}
                      iconName="people-outline"
                      accessibilityLabel={t('home.dailyActionsAccessibility.customers')}
                      onPress={onCustomers}
                      style={styles.tileGridItem}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}

            {role === 'CLIENT' ? (
              <AppCard testID="home-client-message" title={t('home.clientMessageTitle')}>
                <Text style={styles.emptyHint}>{t('home.clientMessageBody')}</Text>
              </AppCard>
            ) : null}

            {showRevenueSection ? (
              <View testID="home-revenue-section" style={styles.sectionBlock}>
                <SectionHeader title={t('home.revenueOverviewTitle')} />
                <Text style={styles.sectionHint}>{t('home.revenueOverviewHint')}</Text>

                <AppCard testID="summary-period-controls" variant="outlined">
                  <SectionHeader title={t('home.revenuePeriodTitle')} />
                  <View style={styles.periodGrid}>
                    {summaryPeriodOptions.map((option) => (
                      <AppButton
                        key={option.value}
                        testID={`summary-period-${option.value}`}
                        title={option.label}
                        variant={summaryPeriod === option.value ? 'primary' : 'ghost'}
                        size="sm"
                        onPress={() => onSummaryPeriodChange(option.value)}
                        style={styles.periodButton}
                      />
                    ))}
                  </View>
                </AppCard>

                {showOwnerEmployeeFilterCard ? (
                  <AppCard testID="summary-employee-filter" variant="outlined">
                    <SectionHeader title={t('home.barberFilterTitle')} />

                    {isOwnerEmployeeFiltersLoading && ownerEmployeeFilters.length === 0 ? (
                      <View style={styles.inlineState} testID="summary-employee-filter-loading">
                        <ActivityIndicator size="small" />
                        <Text style={styles.loadingText}>{t('home.noOwnerFilterEmployees')}</Text>
                      </View>
                    ) : null}

                    {ownerEmployeeFiltersError ? (
                      <View style={styles.filterStatusBlock}>
                        <Text style={styles.errorText} testID="summary-employee-filter-error">
                          {ownerEmployeeFiltersError}
                        </Text>
                        <AppButton
                          testID="summary-employee-filter-retry"
                          title={t('common.actions.retry')}
                          variant="secondary"
                          size="md"
                          onPress={onRetryOwnerEmployeeFilters}
                          style={styles.retryButton}
                        />
                      </View>
                    ) : null}

                    {ownerEmployeeFilters.length > 0 ? (
                      <>
                        {isOwnerEmployeeFiltersLoading ? (
                          <Text style={styles.loadingText} testID="summary-employee-filter-refreshing">
                            {t('home.refreshingOwnerFilterEmployees')}
                          </Text>
                        ) : null}
                        <View style={styles.employeeFilterList}>
                          {ownerEmployeeFilters.map((filter) => (
                            <AppButton
                              key={filter.id}
                              testID={filter.testID}
                              title={filter.label}
                              variant={filter.selected ? 'primary' : 'secondary'}
                              size="md"
                              onPress={filter.onPress}
                              style={styles.employeeFilterButton}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}

                    {showOwnerEmployeeFilterEmptyState ? (
                      <EmptyState
                        testID="summary-employee-filter-empty"
                        title={t('home.noActiveBarbersTitle')}
                        message={t('home.noActiveBarbersMessage')}
                      />
                    ) : null}
                  </AppCard>
                ) : null}

                {isSummaryLoading ? (
                  <AppCard style={styles.centeredCard}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.loadingText}>{t('home.loadingSummary')}</Text>
                  </AppCard>
                ) : null}

                {summaryError ? (
                  <AppCard>
                    <Text style={styles.errorText} testID="home-summary-error">
                      {summaryError}
                    </Text>
                  </AppCard>
                ) : null}

                {role === 'OWNER' && summary && !isSummaryLoading && !summaryError ? (
                  <AppCard testID="home-owner-summary">
                    <DailySummarySection
                      byEmployee={'byEmployee' in summary ? summary.byEmployee : undefined}
                      byPaymentMethod={summary.byPaymentMethod}
                      titleLabel={summaryPeriodLabel}
                      selectedDate={selectedDate}
                      totalRecords={summary.totalRecords}
                      totalRevenueCents={summary.totalRevenueCents}
                    />
                  </AppCard>
                ) : null}

                {role === 'BARBER' && summary && !isSummaryLoading && !summaryError ? (
                  <AppCard testID="home-barber-summary">
                    <DailySummarySection
                      byPaymentMethod={summary.byPaymentMethod}
                      titleLabel={summaryPeriodLabel}
                      selectedDate={selectedDate}
                      totalRecords={summary.totalRecords}
                      totalRevenueCents={summary.totalRevenueCents}
                    />
                  </AppCard>
                ) : null}
              </View>
            ) : null}

            {showRecordsSection ? (
              <View testID="home-records-block" style={styles.sectionBlock}>
                <SectionHeader title={t('home.recordsSectionTitle')} />
                <Text style={styles.sectionHint}>{t('home.recordsSectionHint')}</Text>

                <AppCard testID="date-controls" variant="outlined">
                  <Text style={styles.controlEyebrow}>{t('home.selectedDate')}</Text>
                  <Text style={styles.dateDisplay} testID="date-display">
                    {formatBusinessDateLabel(selectedDate)}
                  </Text>
                  <View style={styles.dateRow}>
                    <AppButton
                      testID="date-prev"
                      title={t('common.actions.previous')}
                      variant="secondary"
                      size="sm"
                      onPress={onPrevDate}
                      style={styles.dateButton}
                    />
                    <AppButton
                      testID="date-today"
                      title={t('common.actions.today')}
                      variant="secondary"
                      size="sm"
                      disabled={isTodayDateString(selectedDate)}
                      onPress={onToday}
                      style={styles.dateButton}
                    />
                    <AppButton
                      testID="date-next"
                      title={t('common.actions.next')}
                      variant="secondary"
                      size="sm"
                      onPress={onNextDate}
                      style={styles.dateButton}
                    />
                  </View>
                </AppCard>

                {isRecordsLoading ? (
                  <AppCard style={styles.centeredCard}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.loadingText}>{t('home.loadingRecords')}</Text>
                  </AppCard>
                ) : null}

                {recordsError ? (
                  <AppCard>
                    <Text style={styles.errorText} testID="home-records-error">
                      {recordsError}
                    </Text>
                  </AppCard>
                ) : null}

                {!isRecordsLoading && !recordsError ? (
                  <AppCard title={t('home.recordsForDateTitle')} testID="home-records-section">
                    {records.length === 0 ? (
                      <EmptyState
                        testID="home-records-empty"
                        title={t('home.noRecordsForDate')}
                      />
                    ) : (
                      <View style={styles.recordList}>
                        {records.map((record) => renderRecordCard(record, showBarberNames, t))}
                      </View>
                    )}
                  </AppCard>
                ) : null}
              </View>
            ) : null}

            {canShowDashboard && !context.barbershopId && !isSummaryLoading && !summary ? (
              <AppCard>
                <Text style={styles.emptyHint}>
                  {role === 'OWNER'
                    ? t('home.ownerSummaryUnavailable')
                    : t('home.barberSummaryUnavailable')}
                </Text>
              </AppCard>
            ) : null}
          </>
        ) : null}
      </View>
    </>
  );
}

function renderRecordCard(
  record: ServiceRecord,
  showBarberNames: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const recordTime = formatRecordTime(record.performedAt);

  return (
    <AppCard
      key={record.id}
      testID={`record-${record.id}`}
      variant="outlined"
      style={styles.recordCard}
    >
      <View style={styles.recordRowMain}>
        <Text style={styles.recordServiceName}>
          {record.service?.name ?? t('home.unknownService')}
        </Text>
        <Text style={styles.recordPrice}>
          {formatCentsForDisplay(record.priceCents)}
        </Text>
      </View>

      {showBarberNames && record.employee?.user?.name ? (
        <Text style={styles.recordDetail}>{record.employee.user.name}</Text>
      ) : null}

      <View style={styles.recordRowDetails}>
        {record.paymentMethod ? (
          <Text style={styles.recordDetail}>
            {formatPaymentMethodLabel(record.paymentMethod)}
          </Text>
        ) : null}
        {recordTime ? <Text style={styles.recordDetail}>{recordTime}</Text> : null}
      </View>

      {record.clientName ? (
        <Text style={styles.recordDetail} numberOfLines={1}>
          {t('home.recordClient', { name: record.clientName })}
        </Text>
      ) : null}

      {record.notes ? (
        <Text style={styles.recordNotes} numberOfLines={2}>
          {record.notes}
        </Text>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: tokens.layout.majorSectionGap,
  },
  flashBanner: {
    backgroundColor: tokens.colors.success,
  },
  flashText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textInverse,
    textAlign: 'center',
  },
  centeredCard: {
    alignItems: 'center',
  },
  loadingText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  contextHeader: {
    gap: tokens.layout.relatedCardGap,
  },
  detailText: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  emptyHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textMuted,
    fontStyle: 'italic',
  },
  sectionBlock: {
    gap: tokens.layout.sectionContentGap,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.layout.relatedCardGap,
  },
  tileGridItem: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 220,
  },
  sectionHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  controlEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dateRow: {
    flexDirection: 'row',
    gap: tokens.layout.compactControlGap,
  },
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.layout.compactControlGap,
  },
  periodButton: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 44,
  },
  inlineState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.layout.compactControlGap,
  },
  filterStatusBlock: {
    gap: tokens.layout.relatedCardGap,
  },
  retryButton: {
    minHeight: 44,
  },
  employeeFilterList: {
    gap: tokens.layout.compactControlGap,
  },
  employeeFilterButton: {
    width: '100%',
    minHeight: 44,
  },
  dateButton: {
    flex: 1,
    minHeight: 44,
  },
  dateDisplay: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  recordList: {
    gap: tokens.layout.relatedCardGap,
  },
  recordCard: {
    marginBottom: 0,
  },
  recordRowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing[1],
  },
  recordServiceName: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
    flex: 1,
  },
  recordPrice: {
    ...tokens.typography.variant.body,
    color: tokens.colors.success,
    fontWeight: tokens.typography.weight.semibold,
  },
  recordRowDetails: {
    flexDirection: 'row',
    gap: tokens.layout.relatedCardGap,
    marginBottom: tokens.spacing[1],
  },
  recordDetail: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  recordNotes: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    fontStyle: 'italic',
  },
});
