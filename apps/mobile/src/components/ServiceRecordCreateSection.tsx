import { useMemo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
  formatPaymentMethodLabel,
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
  barbershopId: string;
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

  const isBarberMode = mode === 'BARBER';
  const isFormDisabled = isSubmitting || isEmployeesLoading || isServicesLoading;

  return (
    <AppCard testID={testID} style={styles.rootCard}>
      <SectionHeader title="Create Service Record" />
      <Text style={styles.helpText}>{helpText}</Text>

      {!isBarberMode && (
        <FormSection>
          <SectionHeader title="Employee" />
          {isEmployeesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.loadingText}>Loading employees…</Text>
            </View>
          )}

          {!isEmployeesLoading && employees.length === 0 && (
            <EmptyState
              title="No employees available"
              message="No employees available yet."
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
        <FormSection>
          <SectionHeader title="Service" />
          {isServicesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.colors.primary} />
              <Text style={styles.loadingText}>Loading assigned services…</Text>
            </View>
          )}

          {!isServicesLoading && services.length === 0 && (
            <EmptyState title="No services available" message={servicesEmptyText} />
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
            <Text style={styles.selectedServiceLabel}>Default price: </Text>
            <MoneyText priceCents={selectedService.priceCents} />
            <Text style={styles.selectedServiceLabel}> · </Text>
            <Text style={styles.selectedServiceLabel}>{selectedService.durationMinutes} min</Text>
          </View>
          {!priceDiffersFromDefault && (
            <Text style={styles.usingDefaultText}>Using default service price.</Text>
          )}
        </AppCard>
      )}

      <FormSection>
        <SectionHeader title="Price (ARS)" />
        <AppTextInput
          testID="service-record-price-cents"
          label="Price (ARS)"
          value={priceCentsInput}
          onChangeText={onPriceChange}
          placeholder={selectedService ? formatCentsForInput(selectedService.priceCents) : 'e.g. 5000.50'}
          keyboardType="decimal-pad"
        />
        {priceDiffersFromDefault && (
          <Text style={styles.priceDiffText} testID="service-record-price-diff">
            Price differs from the service default.
          </Text>
        )}
      </FormSection>

      <FormSection>
        <SectionHeader title="Payment Method" />
        <View style={styles.optionsRow}>
          <AppButton
            testID="payment-method-unspecified"
            title="Unspecified"
            variant={selectedPaymentMethod === null ? 'primary' : 'secondary'}
            size="md"
            onPress={() => onPaymentMethodSelect(null)}
          />
          {PAYMENT_METHOD_OPTIONS.map((paymentMethod) => (
            <AppButton
              key={paymentMethod}
              testID={`payment-method-${paymentMethod.toLowerCase()}`}
              title={formatPaymentMethodLabel(paymentMethod)}
              variant={selectedPaymentMethod === paymentMethod ? 'primary' : 'secondary'}
              size="md"
              onPress={() => onPaymentMethodSelect(paymentMethod)}
            />
          ))}
        </View>
      </FormSection>

      <FormSection>
        <SectionHeader title="Client Name" />
        <AppTextInput
          testID="service-record-client-name"
          label="Client Name (optional)"
          value={clientNameInput}
          onChangeText={onClientNameChange}
          placeholder="e.g. Jane Doe"
          autoCapitalize="words"
        />
      </FormSection>

      <FormSection>
        <SectionHeader title="Notes" />
        <AppTextInput
          testID="service-record-notes"
          label="Notes (optional)"
          value={notesInput}
          onChangeText={onNotesChange}
          placeholder="Add any useful details"
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
        title="Create Record"
        loadingText="Creating…"
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
  const isBarberMode = props.mode === 'BARBER';

  // Stabilize getToken via ref — parent may pass an unstable function reference
  // (e.g. from Clerk Expo's useAuth), which causes infinite useEffect re-fire loops.
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
    ? 'Choose one of your assigned services.'
    : 'Choose an employee, then choose one of their assigned services.';

  const servicesEmptyText = isBarberMode
    ? 'No assigned active services found for you yet.'
    : 'No assigned active services found for this employee.';

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
            setFormError(error instanceof Error ? error.message : 'Failed to load services');
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
          setFormError(error instanceof Error ? error.message : 'Failed to load employees');
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
  }, [barbershopId, isBarberMode, isBarberMode ? props.employeeId : null]);

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
        setFormError(error instanceof Error ? error.message : 'Failed to load services');
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

      await onRecordCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create service record');
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
      onEmployeeSelect={handleEmployeeSelect}
      onServiceSelect={handleServiceSelect}
      onPaymentMethodSelect={(method) => {
        setSelectedPaymentMethod(method);
        setFormError(null);
        setFormSuccess(null);
      }}
      onClientNameChange={(value) => {
        setClientNameInput(value);
        setFormError(null);
        setFormSuccess(null);
      }}
      onNotesChange={(value) => {
        setNotesInput(value);
        setFormError(null);
        setFormSuccess(null);
      }}
      onPriceChange={(value) => {
        setPriceCentsInput(value);
        setFormError(null);
        setFormSuccess(null);
      }}
      onSubmit={() => void handleSubmit()}
    />
  );
}

const styles = StyleSheet.create({
  rootCard: {
    width: '100%',
    marginTop: tokens.spacing[4],
  },
  helpText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing[4],
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
    marginBottom: tokens.spacing[4],
  },
  selectedServiceName: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.spacing[2],
  },
  selectedServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.spacing[2],
  },
  selectedServiceLabel: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  usingDefaultText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.success,
  },
  priceDiffText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.warning,
    marginTop: tokens.spacing[2],
  },
  notesInput: {
    minHeight: 88,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
    marginTop: tokens.spacing[3],
  },
  successText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.success,
    marginTop: tokens.spacing[3],
  },
  submitButton: {
    width: '100%',
    marginTop: tokens.spacing[4],
  },
});
