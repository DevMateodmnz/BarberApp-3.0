import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchEmployees } from '@/lib/employees.js';
import { fetchEmployeeServices } from '@/lib/employeeServices.js';
import { createServiceRecord } from '@/lib/serviceRecords.js';
import type { GetToken } from '@/lib/api.js';
import type { EmployeeListItem, Service } from '@/lib/types.js';

interface ServiceRecordCreateSectionProps {
  barbershopId: string;
  getToken: GetToken;
  onRecordCreated: () => Promise<void>;
}

export function ServiceRecordCreateSection({
  barbershopId,
  getToken,
  onRecordCreated,
}: ServiceRecordCreateSectionProps) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [priceCentsInput, setPriceCentsInput] = useState('');
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadEmployees() {
      setIsEmployeesLoading(true);
      setFormError(null);

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

    void loadEmployees();

    return () => {
      isCancelled = true;
    };
  }, [barbershopId, getToken]);

  async function handleEmployeeSelect(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    setSelectedServiceId(null);
    setPriceCentsInput('');
    setServices([]);
    setFormError(null);
    setFormSuccess(null);
    setIsServicesLoading(true);

    try {
      const result = await fetchEmployeeServices(getToken, barbershopId, employeeId);
      setServices(result);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to load services');
    } finally {
      setIsServicesLoading(false);
    }
  }

  function handleServiceSelect(service: Service) {
    setSelectedServiceId(service.id);
    setPriceCentsInput(String(service.priceCents));
    setFormError(null);
    setFormSuccess(null);
  }

  async function handleSubmit() {
    setFormError(null);
    setFormSuccess(null);

    if (!selectedEmployeeId) {
      setFormError('Select an employee.');
      return;
    }

    if (!selectedServiceId) {
      setFormError('Select a service.');
      return;
    }

    const priceCents = Number(priceCentsInput);
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      setFormError('Enter a valid non-negative integer price in cents.');
      return;
    }

    setIsSubmitting(true);

    try {
      await createServiceRecord(getToken, barbershopId, {
        employeeId: selectedEmployeeId,
        serviceId: selectedServiceId,
        priceCents,
      });

      setSelectedServiceId(null);
      setPriceCentsInput('');
      setFormSuccess('Service record created successfully.');

      await onRecordCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create service record');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.card} testID="owner-service-record-create">
      <Text style={styles.title}>Create Service Record</Text>
      <Text style={styles.helpText}>
        Choose an employee, then choose one of their assigned services.
      </Text>

      {isEmployeesLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Loading employees…</Text>
        </View>
      )}

      {!isEmployeesLoading && employees.length === 0 && (
        <Text style={styles.emptyText}>
          No employees available yet.
        </Text>
      )}

      {!isEmployeesLoading && employees.length > 0 && (
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

      {selectedEmployeeId && (
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
              No assigned active services found for this employee.
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

      <Text style={styles.sectionLabel}>Price (cents)</Text>
      <TextInput
        value={priceCentsInput}
        onChangeText={(value) => {
          setPriceCentsInput(value.replace(/[^\d]/g, ''));
          setFormError(null);
          setFormSuccess(null);
        }}
        placeholder="e.g. 2500"
        keyboardType="number-pad"
        style={styles.input}
        testID="service-record-price-cents"
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
