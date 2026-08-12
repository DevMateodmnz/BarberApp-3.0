import { Pressable, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  RoleBadge,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import { formatCurrencyMinorUnits, formatLocalizedDate } from '@/i18n/index.js';
import {
  type AppointmentCreationErrorKey,
  type AppointmentCreationField,
  type AppointmentCreationValidationKey,
} from '@/lib/appointmentCreationDomain.js';
import { formatBusinessDateLabel, getTodayDateString } from '@/lib/format.js';
import type {
  CurrentUserContext,
  LoyaltyCustomerSummary,
  StaffPromotionQuote,
} from '@/lib/types.js';
import { tokens } from '@/theme/index.js';

export interface AppointmentEmployeeOption {
  id: string;
  label: string;
  selected: boolean;
  testID: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export interface AppointmentServiceOption {
  id: string;
  label: string;
  detail: string;
  selected: boolean;
  testID: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export interface AppointmentSlotOption {
  startAt: string;
  label: string;
  selected: boolean;
  testID: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export interface AppointmentBookingSummaryViewModel {
  serviceName: string;
  employeeName: string;
  dateLabel: string;
  timeRangeLabel: string;
  priceLabel: string;
  durationLabel?: string | null;
  clientName?: string | null;
}

export interface CustomerWarning {
  noShowCount: number;
  lastNoShowAt: string | null;
}

export interface AppointmentCreateScreenViewProps {
  context: CurrentUserContext | null;
  isContextLoading: boolean;
  contextError: string | null;
  blockingTitle: string | null;
  blockingMessage: string | null;
  employeesStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  employeesError: string | null;
  employeeOptions: AppointmentEmployeeOption[];
  servicesStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  servicesError: string | null;
  serviceOptions: AppointmentServiceOption[];
  selectedEmployeeName: string | null;
  selectedDate: string;
  canMoveToPreviousDate: boolean;
  isDateSectionEnabled: boolean;
  availabilityStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  availabilityErrorKey: AppointmentCreationErrorKey | null;
  slotOptions: AppointmentSlotOption[];
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  notes: string;
  promotionCode: string;
  promotionQuote: Extract<StaffPromotionQuote, { eligible: true }> | null;
  promotionMessage: string | null;
  isQuotingPromotion: boolean;
  customerWarning: CustomerWarning | null;
  customerLoyalty: Pick<
    LoyaltyCustomerSummary,
    'programEnabled' | 'visitsRequired' | 'currentStampCount' | 'availableRewardCount' | 'rewards'
  > | null;
  fieldErrors: Partial<Record<AppointmentCreationField, AppointmentCreationValidationKey>>;
  submissionErrorKey: AppointmentCreationErrorKey | null;
  summary: AppointmentBookingSummaryViewModel | null;
  isSubmitting: boolean;
  onBack: () => void;
  onRetryEmployees: () => void;
  onRetryServices: () => void;
  onSelectToday: () => void;
  onSelectPreviousDate: () => void;
  onSelectNextDate: () => void;
  onRetryAvailability: () => void;
  onClientNameChange: (value: string) => void;
  onClientPhoneChange: (value: string) => void;
  onClientEmailChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onPromotionCodeChange: (value: string) => void;
  onApplyPromotion: () => void;
  onApplyLoyaltyReward: (code: string) => void;
  onRemovePromotion: () => void;
  onSubmit: () => void;
}

interface SelectorCardProps {
  testID: string;
  title: string;
  subtitle?: string;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

function SelectorCard({
  testID,
  title,
  subtitle,
  selected,
  accessibilityLabel,
  onPress,
}: SelectorCardProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.selectorPressed]}
    >
      <AppCard variant="outlined" style={[styles.selectorCard, selected && styles.selectorCardSelected]}>
        <Text style={[styles.selectorTitle, selected && styles.selectorTitleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.selectorSubtitle}>{subtitle}</Text> : null}
      </AppCard>
    </Pressable>
  );
}

function AppointmentSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function getValidationMessage(
  key: AppointmentCreationValidationKey | undefined,
  t: (key: string) => string,
): string | null {
  if (!key) {
    return null;
  }

  return t(`appointmentCreation.validation.${key}`);
}

function getSemanticErrorMessage(
  key: AppointmentCreationErrorKey | null,
  t: (key: string) => string,
): string | null {
  if (!key) {
    return null;
  }

  return t(`appointmentCreation.errors.semantic.${key}`);
}

export function AppointmentCreateScreenView({
  context,
  isContextLoading,
  contextError,
  blockingTitle,
  blockingMessage,
  employeesStatus,
  employeesError,
  employeeOptions,
  servicesStatus,
  servicesError,
  serviceOptions,
  selectedEmployeeName,
  selectedDate,
  canMoveToPreviousDate,
  isDateSectionEnabled,
  availabilityStatus,
  availabilityErrorKey,
  slotOptions,
  clientName,
  clientPhone,
  clientEmail,
  notes,
  promotionCode,
  promotionQuote,
  promotionMessage,
  isQuotingPromotion,
  customerWarning,
  customerLoyalty,
  fieldErrors,
  submissionErrorKey,
  summary,
  isSubmitting,
  onBack,
  onRetryEmployees,
  onRetryServices,
  onSelectToday,
  onSelectPreviousDate,
  onSelectNextDate,
  onRetryAvailability,
  onClientNameChange,
  onClientPhoneChange,
  onClientEmailChange,
  onNotesChange,
  onPromotionCodeChange,
  onApplyPromotion,
  onApplyLoyaltyReward,
  onRemovePromotion,
  onSubmit,
}: AppointmentCreateScreenViewProps) {
  const { t } = useTranslation();
  const isOwner = context?.role === 'OWNER';
  const isBarber = context?.role === 'BARBER';
  const fieldErrorEmployee = getValidationMessage(fieldErrors.employeeId, t);
  const fieldErrorService = getValidationMessage(fieldErrors.serviceId, t);
  const fieldErrorDate = getValidationMessage(fieldErrors.localDate, t);
  const fieldErrorSlot = getValidationMessage(fieldErrors.selectedSlot, t);
  const fieldErrorClientName = getValidationMessage(fieldErrors.clientName, t);
  const fieldErrorClientPhone = getValidationMessage(fieldErrors.clientPhone, t);
  const fieldErrorClientEmail = getValidationMessage(fieldErrors.clientEmail, t);
  const fieldErrorNotes = getValidationMessage(fieldErrors.notes, t);
  const fieldErrorPromotionCode = getValidationMessage(fieldErrors.promotionCode, t);
  const submissionError = getSemanticErrorMessage(submissionErrorKey, t);
  const availabilityError = getSemanticErrorMessage(availabilityErrorKey, t);
  const hasEmployeeResolved = isOwner ? employeeOptions.some((option) => option.selected) : !!context?.employeeId;
  const hasSelectedDate = selectedDate.length > 0;
  const dateLabel = hasSelectedDate
    ? formatBusinessDateLabel(selectedDate)
    : t('appointmentCreation.labels.noDateSelected');
  const isSelectedDateToday = selectedDate === getTodayDateString();

  if (isContextLoading && !context) {
    return (
      <Screen>
        <ScreenHeader
          testID="appointment-create"
          title={t('appointmentCreation.title')}
          subtitle={t('appointmentCreation.subtitleOwner')}
          onBack={onBack}
        />
        <AppCard testID="appointment-create-context-loading" style={styles.centeredCard}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text style={styles.helperText}>{t('runtime.loadingContext')}</Text>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen scrollable keyboardAware testID="appointment-create-screen">
      <ScreenHeader
        testID="appointment-create"
        title={t('appointmentCreation.title')}
        subtitle={isBarber ? t('appointmentCreation.subtitleBarber') : t('appointmentCreation.subtitleOwner')}
        onBack={onBack}
        rightAction={context ? <RoleBadge role={context.role} /> : undefined}
      />

      {contextError ? (
        <AppCard testID="appointment-create-context-error" style={styles.centeredCard}>
          <Text style={styles.errorText}>{contextError}</Text>
        </AppCard>
      ) : null}

      {!context && !isContextLoading && !contextError ? (
        <AppCard>
          <EmptyState
            testID="appointment-create-no-context"
            title={t('common.states.noContextTitle')}
            message={t('common.states.noContextMessage')}
          />
        </AppCard>
      ) : null}

      {context ? (
        <>
          <AppCard testID="appointment-create-context" variant="outlined" style={styles.contextCard}>
            <Text style={styles.contextEyebrow}>{t('common.labels.scheduleScope')}</Text>
            <Text style={styles.contextTitle}>
              {context.barbershopName ?? t('appointments.contextFallbackTitle')}
            </Text>
            <Text style={styles.contextBody}>
              {isBarber ? t('appointmentCreation.helpers.barberContext') : t('appointmentCreation.helpers.employee')}
            </Text>
            {isBarber && selectedEmployeeName ? (
              <Text style={styles.contextMeta}>
                {t('appointmentCreation.readonlyBarberLabel')}: {selectedEmployeeName}
              </Text>
            ) : null}
          </AppCard>

          {blockingMessage ? (
            <AppCard>
              <EmptyState
                testID="appointment-create-blocked"
                title={blockingTitle ?? t('appointmentCreation.states.invalidBarberContextTitle')}
                message={blockingMessage}
              />
            </AppCard>
          ) : (
            <>
              {isOwner ? (
                <AppCard testID="appointment-create-employee-card">
                  <FormSection
                    testID="appointment-create-employee-section"
                    title={t('appointmentCreation.sections.employee')}
                    helper={t('appointmentCreation.helpers.employee')}
                  >
                    {employeesStatus === 'loading' ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={tokens.colors.primary} />
                        <Text style={styles.helperText}>{t('appointmentCreation.states.loadingEmployees')}</Text>
                      </View>
                    ) : null}

                    {employeesStatus === 'empty' ? (
                      <EmptyState
                        testID="appointment-create-employees-empty"
                        title={t('appointmentCreation.states.employeesEmptyTitle')}
                        message={t('appointmentCreation.states.employeesEmptyMessage')}
                      />
                    ) : null}

                    {employeesStatus === 'error' ? (
                      <View style={styles.stateStack}>
                        <Text style={styles.errorText} testID="appointment-create-employees-error">
                          {employeesError ?? t('appointmentCreation.errors.screenFallback')}
                        </Text>
                        <AppButton
                          testID="appointment-create-retry-employees"
                          title={t('common.actions.retry')}
                          variant="secondary"
                          onPress={onRetryEmployees}
                        />
                      </View>
                    ) : null}

                    {employeeOptions.length > 0 ? (
                      <View style={styles.selectionList}>
                        {employeeOptions.map((employee) => (
                          <SelectorCard
                            key={employee.id}
                            testID={employee.testID}
                            title={employee.label}
                            selected={employee.selected}
                            accessibilityLabel={employee.accessibilityLabel}
                            onPress={employee.onPress}
                          />
                        ))}
                      </View>
                    ) : null}

                    {fieldErrorEmployee ? (
                      <Text style={styles.errorText} testID="appointment-create-employee-error">{fieldErrorEmployee}</Text>
                    ) : null}
                  </FormSection>
                </AppCard>
              ) : null}

              <AppCard testID="appointment-create-service-card">
                <FormSection
                  testID="appointment-create-service-section"
                  title={t('appointmentCreation.sections.service')}
                  helper={t('appointmentCreation.helpers.service')}
                >
                  {!hasEmployeeResolved ? (
                    <Text style={styles.helperText}>{t('appointmentCreation.helpers.selectEmployeeFirst')}</Text>
                  ) : null}

                  {hasEmployeeResolved && servicesStatus === 'loading' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={tokens.colors.primary} />
                      <Text style={styles.helperText}>{t('appointmentCreation.states.loadingServices')}</Text>
                    </View>
                  ) : null}

                  {hasEmployeeResolved && servicesStatus === 'empty' ? (
                    <EmptyState
                      testID="appointment-create-services-empty"
                      title={t('appointmentCreation.states.servicesEmptyTitle')}
                      message={isBarber
                        ? t('appointmentCreation.states.servicesEmptyBarberMessage')
                        : t('appointmentCreation.states.servicesEmptyOwnerMessage')}
                    />
                  ) : null}

                  {hasEmployeeResolved && servicesStatus === 'error' ? (
                    <View style={styles.stateStack}>
                      <Text style={styles.errorText} testID="appointment-create-services-error">
                        {servicesError ?? t('appointmentCreation.errors.screenFallback')}
                      </Text>
                      <AppButton
                        testID="appointment-create-retry-services"
                        title={t('common.actions.retry')}
                        variant="secondary"
                        onPress={onRetryServices}
                      />
                    </View>
                  ) : null}

                  {hasEmployeeResolved && serviceOptions.length > 0 ? (
                    <View style={styles.selectionList}>
                      {serviceOptions.map((service) => (
                        <SelectorCard
                          key={service.id}
                          testID={service.testID}
                          title={service.label}
                          subtitle={service.detail}
                          selected={service.selected}
                          accessibilityLabel={service.accessibilityLabel}
                          onPress={service.onPress}
                        />
                      ))}
                    </View>
                  ) : null}

                  {fieldErrorService ? (
                    <Text style={styles.errorText} testID="appointment-create-service-error">{fieldErrorService}</Text>
                  ) : null}
                </FormSection>
              </AppCard>

              <AppCard testID="appointment-create-date-card">
                <FormSection
                  testID="appointment-create-date-section"
                  title={t('appointmentCreation.sections.date')}
                  helper={t('appointmentCreation.helpers.date')}
                >
                  {!isDateSectionEnabled ? (
                    <Text style={styles.helperText}>{t('appointmentCreation.helpers.selectServiceFirst')}</Text>
                  ) : null}

                  <View style={[styles.dateCard, !isDateSectionEnabled && styles.sectionDisabled]}>
                    <Text style={styles.dateEyebrow}>{t('common.labels.selectedDate')}</Text>
                    <Text style={styles.dateDisplay} testID="appointment-create-date-display">{dateLabel}</Text>
                    <Text style={styles.dateHint}>
                      {hasSelectedDate
                        ? (isSelectedDateToday
                          ? t('appointmentCreation.labels.dateHintToday')
                          : t('appointmentCreation.labels.dateHintBrowse'))
                        : t('appointmentCreation.labels.dateHintBrowse')}
                    </Text>
                    <View style={styles.dateActions}>
                      <AppButton
                        testID="appointment-create-date-prev"
                        title={t('common.actions.previous')}
                        variant="secondary"
                        size="sm"
                        disabled={!isDateSectionEnabled || !canMoveToPreviousDate}
                        onPress={onSelectPreviousDate}
                        style={styles.dateActionButton}
                      />
                      <AppButton
                        testID="appointment-create-date-today"
                        title={t('common.actions.today')}
                        variant="primary"
                        size="sm"
                        disabled={!isDateSectionEnabled}
                        onPress={onSelectToday}
                        style={styles.dateActionButton}
                      />
                      <AppButton
                        testID="appointment-create-date-next"
                        title={t('common.actions.next')}
                        variant="secondary"
                        size="sm"
                        disabled={!isDateSectionEnabled}
                        onPress={onSelectNextDate}
                        style={styles.dateActionButton}
                      />
                    </View>
                  </View>

                  {fieldErrorDate ? (
                    <Text style={styles.errorText} testID="appointment-create-date-error">{fieldErrorDate}</Text>
                  ) : null}
                </FormSection>
              </AppCard>

              <AppCard testID="appointment-create-availability-card">
                <FormSection
                  testID="appointment-create-availability-section"
                  title={t('appointmentCreation.sections.time')}
                  helper={t('appointmentCreation.helpers.time')}
                >
                  {availabilityStatus === 'idle' ? (
                    <EmptyState
                      testID="appointment-create-availability-idle"
                      title={t('appointmentCreation.states.availabilityNotReadyTitle')}
                      message={t('appointmentCreation.states.availabilityNotReadyMessage')}
                    />
                  ) : null}

                  {availabilityStatus === 'loading' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={tokens.colors.primary} />
                      <Text style={styles.helperText}>{t('appointmentCreation.states.loadingAvailability')}</Text>
                    </View>
                  ) : null}

                  {availabilityStatus === 'empty' ? (
                    <EmptyState
                      testID="appointment-create-availability-empty"
                      title={t('appointmentCreation.states.availabilityEmptyTitle')}
                      message={t('appointmentCreation.states.availabilityEmptyMessage')}
                    />
                  ) : null}

                  {availabilityStatus === 'error' ? (
                    <View style={styles.stateStack}>
                      <Text style={styles.errorText} testID="appointment-create-availability-error">
                        {availabilityError ?? t('appointmentCreation.errors.screenFallback')}
                      </Text>
                      <AppButton
                        testID="appointment-create-retry-availability"
                        title={t('common.actions.retry')}
                        variant="secondary"
                        onPress={onRetryAvailability}
                      />
                    </View>
                  ) : null}

                  {slotOptions.length > 0 ? (
                    <View style={styles.slotWrap}>
                      {slotOptions.map((slot) => (
                        <AppButton
                          key={slot.startAt}
                          testID={slot.testID}
                          title={slot.label}
                          variant={slot.selected ? 'primary' : 'secondary'}
                          size="sm"
                          accessibilityLabel={slot.accessibilityLabel}
                          accessibilityRole="button"
                          accessibilityState={{ selected: slot.selected }}
                          onPress={slot.onPress}
                          style={styles.slotButton}
                        />
                      ))}
                    </View>
                  ) : null}

                  {fieldErrorSlot ? (
                    <Text style={styles.errorText} testID="appointment-create-slot-error">{fieldErrorSlot}</Text>
                  ) : null}
                </FormSection>
              </AppCard>

              <AppCard testID="appointment-create-client-card">
                <FormSection
                  testID="appointment-create-client-section"
                  title={t('appointmentCreation.sections.client')}
                  helper={t('appointmentCreation.helpers.client')}
                >
                  <AppTextInput
                    testID="appointment-create-client-name"
                    label={t('common.labels.clientName')}
                    value={clientName}
                    onChangeText={onClientNameChange}
                    placeholder={t('appointmentCreation.labels.clientNamePlaceholder')}
                    autoCapitalize="words"
                    error={fieldErrorClientName ?? undefined}
                  />

                  <AppTextInput
                    testID="appointment-create-client-phone"
                    label={t('appointmentCreation.labels.phoneOptional')}
                    value={clientPhone}
                    onChangeText={onClientPhoneChange}
                    placeholder={t('appointmentCreation.labels.clientPhonePlaceholder')}
                    keyboardType="phone-pad"
                    error={fieldErrorClientPhone ?? undefined}
                  />

                  <AppTextInput
                    testID="appointment-create-client-email"
                    label={t('appointmentCreation.labels.clientEmailOptional')}
                    value={clientEmail}
                    onChangeText={onClientEmailChange}
                    placeholder={t('appointmentCreation.labels.clientEmailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={fieldErrorClientEmail ?? undefined}
                  />
                  <Text style={styles.helperText}>
                    {t('appointmentCreation.helpers.clientEmail')}
                  </Text>

                  {customerWarning && customerWarning.noShowCount > 0 ? (
                    <View
                      testID="appointment-create-customer-warning"
                      accessibilityRole="alert"
                      style={styles.customerWarningBanner}
                    >
                      <Text style={styles.customerWarningTitle}>
                        {t('appointmentCreation.warnings.customerHistory.title')}
                      </Text>
                      <Text style={styles.customerWarningBody}>
                        {customerWarning.lastNoShowAt
                          ? t(
                              'appointmentCreation.warnings.customerHistory.bodyWithLastNoShow',
                              {
                                count: customerWarning.noShowCount,
                                date:
                                  formatLocalizedDate(
                                    customerWarning.lastNoShowAt.slice(0, 10),
                                    { year: 'numeric', month: 'long', day: 'numeric' },
                                  ) ?? customerWarning.lastNoShowAt,
                              }
                            )
                          : t(
                              'appointmentCreation.warnings.customerHistory.bodyGeneric',
                              {
                                count: customerWarning.noShowCount,
                              }
                            )}
                      </Text>
                    </View>
                  ) : null}

                  {customerLoyalty?.programEnabled && customerLoyalty.visitsRequired ? (
                    <View
                      style={styles.customerLoyaltyCard}
                      testID="appointment-create-customer-loyalty"
                    >
                      <Text style={styles.customerLoyaltyTitle}>
                        {t('appointmentCreation.loyalty.title')}
                      </Text>
                      <Text style={styles.helperText}>
                        {t('appointmentCreation.loyalty.progress', {
                          current: customerLoyalty.currentStampCount,
                          target: customerLoyalty.visitsRequired,
                        })}
                      </Text>
                      <Text style={styles.helperText}>
                        {t('appointmentCreation.loyalty.rewards', {
                          count: customerLoyalty.availableRewardCount,
                        })}
                      </Text>
                      {customerLoyalty.rewards
                        .filter((reward) => reward.status === 'AVAILABLE')
                        .slice(0, 2)
                        .map((reward) => (
                          <View
                            key={reward.id}
                            style={styles.customerLoyaltyRewardRow}
                            testID={`appointment-create-loyalty-reward-${reward.id}`}
                          >
                            <View style={styles.customerLoyaltyRewardCopy}>
                              <Text style={styles.summaryValue}>{reward.promotionName}</Text>
                              <Text style={styles.helperText}>
                                {t('appointmentCreation.loyalty.rewardCode', {
                                  code: reward.code,
                                })}
                              </Text>
                              {reward.expiresAt ? (
                                <Text style={styles.helperText}>
                                  {t('appointmentCreation.loyalty.rewardExpires', {
                                    value: formatLocalizedDate(reward.expiresAt.slice(0, 10), {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    }) ?? reward.expiresAt,
                                  })}
                                </Text>
                              ) : null}
                            </View>
                            <AppButton
                              testID={`appointment-create-apply-loyalty-${reward.id}`}
                              title={t('appointmentCreation.loyalty.applyReward')}
                              variant="secondary"
                              onPress={() => onApplyLoyaltyReward(reward.code)}
                            />
                          </View>
                        ))}
                    </View>
                  ) : null}

                  <AppTextInput
                    testID="appointment-create-notes"
                    label={t('appointmentCreation.labels.notesOptional')}
                    value={notes}
                    onChangeText={onNotesChange}
                    placeholder={t('appointmentCreation.labels.notesPlaceholder')}
                    multiline
                    textAlignVertical="top"
                    inputStyle={styles.notesInput}
                    error={fieldErrorNotes ?? undefined}
                  />

                  <View style={styles.promotionSection} testID="appointment-create-promotion-section">
                    <AppTextInput
                      testID="appointment-create-promotion-code"
                      label={t('appointmentCreation.labels.promotionCodeOptional')}
                      value={promotionCode}
                      onChangeText={onPromotionCodeChange}
                      placeholder={t('appointmentCreation.labels.promotionCodePlaceholder')}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      error={fieldErrorPromotionCode ?? undefined}
                    />
                    <Text style={styles.helperText}>{t('appointmentCreation.helpers.promotion')}</Text>
                    <View style={styles.promotionActions}>
                      <AppButton
                        testID="appointment-create-apply-promotion"
                        title={t('appointmentCreation.actions.applyPromotion')}
                        loadingText={t('appointmentCreation.actions.applyingPromotion')}
                        loading={isQuotingPromotion}
                        variant="secondary"
                        onPress={onApplyPromotion}
                        disabled={isQuotingPromotion}
                        style={styles.promotionActionButton}
                      />
                      <AppButton
                        testID="appointment-create-remove-promotion"
                        title={t('appointmentCreation.actions.removePromotion')}
                        variant="secondary"
                        onPress={onRemovePromotion}
                        disabled={isQuotingPromotion && !promotionQuote && !promotionCode}
                        style={styles.promotionActionButton}
                      />
                    </View>
                    {promotionMessage ? (
                      <Text
                        style={promotionQuote ? styles.successText : styles.helperText}
                        testID="appointment-create-promotion-message"
                      >
                        {promotionMessage}
                      </Text>
                    ) : null}
                    {promotionQuote ? (
                      <View style={styles.promotionQuoteCard} testID="appointment-create-promotion-quote">
                        <AppointmentSummaryRow
                          label={t('appointmentCreation.labels.summaryPromotionOriginalPrice')}
                          value={formatCurrencyMinorUnits(promotionQuote.servicePriceCents, {
                            currency: 'ARS',
                            fractionDigits: 0,
                          })}
                        />
                        <AppointmentSummaryRow
                          label={t('appointmentCreation.labels.summaryPromotionDiscount')}
                          value={formatCurrencyMinorUnits(promotionQuote.discountCents, {
                            currency: 'ARS',
                            fractionDigits: 0,
                          })}
                        />
                        <AppointmentSummaryRow
                          label={t('appointmentCreation.labels.summaryPromotionFinalPrice')}
                          value={formatCurrencyMinorUnits(promotionQuote.finalPriceCents, {
                            currency: 'ARS',
                            fractionDigits: 0,
                          })}
                        />
                      </View>
                    ) : null}
                  </View>
                </FormSection>
              </AppCard>

              {summary ? (
                <AppCard testID="appointment-create-summary-card">
                  <FormSection
                    testID="appointment-create-summary-section"
                    title={t('appointmentCreation.sections.summary')}
                    helper={t('appointmentCreation.helpers.summary')}
                  >
                    <AppointmentSummaryRow
                      label={t('appointmentCreation.labels.summaryService')}
                      value={summary.serviceName}
                    />
                    <AppointmentSummaryRow
                      label={t('appointmentCreation.labels.summaryEmployee')}
                      value={summary.employeeName}
                    />
                    <AppointmentSummaryRow
                      label={t('appointmentCreation.labels.summaryDate')}
                      value={summary.dateLabel}
                    />
                    <AppointmentSummaryRow
                      label={t('appointmentCreation.labels.summaryTime')}
                      value={summary.timeRangeLabel}
                    />
                    <AppointmentSummaryRow
                      label={t('appointmentCreation.labels.summaryPrice')}
                      value={summary.priceLabel}
                    />
                    {summary.durationLabel ? (
                      <AppointmentSummaryRow
                        label={t('appointmentCreation.labels.summaryDuration')}
                        value={summary.durationLabel}
                      />
                    ) : null}
                    {summary.clientName ? (
                      <AppointmentSummaryRow
                        label={t('appointmentCreation.labels.summaryClient')}
                        value={summary.clientName}
                      />
                    ) : null}
                  </FormSection>
                </AppCard>
              ) : null}

              <AppCard testID="appointment-create-confirm-card">
                <FormSection
                  testID="appointment-create-confirm-section"
                  title={t('appointmentCreation.sections.confirm')}
                  helper={t('appointmentCreation.helpers.confirm')}
                >
                  {submissionError ? (
                    <Text style={styles.errorText} testID="appointment-create-submit-error">{submissionError}</Text>
                  ) : null}

                  <AppButton
                    testID="appointment-create-submit"
                    title={t('appointmentCreation.actions.confirm')}
                    loadingText={t('appointmentCreation.actions.confirming')}
                    loading={isSubmitting}
                    disabled={isSubmitting || !!blockingMessage}
                    accessibilityLabel={blockingMessage ? t('appointmentCreation.accessibility.unavailableConfirm') : undefined}
                    onPress={onSubmit}
                    size="lg"
                  />
                </FormSection>
              </AppCard>
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

export function buildAppointmentServiceDetail(options: {
  durationMinutes: number;
  priceCents: number;
  currency: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): string {
  const priceLabel = formatCurrencyMinorUnits(options.priceCents, {
    currency: options.currency,
    fractionDigits: 0,
  });

  return `${options.t('services.durationLabel', { count: options.durationMinutes })} · ${priceLabel}`;
}

export function buildAppointmentSummaryViewModel(input: {
  clientName: string;
  employeeName: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  priceCents: number;
  currency: string;
  serviceName: string;
  durationMinutes: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}): AppointmentBookingSummaryViewModel {
  return {
    serviceName: input.serviceName,
    employeeName: input.employeeName,
    dateLabel:
      formatLocalizedDate(input.localDate, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) ?? input.localDate,
    timeRangeLabel: `${input.localStartTime}–${input.localEndTime}`,
    priceLabel: formatCurrencyMinorUnits(input.priceCents, {
      currency: input.currency,
      fractionDigits: 0,
    }),
    durationLabel: input.t('services.durationLabel', { count: input.durationMinutes }),
    clientName: input.clientName.trim() || null,
  };
}

const styles = StyleSheet.create({
  centeredCard: {
    alignItems: 'center',
    gap: tokens.spacing[3],
    marginTop: tokens.spacing[6],
  },
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
  contextMeta: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[2],
  },
  helperText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  successText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.success,
    textAlign: 'center',
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  stateStack: {
    alignItems: 'center',
    gap: tokens.spacing[3],
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing[2],
    justifyContent: 'center',
  },
  selectionList: {
    gap: tokens.spacing[3],
  },
  selectorCard: {
    borderColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[4],
  },
  selectorCardSelected: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.surfaceVariant,
  },
  selectorPressed: {
    opacity: 0.92,
  },
  selectorTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  selectorTitleSelected: {
    color: tokens.colors.primaryLight,
    fontWeight: tokens.typography.weight.semibold,
  },
  selectorSubtitle: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
  },
  sectionDisabled: {
    opacity: 0.6,
  },
  dateCard: {
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    padding: tokens.spacing[4],
  },
  dateEyebrow: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dateDisplay: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    marginTop: tokens.spacing[2],
    textAlign: 'center',
  },
  dateHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[1],
    textAlign: 'center',
  },
  dateActions: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[4],
  },
  dateActionButton: {
    flex: 1,
  },
  slotWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  slotButton: {
    minWidth: 88,
  },
  notesInput: {
    minHeight: 96,
    paddingTop: tokens.spacing[3],
    textAlignVertical: 'top',
  },
  promotionSection: {
    gap: tokens.spacing[3],
    marginTop: tokens.spacing[2],
  },
  customerLoyaltyCard: {
    backgroundColor: tokens.colors.surfaceVariant,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  customerLoyaltyTitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.typography.weight.semibold,
  },
  customerLoyaltyRewardRow: {
    gap: tokens.spacing[2],
  },
  customerLoyaltyRewardCopy: {
    gap: tokens.spacing[1],
  },
  promotionActions: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  promotionActionButton: {
    flex: 1,
  },
  promotionQuoteCard: {
    backgroundColor: tokens.colors.surfaceVariant,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  customerWarningBanner: {
    backgroundColor: tokens.colors.surfaceVariant,
    borderColor: tokens.colors.warning,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.spacing[1],
    marginTop: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  customerWarningTitle: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.warning,
    fontWeight: tokens.typography.weight.semibold,
  },
  customerWarningBody: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textPrimary,
  },
  summaryRow: {
    gap: tokens.spacing[1],
  },
  summaryLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
});
