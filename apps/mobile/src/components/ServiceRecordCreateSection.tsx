import { useMemo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppTextInput,
  EmptyState,
  FormSection,
  MoneyText,
  SectionHeader,
} from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';
import type { GetToken } from '@/lib/api.js';
import { fetchEmployeeServices, fetchMyAssignedServices } from '@/lib/employeeServices.js';
import { fetchEmployees } from '@/lib/employees.js';
import {
  formatCentsForInput,
  hasPriceChangedFromDefault,
} from '@/lib/format.js';
import {
  buildServiceRecordPayload,
  getNextServiceRecordPriceInput,
  validateServiceRecordDraft,
} from '@/lib/serviceRecordPayload.js';
import { createServiceRecord } from '@/lib/serviceRecords.js';
import type { EmployeeListItem, PaymentMethod, Service } from '@/lib/types.js';

interface BaseProps {
  barbershopId: string;
  getToken: GetToken;
  onRecordCreated: () => Promise<void>;
}

interface OwnerProps extends BaseProps {
  mode: 'OWNER';
}

interface BarberProps extends BaseProps {
  employeeId: string;
  mode: 'BARBER';
}

type ServiceRecordCreateSectionProps = OwnerProps | BarberProps;

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

export interface ServiceRecordCreateSectionViewProps {
  testID: string;
  mode: 'OWNER' | 'BARBER';
  barbershopId?: string;
  employees: EmployeeListItem[];
  services: Service[];
  isEmployeesLoading: boolean;
  isServicesLoading: boolean;
  selectedEmployeeId: string | null;
  selectedServiceId: string | null;
  selectedPaymentMethod: PaymentMethod | null;
  selectedService: Service | null;
  priceDiffersFromDefault: boolean;
  clientNameInput: string;
  notesInput: string;
  priceCentsInput: string;
  formError: string | null;
  formSuccess: string | null;
  isSubmitting: boolean;
  helpText: string;
  servicesEmptyText: string;
  onEmployeeSelect: (employeeId: string) => void;
  onServiceSelect: (service: Service) => void;
  onPaymentMethodSelect: (method: PaymentMethod | null) => void;
  onClientNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onSubmit: () => void;
}

export function ServiceRecordCreateSectionView(props: ServiceRecordCreateSectionViewProps) {
  const {
    testID,
    mode,
    employees,
    services,
    isEmployeesLoading,
    isServicesLoading,
    selectedEmployeeId,
    selectedServiceId,
    selectedPaymentMethod,
    selectedService,
    priceDiffersFromDefault,
    clientNameInput,
    notesInput,
    priceCentsInput,
    formError,
    formSuccess,
    isSubmitting,
    helpText,
    servicesEmptyText,
    onEmployeeSelect,
    onServiceSelect,
    onPaymentMethodSelect,
    onClientNameChange,
    onNotesChange,
    onPriceChange,
    onSubmit,
  } = props;
  const { t } = useTranslation();

  const isBarberMode = mode === 'BARBER';
  const isFormDisabled = isSubmitting || isEmployeesLoading || isServicesLoading;

  return (
    <AppCard testID={testID} style={styles.rootCard}>
      <SectionHeader title={t('recordService.createTitle')} />
      <Text style={styles.helpText}>{helpText}</Text>

      {!isBarberMode && (
        <FormSection title={t('common.labels.employee')}>
          {isEmployeesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.loadingText}>{t('recordService.loadingEmployees')}</Text>
            </View>
          )}

          {!isEmployeesLoading && employees.length === 0 && (
            <EmptyState
              title={t('recordService.noEmployeesTitle')}
              message={t('recordService.noEmployeesMessage')}
            />
          )}

          {!isEmployeesLoading && employees.length > 0 && (
            <View style={styles.optionsRow}>
              {employees.map((employee) => (
                <AppButton
                  key={employee.id}
                  testID={`employee-option-${employee.id}`}
                  title={employee.user.name ?? employee.user.email}
                  variant={selectedEmployeeId === employee.id ? 'primary' : 'secondary'}
                  size="md"
                  onPress={() => onEmployeeSelect(employee.id)}
                />
              ))}
            </View>
          )}
        </FormSection>
      )}

      {(isBarberMode || !!selectedEmployeeId) && (
        <FormSection title={t('common.labels.service')}>
          {isServicesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.loadingText}>{t('recordService.loadingAssignedServices')}</Text>
            </View>
          )}

          {!isServicesLoading && services.length === 0 && (
            <EmptyState
              title={t('recordService.noServicesTitle')}
              message={servicesEmptyText}
            />
          )}

          {!isServicesLoading && services.length > 0 && (
            <View style={styles.optionsRow}>
              {services.map((service) => (
                <AppButton
                  key={service.id}
                  testID={`service-option-${service.id}`}
                  title={service.name}
                  variant={selectedServiceId === service.id ? 'primary' : 'secondary'}
                  size="md"
                  onPress={() => onServiceSelect(service)}
                />
              ))}
            </View>
          )}
        </FormSection>
      )}

      {selectedService && (
        <AppCard
          testID="service-record-selected-context"
          variant="outlined"
          style={styles.selectedContextCard}
        >
          <Text style={styles.selectedServiceName}>{selectedService.name}</Text>
          <View style={styles.selectedServiceRow}>
            <Text style={styles.selectedServiceLabel}>{t('recordService.defaultPriceLabel')}: </Text>
            <MoneyText priceCents={selectedService.priceCents} />
            <Text style={styles.selectedServiceLabel}> · </Text>
            <Text style={styles.selectedServiceLabel}>
              {t('services.durationLabel', { count: selectedService.durationMinutes })}
            </Text>
          </View>
          {!priceDiffersFromDefault && (
            <Text style={styles.usingDefaultText}>{t('recordService.usingDefaultPrice')}</Text>
          )}
        </AppCard>
      )}

      <FormSection title={t('common.labels.priceARS')}>
        <AppTextInput
          testID="service-record-price-cents"
          label={t('common.labels.priceARS')}
          value={priceCentsInput}
          onChangeText={onPriceChange}
          placeholder={selectedService ? formatCentsForInput(selectedService.priceCents) : t('recordService.pricePlaceholder')}
          keyboardType="decimal-pad"
        />
        {priceDiffersFromDefault && (
          <Text style={styles.priceDiffText} testID="service-record-price-diff">
            {t('recordService.priceDiffers')}
          </Text>
        )}
      </FormSection>

      <FormSection title={t('common.labels.paymentMethod')}>
        <View style={styles.optionsRow}>
          <AppButton
            testID="payment-method-unspecified"
            title={t('recordService.paymentUnspecified')}
            variant={selectedPaymentMethod === null ? 'primary' : 'secondary'}
            size="md"
            onPress={() => onPaymentMethodSelect(null)}
          />
          {PAYMENT_METHOD_OPTIONS.map((paymentMethod) => (
            <AppButton
              key={paymentMethod}
              testID={`payment-method-${paymentMethod.toLowerCase()}`}
              title={t(`paymentMethods.${paymentMethod}`)}
              variant={selectedPaymentMethod === paymentMethod ? 'primary' : 'secondary'}
              size="md"
              onPress={() => onPaymentMethodSelect(paymentMethod)}
            />
          ))}
        </View>
      </FormSection>

      <FormSection title={t('common.labels.clientName')}>
        <AppTextInput
          testID="service-record-client-name"
          label={t('common.labels.clientName')}
          value={clientNameInput}
          onChangeText={onClientNameChange}
          placeholder={t('recordService.clientNamePlaceholder')}
          autoCapitalize="words"
        />
      </FormSection>

      <FormSection title={t('common.labels.notesOptional')}>
        <AppTextInput
          testID="service-record-notes"
          label={t('common.labels.notesOptional')}
          value={notesInput}
          onChangeText={onNotesChange}
          placeholder={t('recordService.notesPlaceholder')}
          multiline
          textAlignVertical="top"
          inputStyle={styles.notesInput}
        />
      </FormSection>

      {formError && (
        <Text style={styles.errorText} testID="service-record-error">
          {formError}
        </Text>
      )}

      {formSuccess && (
        <Text style={styles.successText} testID="service-record-success">
          {formSuccess}
        </Text>
      )}

      <AppButton
        testID="service-record-submit"
        title={t('recordService.submit')}
        loadingText={t('recordService.submitting')}
        variant="primary"
        size="lg"
        loading={isSubmitting}
        disabled={isFormDisabled}
        onPress={onSubmit}
        style={styles.submitButton}
      />
    </AppCard>
  );
}

export function ServiceRecordCreateSection(props: ServiceRecordCreateSectionProps) {
  const { barbershopId, getToken, onRecordCreated } = props;
  const { t } = useTranslation();
  const isBarberMode = props.mode === 'BARBER';
  const barberEmployeeId = props.mode === 'BARBER' ? props.employeeId : null;

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const latestOwnerServicesRequestIdRef = useRef(0);

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    isBarberMode ? props.employeeId : null,
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [clientNameInput, setClientNameInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [priceCentsInput, setPriceCentsInput] = useState('');
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const effectiveEmployeeId = isBarberMode ? props.employeeId : selectedEmployeeId;

  const helpText = isBarberMode
    ? t('recordService.helpBarber')
    : t('recordService.helpOwner');

  const servicesEmptyText = isBarberMode
    ? t('recordService.noServicesBarber')
    : t('recordService.noServicesOwner');

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialData() {
      setFormError(null);
      setFormSuccess(null);
      setSelectedServiceId(null);
      setSelectedPaymentMethod(null);
      setClientNameInput('');
      setNotesInput('');
      setPriceCentsInput('');
      setServices([]);

      if (isBarberMode) {
        setSelectedEmployeeId(props.employeeId);
        setEmployees([]);
        setIsEmployeesLoading(false);
        setIsServicesLoading(true);

        try {
          const result = await fetchMyAssignedServices(getTokenRef.current, barbershopId);
          if (!isCancelled) {
            setServices(result);
          }
        } catch (error) {
          if (!isCancelled) {
            setFormError(error instanceof Error ? error.message : t('errors.unknownApi'));
          }
        } finally {
          if (!isCancelled) {
            setIsServicesLoading(false);
          }
        }

        return;
      }

      latestOwnerServicesRequestIdRef.current += 1;
      setSelectedEmployeeId(null);
      setIsEmployeesLoading(true);
      setIsServicesLoading(false);

      try {
        const result = await fetchEmployees(getTokenRef.current, barbershopId);
        if (!isCancelled) {
          setEmployees(result);
        }
      } catch (error) {
        if (!isCancelled) {
          setFormError(error instanceof Error ? error.message : t('errors.unknownApi'));
        }
      } finally {
        if (!isCancelled) {
          setIsEmployeesLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      isCancelled = true;
    };
  }, [barbershopId, barberEmployeeId, isBarberMode, t]);

  async function handleEmployeeSelect(employeeId: string) {
    if (isBarberMode) return;

    const requestId = latestOwnerServicesRequestIdRef.current + 1;
    latestOwnerServicesRequestIdRef.current = requestId;

    setSelectedEmployeeId(employeeId);
    setSelectedServiceId(null);
    setPriceCentsInput('');
    setServices([]);
    setFormError(null);
    setFormSuccess(null);
    setIsServicesLoading(true);

    try {
      const result = await fetchEmployeeServices(getTokenRef.current, barbershopId, employeeId);
      if (latestOwnerServicesRequestIdRef.current === requestId) {
        setServices(result);
      }
    } catch (error) {
      if (latestOwnerServicesRequestIdRef.current === requestId) {
        setFormError(error instanceof Error ? error.message : t('errors.unknownApi'));
      }
    } finally {
      if (latestOwnerServicesRequestIdRef.current === requestId) {
        setIsServicesLoading(false);
      }
    }
  }

  function handleServiceSelect(service: Service) {
    const previousDefault = selectedService?.priceCents ?? null;
    const nextPrice = getNextServiceRecordPriceInput({
      currentPriceInput: priceCentsInput,
      previousServiceDefaultPriceCents: previousDefault,
      nextServiceDefaultPriceCents: service.priceCents,
    });
    setSelectedServiceId(service.id);
    setPriceCentsInput(nextPrice);
    setFormError(null);
    setFormSuccess(null);
  }

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  const priceDiffersFromDefault = useMemo(
    () => hasPriceChangedFromDefault(priceCentsInput, selectedService?.priceCents),
    [priceCentsInput, selectedService],
  );

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setFormError(null);
    setFormSuccess(null);

    const validation = validateServiceRecordDraft({
      mode: props.mode,
      employeeId: effectiveEmployeeId,
      serviceId: selectedServiceId,
      priceCentsInput,
      clientNameInput,
      notesInput,
    });

    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = buildServiceRecordPayload({
        employeeId: validation.employeeId,
        serviceId: validation.serviceId,
        priceCents: validation.priceCents,
        paymentMethod: selectedPaymentMethod,
        clientName: validation.clientName,
        notes: validation.notes,
      });

      await createServiceRecord(getTokenRef.current, barbershopId, payload);

      setSelectedServiceId(null);
      setSelectedPaymentMethod(null);
      setClientNameInput('');
      setNotesInput('');
      setPriceCentsInput('');
      setFormSuccess(t('recordService.successCreated'));

      await onRecordCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknownApi'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ServiceRecordCreateSectionView
      testID={isBarberMode ? 'barber-service-record-create' : 'owner-service-record-create'}
      mode={props.mode}
      barbershopId={barbershopId}
      employees={employees}
      services={services}
      isEmployeesLoading={isEmployeesLoading}
      isServicesLoading={isServicesLoading}
      selectedEmployeeId={selectedEmployeeId}
      selectedServiceId={selectedServiceId}
      selectedPaymentMethod={selectedPaymentMethod}
      selectedService={selectedService}
      priceDiffersFromDefault={priceDiffersFromDefault}
      clientNameInput={clientNameInput}
      notesInput={notesInput}
      priceCentsInput={priceCentsInput}
      formError={formError}
      formSuccess={formSuccess}
      isSubmitting={isSubmitting}
      helpText={helpText}
      servicesEmptyText={servicesEmptyText}
      onEmployeeSelect={(employeeId) => void handleEmployeeSelect(employeeId)}
      onServiceSelect={handleServiceSelect}
      onPaymentMethodSelect={setSelectedPaymentMethod}
      onClientNameChange={setClientNameInput}
      onNotesChange={setNotesInput}
      onPriceChange={setPriceCentsInput}
      onSubmit={() => void handleSubmit()}
    />
  );
}

const styles = StyleSheet.create({
  rootCard: {
    gap: tokens.spacing[4],
  },
  helpText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  loadingText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  selectedContextCard: {
    gap: tokens.spacing[2],
  },
  selectedServiceName: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  selectedServiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  selectedServiceLabel: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  usingDefaultText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textMuted,
  },
  priceDiffText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primaryLight,
  },
  notesInput: {
    minHeight: 96,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  successText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.success,
    textAlign: 'center',
  },
  submitButton: {
    width: '100%',
  },
});
