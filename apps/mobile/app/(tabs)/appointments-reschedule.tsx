import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  AppointmentRescheduleScreenView,
  type RescheduleSelectorOption,
  type RescheduleSlotOption,
  type RescheduleSummaryItem,
} from '@/components/AppointmentRescheduleScreenView.js';
import { buildAppointmentServiceDetail } from '@/components/AppointmentCreateScreenView.js';
import {
  fetchAppointmentAvailability,
  fetchAppointmentChanges,
  rescheduleAppointment,
} from '@/lib/appointments.js';
import { fetchMyAssignedServices, fetchEmployeeServices } from '@/lib/employeeServices.js';
import { fetchEmployees } from '@/lib/employees.js';
import { addDaysToDateString, formatRecordTime, getTodayDateString } from '@/lib/format.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { useAppointmentsStore } from '@/lib/appointmentsStore.js';
import { useContextStore } from '@/lib/store.js';
import type { Appointment, AppointmentAvailability, AppointmentChange, EmployeeListItem, Service } from '@/lib/types.js';
import { ApiError } from '@/lib/api.js';

function toLocalDate(isoString: string) {
  return isoString.slice(0, 10);
}

function summarizeAppointment(input: {
  employeeName: string;
  serviceName: string;
  localDate: string;
  timeRangeLabel: string;
  reasonLabel?: string;
  reason?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): RescheduleSummaryItem[] {
  const { t } = input;
  const items: RescheduleSummaryItem[] = [
    { label: t('appointmentCreation.labels.summaryEmployee'), value: input.employeeName },
    { label: t('appointmentCreation.labels.summaryService'), value: input.serviceName },
    { label: t('appointmentCreation.labels.summaryDate'), value: input.localDate },
    { label: t('appointmentCreation.labels.summaryTime'), value: input.timeRangeLabel },
  ];

  if (input.reasonLabel && input.reason) {
    items.push({ label: input.reasonLabel, value: input.reason });
  }

  return items;
}

function mapRescheduleError(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'APPOINTMENT_SLOT_UNAVAILABLE':
        return t('appointmentReschedule.errors.slotUnavailable');
      case 'APPOINTMENT_RESCHEDULE_CONFLICT':
        return t('appointmentReschedule.errors.staleConflict');
      case 'APPOINTMENT_RESCHEDULE_NOT_ALLOWED':
        return t('appointmentReschedule.errors.notAllowed');
      case 'APPOINTMENT_RESCHEDULE_NOOP':
        return t('appointmentReschedule.errors.noop');
      case 'FORBIDDEN_EMPLOYEE_SCOPE':
        return t('appointmentReschedule.errors.employeeScope');
      default:
        return error.message;
    }
  }

  return error instanceof Error ? error.message : t('errors.unknownApi');
}

export default function AppointmentRescheduleScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, loadContext } = useContextStore();
  const appointments = useAppointmentsStore((state) => state.appointments);
  const reloadLastAppointments = useAppointmentsStore((state) => state.reloadLastAppointments);
  const setFlashMessage = useFlashStore((state) => state.setMessage);

  const appointment = useMemo<Appointment | null>(() => {
    if (typeof appointmentId !== 'string') {
      return null;
    }

    return appointments.find((item) => item.id === appointmentId) ?? null;
  }, [appointmentId, appointments]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availability, setAvailability] = useState<AppointmentAvailability | null>(null);
  const [changes, setChanges] = useState<AppointmentChange[]>([]);
  const [availabilityReloadNonce, setAvailabilityReloadNonce] = useState(0);
  const [employeesStatus, setEmployeesStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [servicesStatus, setServicesStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!context && isSignedIn && getTokenRef.current) {
      void loadContext(getTokenRef.current);
    }
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    if (!appointment) {
      return;
    }

    setSelectedEmployeeId(appointment.employeeId);
    setSelectedServiceId(appointment.serviceId);
    setSelectedDate(toLocalDate(appointment.startAt));
    setSelectedSlotStartAt(appointment.startAt);
    setReason('');
  }, [appointment?.id]);

  useEffect(() => {
    if (!context?.barbershopId || !getTokenRef.current || !appointment) {
      return;
    }

    let cancelled = false;

    if (context.role === 'OWNER') {
      setEmployeesStatus('loading');
      setEmployeesError(null);
      void fetchEmployees(getTokenRef.current, context.barbershopId)
        .then((result) => {
          if (cancelled) return;
          setEmployees(result.filter((item) => item.isActive));
          setEmployeesStatus(result.length > 0 ? 'success' : 'empty');
        })
        .catch((error) => {
          if (cancelled) return;
          setEmployees([]);
          setEmployeesStatus('error');
          setEmployeesError(error instanceof Error ? error.message : t('errors.unknownApi'));
        });
      return () => {
        cancelled = true;
      };
    }

    setEmployees([
      {
        id: appointment.employee.id,
        isActive: true,
        createdAt: '',
        updatedAt: '',
        barbershopId: appointment.barbershopId,
        userId: appointment.employee.user.id,
        user: {
          id: appointment.employee.user.id,
          email: appointment.employee.user.name ?? appointment.employee.user.id,
          name: appointment.employee.user.name,
          role: 'BARBER',
        },
      },
    ]);
    setEmployeesStatus('success');
    return () => {
      cancelled = true;
    };
  }, [appointment, context?.barbershopId, context?.role, t]);

  useEffect(() => {
    if (!context?.barbershopId || !selectedEmployeeId || !getTokenRef.current) {
      return;
    }

    let cancelled = false;
    setServicesStatus('loading');
    setServicesError(null);

    const request = context.role === 'BARBER'
      ? fetchMyAssignedServices(getTokenRef.current, context.barbershopId)
      : fetchEmployeeServices(getTokenRef.current, context.barbershopId, selectedEmployeeId);

    void request
      .then((result) => {
        if (cancelled) return;
        setServices(result.filter((item) => item.isActive));
        setServicesStatus(result.length > 0 ? 'success' : 'empty');
      })
      .catch((error) => {
        if (cancelled) return;
        setServices([]);
        setServicesStatus('error');
        setServicesError(error instanceof Error ? error.message : t('errors.unknownApi'));
      });

    return () => {
      cancelled = true;
    };
  }, [context?.barbershopId, context?.role, selectedEmployeeId, t]);

  useEffect(() => {
    if (
      !context?.barbershopId ||
      !selectedEmployeeId ||
      !selectedServiceId ||
      !selectedDate ||
      !appointment ||
      !getTokenRef.current
    ) {
      return;
    }

    let cancelled = false;
    setAvailabilityStatus('loading');
    setAvailabilityError(null);

    void fetchAppointmentAvailability(getTokenRef.current, context.barbershopId, {
      employeeId: selectedEmployeeId,
      serviceId: selectedServiceId,
      localDate: selectedDate,
      excludeAppointmentId: appointment.id,
    })
      .then((result) => {
        if (cancelled) return;
        setAvailability(result);
        setAvailabilityStatus(result.slots.length > 0 ? 'success' : 'empty');
        const stillPresent = result.slots.some((slot) => slot.startAt === selectedSlotStartAt);
        if (!stillPresent) {
          setSelectedSlotStartAt(null);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setAvailability(null);
        setAvailabilityStatus('error');
        setAvailabilityError(error instanceof Error ? error.message : t('errors.unknownApi'));
      });

    return () => {
      cancelled = true;
    };
  }, [appointment, availabilityReloadNonce, context?.barbershopId, selectedEmployeeId, selectedServiceId, selectedDate, selectedSlotStartAt, t]);

  useEffect(() => {
    if (!appointment || !getTokenRef.current) {
      return;
    }

    let cancelled = false;
    void fetchAppointmentChanges(getTokenRef.current, appointment.id)
      .then((result) => {
        if (!cancelled) {
          setChanges(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChanges([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appointment?.id]);

  const selectedService = services.find((item) => item.id === selectedServiceId) ?? null;
  const selectedEmployee = employees.find((item) => item.id === selectedEmployeeId) ?? null;
  const selectedSlot = availability?.slots.find((item) => item.startAt === selectedSlotStartAt) ?? null;

  const beforeSummary = useMemo<RescheduleSummaryItem[]>(() => {
    if (!appointment) {
      return [];
    }

    return summarizeAppointment({
      employeeName: appointment.employee.user.name ?? t('common.states.unknown'),
      serviceName: appointment.serviceName,
      localDate: appointment.startAt.slice(0, 10),
      timeRangeLabel: `${formatRecordTime(appointment.startAt) ?? '--:--'}–${formatRecordTime(appointment.endAt) ?? '--:--'}`,
      t,
    });
  }, [appointment, t]);

  const afterSummary = useMemo<RescheduleSummaryItem[] | null>(() => {
    if (!selectedEmployee || !selectedService || !selectedSlot) {
      return null;
    }

    if (
      appointment &&
      selectedEmployee.id === appointment.employeeId &&
      selectedService.id === appointment.serviceId &&
      selectedSlot.startAt === appointment.startAt
    ) {
      return null;
    }

    return summarizeAppointment({
      employeeName: selectedEmployee.user.name ?? selectedEmployee.user.email,
      serviceName: selectedService.name,
      localDate: selectedDate,
      timeRangeLabel: `${selectedSlot.localStartTime}–${selectedSlot.localEndTime}`,
      reasonLabel: reason.trim() ? t('appointmentReschedule.reasonLabel') : undefined,
      reason: reason.trim() || undefined,
      t,
    });
  }, [appointment, reason, selectedDate, selectedEmployee, selectedService, selectedSlot, t]);

  const employeeOptions = useMemo<RescheduleSelectorOption[]>(() => {
    return employees.map((employee) => ({
      id: employee.id,
      label: employee.user.name ?? employee.user.email,
      selected: employee.id === selectedEmployeeId,
      testID: `appointment-reschedule-employee-${employee.id}`,
      onPress: () => {
        setSelectedEmployeeId(employee.id);
        setSelectedServiceId(null);
        setAvailability(null);
        setSelectedSlotStartAt(null);
        setSubmissionError(null);
      },
    }));
  }, [employees, selectedEmployeeId]);

  const serviceOptions = useMemo<RescheduleSelectorOption[]>(() => {
    return services.map((service) => ({
      id: service.id,
      label: service.name,
      detail: buildAppointmentServiceDetail({
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        currency: service.currency,
        t,
      }),
      selected: service.id === selectedServiceId,
      testID: `appointment-reschedule-service-${service.id}`,
      onPress: () => {
        setSelectedServiceId(service.id);
        setAvailability(null);
        setSelectedSlotStartAt(null);
        setSubmissionError(null);
      },
    }));
  }, [selectedServiceId, services, t]);

  const slotOptions = useMemo<RescheduleSlotOption[]>(() => {
    return (availability?.slots ?? []).map((slot) => ({
      id: slot.startAt,
      label: slot.localStartTime,
      selected: slot.startAt === selectedSlotStartAt,
      testID: `appointment-reschedule-slot-${slot.startAt}`,
      onPress: () => {
        setSelectedSlotStartAt(slot.startAt);
        setSubmissionError(null);
      },
    }));
  }, [availability?.slots, selectedSlotStartAt]);

  const handleSubmit = async () => {
    if (!appointment || !selectedSlot || !getTokenRef.current) {
      setSubmissionError(t('appointmentReschedule.errors.noop'));
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await rescheduleAppointment(getTokenRef.current, appointment.id, {
        employeeId: selectedEmployeeId ?? undefined,
        serviceId: selectedServiceId ?? undefined,
        startAt: selectedSlot.startAt,
        reason: reason.trim() || undefined,
      });
      await reloadLastAppointments(getTokenRef.current);
      setFlashMessage(
        appointment.clientEmail
          ? t('appointmentReschedule.successWithEmail')
          : t('appointmentReschedule.success')
      );
      router.back();
    } catch (error) {
      setSubmissionError(mapRescheduleError(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <AppointmentRescheduleScreenView
      context={context}
      appointment={appointment}
      isLoading={!appointment}
      employeesStatus={employeesStatus}
      servicesStatus={servicesStatus}
      availabilityStatus={availabilityStatus}
      employeesError={employeesError}
      servicesError={servicesError}
      availabilityError={availabilityError}
      employeeOptions={employeeOptions}
      serviceOptions={serviceOptions}
      slotOptions={slotOptions}
      selectedDate={selectedDate || getTodayDateString()}
      reason={reason}
      changes={changes}
      submissionError={submissionError}
      isSubmitting={isSubmitting}
      beforeSummary={beforeSummary}
      afterSummary={afterSummary}
      onBack={() => router.back()}
      onSelectPreviousDate={() => setSelectedDate((current) => addDaysToDateString(current || getTodayDateString(), -1))}
      onSelectToday={() => setSelectedDate(getTodayDateString())}
      onSelectNextDate={() => setSelectedDate((current) => addDaysToDateString(current || getTodayDateString(), 1))}
      onReasonChange={setReason}
      onRetryEmployees={() => {
        if (context?.barbershopId && getTokenRef.current) {
          void fetchEmployees(getTokenRef.current, context.barbershopId).then(setEmployees);
        }
      }}
      onRetryServices={() => {
        if (context?.barbershopId && selectedEmployeeId && getTokenRef.current) {
          const request = context.role === 'BARBER'
            ? fetchMyAssignedServices(getTokenRef.current, context.barbershopId)
            : fetchEmployeeServices(getTokenRef.current, context.barbershopId, selectedEmployeeId);
          void request.then(setServices);
        }
      }}
      onRetryAvailability={() => {
        setAvailabilityReloadNonce((current) => current + 1);
      }}
      onSubmit={() => {
        void handleSubmit();
      }}
    />
  );
}
