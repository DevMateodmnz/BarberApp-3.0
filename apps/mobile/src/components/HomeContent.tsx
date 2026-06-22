import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  AppButton,
  AppCard,
  EmptyState,
  RoleBadge,
  ScreenHeader,
  SectionHeader,
} from '@/components/ui/index.js';
import { DailySummarySection } from '@/components/DailySummarySection.js';
import { tokens } from '@/theme/index.js';
import {
  formatCentsForDisplay,
  formatPaymentMethodLabel,
  formatRecordTime,
  isTodayDateString,
} from '@/lib/format.js';
import type { DailySummary, RevenueSummaryPeriod, ServiceRecord } from '@/lib/types.js';

const SUMMARY_PERIOD_OPTIONS: Array<{ value: RevenueSummaryPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

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
  onServices: () => void;
  onEmployees: () => void;
  onWorkingHours: () => void;
  onAppointments: () => void;
  onPrevDate: () => void;
  onNextDate: () => void;
  onToday: () => void;
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
  onServices,
  onEmployees,
  onWorkingHours,
  onAppointments,
  onPrevDate,
  onNextDate,
  onToday,
}: HomeContentProps) {
  const role = context?.role;
  const showBarberNames = role === 'OWNER';
  const canShowDashboard = role === 'OWNER' || role === 'BARBER';
  const showRevenueSection = canShowDashboard && !!context?.barbershopId;
  const showRecordsSection = canShowDashboard && !!context?.barbershopId;
  const showOwnerEmployeeFilterCard = role === 'OWNER' && !!context?.barbershopId;
  const showOwnerEmployeeFilterEmptyState =
    showOwnerEmployeeFilterCard &&
    hasLoadedOwnerEmployeeFilters &&
    !isOwnerEmployeeFiltersLoading &&
    !ownerEmployeeFiltersError &&
    ownerEmployeeFilters.length === 0;

  return (
    <>
      <ScreenHeader title="BarberApp" subtitle="Dashboard" />

      {flashMessage && (
        <AppCard testID="home-flash-message" style={styles.flashBanner}>
          <Text style={styles.flashText}>{flashMessage}</Text>
        </AppCard>
      )}

      {isContextLoading && (
        <AppCard style={styles.centeredCard}>
          <ActivityIndicator testID="home-loading" size="large" />
          <Text style={styles.loadingText}>Loading your context…</Text>
        </AppCard>
      )}

      {contextError && (
        <AppCard style={styles.centeredCard}>
          <Text style={styles.errorText} testID="home-error">
            {contextError}
          </Text>
        </AppCard>
      )}

      {context && !isContextLoading && !contextError && (
        <>
          <AppCard testID="home-context">
            <View style={styles.contextHeader}>
              <RoleBadge role={context.role} />

              {context.barbershopName && (
                <Text style={styles.detailText} testID="home-barbershop-name">
                  {context.barbershopName}
                </Text>
              )}

              {context.employeeName && (
                <Text style={styles.detailText} testID="home-employee-name">
                  {context.employeeName}
                </Text>
              )}

              {canShowDashboard && !context.barbershopName && (
                <Text style={styles.emptyHint} testID="home-no-context">
                  No barbershop assigned yet.
                </Text>
              )}
            </View>
          </AppCard>

          {canRecordService && (
            <ActionCard
              testID="home-record-service-card"
              title="Record Service"
              description="Add a completed service record without leaving the mobile app."
              buttonTestID="home-record-service-button"
              buttonTitle="Open Form"
              onPress={onRecordService}
            />
          )}

          {role === 'OWNER' && !!context.barbershopId && (
            <>
              <ActionCard
                testID="home-services-card"
                title="Services"
                description="View your barbershop service catalog."
                buttonTestID="home-services-button"
                buttonTitle="View Services"
                onPress={onServices}
              />

              <ActionCard
                testID="home-employees-card"
                title="Employees"
                description="View and manage your barbershop employee roster."
                buttonTestID="home-employees-button"
                buttonTitle="View Employees"
                onPress={onEmployees}
              />

              <ActionCard
                testID="home-working-hours-card"
                title="Working Hours"
                description="Set your barbershop weekly schedule."
                buttonTestID="home-working-hours-button"
                buttonTitle="View Working Hours"
                onPress={onWorkingHours}
              />
            </>
          )}

          {canShowDashboard && !!context.barbershopId && (
            <ActionCard
              testID="home-appointments-card"
              title="Appointments"
              description="View and manage today's appointments."
              buttonTestID="home-appointments-button"
              buttonTitle="View Appointments"
              onPress={onAppointments}
            />
          )}

          {role === 'CLIENT' && (
            <AppCard testID="home-client-message" title="Dashboard">
              <Text style={styles.emptyHint}>Coming soon for clients.</Text>
            </AppCard>
          )}

          {showRevenueSection && (
            <View testID="home-revenue-section" style={styles.sectionBlock}>
              <SectionHeader title="Revenue overview" />
              <Text style={styles.sectionHint}>
                Period filters apply only to revenue totals.
              </Text>

              <AppCard testID="summary-period-controls" variant="outlined">
                <SectionHeader title="Revenue period" />
                <View style={styles.periodGrid}>
                  {SUMMARY_PERIOD_OPTIONS.map((option) => (
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

              {showOwnerEmployeeFilterCard && (
                <AppCard testID="summary-employee-filter" variant="outlined">
                  <SectionHeader title="Barber filter" />

                  {isOwnerEmployeeFiltersLoading && ownerEmployeeFilters.length === 0 && (
                    <View style={styles.inlineState} testID="summary-employee-filter-loading">
                      <ActivityIndicator size="small" />
                      <Text style={styles.loadingText}>Loading barbers…</Text>
                    </View>
                  )}

                  {ownerEmployeeFiltersError && (
                    <View style={styles.filterStatusBlock}>
                      <Text style={styles.errorText} testID="summary-employee-filter-error">
                        {ownerEmployeeFiltersError}
                      </Text>
                      <AppButton
                        testID="summary-employee-filter-retry"
                        title="Retry"
                        variant="secondary"
                        size="md"
                        onPress={onRetryOwnerEmployeeFilters}
                        style={styles.retryButton}
                      />
                    </View>
                  )}

                  {ownerEmployeeFilters.length > 0 && (
                    <>
                      {isOwnerEmployeeFiltersLoading && (
                        <Text
                          style={styles.loadingText}
                          testID="summary-employee-filter-refreshing"
                        >
                          Refreshing barbers…
                        </Text>
                      )}
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
                  )}

                  {showOwnerEmployeeFilterEmptyState && (
                    <EmptyState
                      testID="summary-employee-filter-empty"
                      title="No active barbers yet."
                      message="Active barbers will appear here when they can be filtered."
                    />
                  )}
                </AppCard>
              )}

              {isSummaryLoading && (
                <AppCard style={styles.centeredCard}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.loadingText}>Loading summary…</Text>
                </AppCard>
              )}

              {summaryError && (
                <AppCard>
                  <Text style={styles.errorText} testID="home-summary-error">
                    {summaryError}
                  </Text>
                </AppCard>
              )}

              {role === 'OWNER' && summary && !isSummaryLoading && !summaryError && (
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
              )}

              {role === 'BARBER' && summary && !isSummaryLoading && !summaryError && (
                <AppCard testID="home-barber-summary">
                  <DailySummarySection
                    byPaymentMethod={summary.byPaymentMethod}
                    titleLabel={summaryPeriodLabel}
                    selectedDate={selectedDate}
                    totalRecords={summary.totalRecords}
                    totalRevenueCents={summary.totalRevenueCents}
                  />
                </AppCard>
              )}
            </View>
          )}

          {showRecordsSection && (
            <View testID="home-records-block" style={styles.sectionBlock}>
              <SectionHeader title="Service records" />
              <Text style={styles.sectionHint}>
                Selected date applies only to the records list below.
              </Text>

              <AppCard testID="date-controls" variant="outlined">
                <Text style={styles.controlEyebrow}>Selected date</Text>
                <Text style={styles.dateDisplay} testID="date-display">
                  {selectedDate}
                </Text>
                <View style={styles.dateRow}>
                  <AppButton
                    testID="date-prev"
                    title="Previous"
                    variant="secondary"
                    size="sm"
                    onPress={onPrevDate}
                    style={styles.dateButton}
                  />
                  <AppButton
                    testID="date-today"
                    title="Today"
                    variant="secondary"
                    size="sm"
                    disabled={isTodayDateString(selectedDate)}
                    onPress={onToday}
                    style={styles.dateButton}
                  />
                  <AppButton
                    testID="date-next"
                    title="Next"
                    variant="secondary"
                    size="sm"
                    onPress={onNextDate}
                    style={styles.dateButton}
                  />
                </View>
              </AppCard>

              {isRecordsLoading && (
                <AppCard style={styles.centeredCard}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.loadingText}>Loading records…</Text>
                </AppCard>
              )}

              {recordsError && (
                <AppCard>
                  <Text style={styles.errorText} testID="home-records-error">
                    {recordsError}
                  </Text>
                </AppCard>
              )}

              {!isRecordsLoading && !recordsError && (
                <AppCard title="Records for this date" testID="home-records-section">
                  {records.length === 0 ? (
                    <EmptyState
                      testID="home-records-empty"
                      title="No service records for this date."
                    />
                  ) : (
                    records.map((record) => renderRecordCard(record, showBarberNames))
                  )}
                </AppCard>
              )}
            </View>
          )}

          {canShowDashboard && !context.barbershopId && !isSummaryLoading && !summary && (
            <AppCard>
              <Text style={styles.emptyHint}>
                {role === 'OWNER'
                  ? 'No barbershop assigned yet. Summary will appear when a barbershop is linked to your account.'
                  : 'No employee record found. Summary will appear when you are linked to a barbershop.'}
              </Text>
            </AppCard>
          )}
        </>
      )}
    </>
  );
}

interface ActionCardProps {
  testID: string;
  title: string;
  description: string;
  buttonTestID: string;
  buttonTitle: string;
  onPress: () => void;
}

function ActionCard({
  testID,
  title,
  description,
  buttonTestID,
  buttonTitle,
  onPress,
}: ActionCardProps) {
  return (
    <AppCard testID={testID} title={title}>
      <Text style={styles.actionText}>{description}</Text>
      <View style={styles.actionButtonWrapper}>
        <AppButton
          testID={buttonTestID}
          title={buttonTitle}
          onPress={onPress}
        />
      </View>
    </AppCard>
  );
}

function renderRecordCard(record: ServiceRecord, showBarberNames: boolean) {
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
          {record.service?.name ?? 'Unknown service'}
        </Text>
        <Text style={styles.recordPrice}>
          {formatCentsForDisplay(record.priceCents)}
        </Text>
      </View>

      {showBarberNames && record.employee?.user?.name && (
        <Text style={styles.recordDetail}>{record.employee.user.name}</Text>
      )}

      <View style={styles.recordRowDetails}>
        {record.paymentMethod && (
          <Text style={styles.recordDetail}>
            {formatPaymentMethodLabel(record.paymentMethod)}
          </Text>
        )}
        {recordTime && (
          <Text style={styles.recordDetail}>{recordTime}</Text>
        )}
      </View>

      {record.clientName && (
        <Text style={styles.recordDetail} numberOfLines={1}>
          Client: {record.clientName}
        </Text>
      )}

      {record.notes && (
        <Text style={styles.recordNotes} numberOfLines={2}>
          {record.notes}
        </Text>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
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
    gap: tokens.spacing[2],
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
  actionText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
  },
  actionButtonWrapper: {
    marginTop: tokens.spacing[3],
  },
  sectionBlock: {
    gap: tokens.spacing[3],
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
    gap: tokens.spacing[2],
  },
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  periodButton: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 44,
  },
  inlineState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  filterStatusBlock: {
    gap: tokens.spacing[3],
  },
  retryButton: {
    minHeight: 44,
  },
  employeeFilterList: {
    gap: tokens.spacing[2],
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
  recordCard: {
    marginBottom: tokens.spacing[2],
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
    gap: tokens.spacing[3],
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
