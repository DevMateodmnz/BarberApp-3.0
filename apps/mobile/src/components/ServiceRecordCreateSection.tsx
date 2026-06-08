import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { GetToken } from '@/lib/api.js';
import { fetchEmployeeServices, fetchMyAssignedServices } from '@/lib/employeeServices.js';
import { fetchEmployees } from '@/lib/employees.js';
import { formatCentsForInput, formatPaymentMethodLabel, hasPriceChangedFromDefault } from '@/lib/format.js';
import {
  buildServiceRecordPayload,
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

export function ServiceRecordCreateSection(props: ServiceRecordCreateSectionProps) {
  const { barbershopId, getToken, onRecordCreated } = props;
  const isBarberMode = props.mode === 'BARBER';
  const latestOwnerServicesRequestIdRef = useRef(0);

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    isBarberMode ? props.employeeId : null
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
          const result = await fetchMyAssignedServices(getToken, barbershopId);
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
        const result = await fetchEmployees(getToken, barbershopId);
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
  }, [barbershopId, getToken, isBarberMode, isBarberMode ? props.employeeId : null]);

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
      const result = await fetchEmployeeServices(getToken, barbershopId, employeeId);
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
    setSelectedServiceId(service.id);
    setPriceCentsInput(formatCentsForInput(service.priceCents));
    setFormError(null);
    setFormSuccess(null);
  }

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
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

      await createServiceRecord(getToken, barbershopId, payload);

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
    <View style={styles.card} testID={isBarberMode ? 'barber-service-record-create' : 'owner-service-record-create'}>
      <Text style={styles.title}>Create Service Record</Text>
      <Text style={styles.helpText}>{helpText}</Text>

      {!isBarberMode && isEmployeesLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Loading employees…</Text>
        </View>
      )}

      {!isBarberMode && !isEmployeesLoading && employees.length === 0 && (
        <Text style={styles.emptyText}>
          No employees available yet.
        </Text>
      )}

      {!isBarberMode && !isEmployeesLoading && employees.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Employee</Text>
          <View style={styles.optionGroup}>
            {employees.map((employee) => (
              <TouchableOpacity
                key={employee.id}
                onPress={() => void handleEmployeeSelect(employee.id)}
                style={[
                  styles.optionButton,
                  selectedEmployeeId === employee.id && styles.optionButtonSelected,
                ]}
                testID={`employee-option-${employee.id}`}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    selectedEmployeeId === employee.id && styles.optionButtonTextSelected,
                  ]}
                >
                  {employee.user.name ?? employee.user.email}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {(isBarberMode || !!selectedEmployeeId) && (
        <>
          <Text style={styles.sectionLabel}>Service</Text>

          {isServicesLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Loading assigned services…</Text>
            </View>
          )}

          {!isServicesLoading && services.length === 0 && (
            <Text style={styles.emptyText}>
              {servicesEmptyText}
            </Text>
          )}

          {!isServicesLoading && services.length > 0 && (
            <View style={styles.optionGroup}>
              {services.map((service) => (
                <TouchableOpacity
                  key={service.id}
                  onPress={() => handleServiceSelect(service)}
                  style={[
                    styles.optionButton,
                    selectedServiceId === service.id && styles.optionButtonSelected,
                  ]}
                  testID={`service-option-${service.id}`}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      selectedServiceId === service.id && styles.optionButtonTextSelected,
                    ]}
                  >
                    {service.name} · {service.priceCents}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <Text style={styles.sectionLabel}>Price (ARS)</Text>
      <TextInput
        value={priceCentsInput}
        onChangeText={(value) => {
          setPriceCentsInput(value);
          setFormError(null);
          setFormSuccess(null);
        }}
        placeholder={selectedService ? formatCentsForInput(selectedService.priceCents) : 'e.g. 5000.50'}
        keyboardType="decimal-pad"
        style={styles.input}
        testID="service-record-price-cents"
      />

      {priceDiffersFromDefault && (
        <Text style={styles.priceDiffText} testID="service-record-price-diff">
          Price differs from the service default.
        </Text>
      )}

      <Text style={styles.sectionLabel}>Payment Method (optional)</Text>
      <View style={styles.optionGroup}>
        <TouchableOpacity
          onPress={() => {
            setSelectedPaymentMethod(null);
            setFormError(null);
            setFormSuccess(null);
          }}
          style={[
            styles.optionButton,
            selectedPaymentMethod === null && styles.optionButtonSelected,
          ]}
          testID="payment-method-unspecified"
        >
          <Text
            style={[
              styles.optionButtonText,
              selectedPaymentMethod === null && styles.optionButtonTextSelected,
            ]}
          >
            Unspecified
          </Text>
        </TouchableOpacity>

        {PAYMENT_METHOD_OPTIONS.map((paymentMethod) => (
          <TouchableOpacity
            key={paymentMethod}
            onPress={() => {
              setSelectedPaymentMethod(paymentMethod);
              setFormError(null);
              setFormSuccess(null);
            }}
            style={[
              styles.optionButton,
              selectedPaymentMethod === paymentMethod && styles.optionButtonSelected,
            ]}
            testID={`payment-method-${paymentMethod.toLowerCase()}`}
          >
            <Text
              style={[
                styles.optionButtonText,
                selectedPaymentMethod === paymentMethod && styles.optionButtonTextSelected,
              ]}
            >
              {formatPaymentMethodLabel(paymentMethod)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Client Name (optional)</Text>
      <TextInput
        value={clientNameInput}
        onChangeText={(value) => {
          setClientNameInput(value);
          setFormError(null);
          setFormSuccess(null);
        }}
        placeholder="e.g. Jane Doe"
        style={styles.input}
        autoCapitalize="words"
        testID="service-record-client-name"
      />

      <Text style={styles.sectionLabel}>Notes (optional)</Text>
      <TextInput
        value={notesInput}
        onChangeText={(value) => {
          setNotesInput(value);
          setFormError(null);
          setFormSuccess(null);
        }}
        placeholder="Add any useful details"
        style={[styles.input, styles.notesInput]}
        multiline
        textAlignVertical="top"
        testID="service-record-notes"
      />

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

      <TouchableOpacity
        onPress={() => void handleSubmit()}
        disabled={isSubmitting || isEmployeesLoading || isServicesLoading}
        style={[
          styles.submitButton,
          (isSubmitting || isEmployeesLoading || isServicesLoading) && styles.submitButtonDisabled,
        ]}
        testID="service-record-submit"
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Creating…' : 'Create Record'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  helpText: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginTop: 12,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  optionButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionButtonText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  optionButtonTextSelected: {
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#666',
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  priceDiffText: {
    fontSize: 12,
    color: '#E65100',
    marginTop: 4,
    fontStyle: 'italic',
  },
  notesInput: {
    minHeight: 88,
  },
  errorText: {
    fontSize: 13,
    color: '#D32F2F',
    marginTop: 10,
  },
  successText: {
    fontSize: 13,
    color: '#2E7D32',
    marginTop: 10,
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#999999',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
