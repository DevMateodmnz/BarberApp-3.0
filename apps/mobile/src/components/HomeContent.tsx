import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  AppButton,
  AppCard,
  EmptyState,
  RoleBadge,
  ScreenHeader,
} from '@/components/ui/index.js';
import { DailySummarySection } from '@/components/DailySummarySection.js';
import { tokens } from '@/theme/index.js';
import {
  formatCentsForDisplay,
  formatPaymentMethodLabel,
  formatRecordTime,
  isTodayDateString,
} from '@/lib/format.js';
import type { DailySummary, ServiceRecord } from '@/lib/types.js';

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

          {canShowDashboard && (
            <AppCard testID="date-controls">
              <View style={styles.dateRow}>
                <AppButton
                  testID="date-prev"
                  title="‹"
                  variant="secondary"
                  size="sm"
                  onPress={onPrevDate}
                />
                <AppButton
                  testID="date-today"
                  title="Today"
                  variant="secondary"
                  size="sm"
                  disabled={isTodayDateString(selectedDate)}
                  onPress={onToday}
                />
                <Text style={styles.dateDisplay} testID="date-display">
                  {selectedDate}
                </Text>
                <AppButton
                  testID="date-next"
                  title="›"
                  variant="secondary"
                  size="sm"
                  onPress={onNextDate}
                />
              </View>
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
                selectedDate={selectedDate}
                totalRecords={summary.totalRecords}
                totalRevenueCents={summary.totalRevenueCents}
              />
            </AppCard>
          )}

          {canShowDashboard && (
            <>
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
                <AppCard title="Service Records" testID="home-records-section">
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
            </>
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing[2],
  },
  dateDisplay: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
    fontFamily: 'monospace',
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
