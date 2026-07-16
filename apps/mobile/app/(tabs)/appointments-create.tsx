import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  AppointmentCreateScreenView,
  buildAppointmentServiceDetail,
  buildAppointmentSummaryViewModel,
  type AppointmentEmployeeOption,
  type AppointmentServiceOption,
  type AppointmentSlotOption,
} from '@/components/AppointmentCreateScreenView.js';
import {
  applyAppointmentCreationDateChange,
  applyAppointmentCreationCustomerPrefill,
  applyAppointmentCreationEmployeeChange,
  applyAppointmentCreationPromotionCodeChange,
  applyAppointmentCreationServiceChange,
  beginAppointmentCreationAvailabilityRequest,
  buildAppointmentAvailabilityRequestKey,
  createInitialAppointmentCreationState,
  getAppointmentCreationAvailabilityRequest,
  mapAppointmentCreationError,
  resolveAppointmentCreationAvailabilityFailure,
  resolveAppointmentCreationAvailabilitySuccess,
  selectAppointmentCreationSlot,
  setAppointmentCreationEmployees,
  setAppointmentCreationServices,
  syncAppointmentCreationContext,
  type AppointmentCreationContext,
  type AppointmentCreationState,
} from '@/lib/appointmentCreationDomain.js';
import { submitAppointmentCreationFlow } from '@/lib/appointmentCreationFlow.js';
import {
  createStaffAppointment,
  fetchAppointmentAvailability,
  lookupCustomerByPhone,
  type CustomerInsights,
} from '@/lib/appointments.js';
import { useAppointmentsStore } from '@/lib/appointmentsStore.js';
import { fetchMyAssignedServices, fetchEmployeeServices } from '@/lib/employeeServices.js';
import { fetchEmployees } from '@/lib/employees.js';
import { getTodayDateString, addDaysToDateString } from '@/lib/format.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { quoteStaffPromotion } from '@/lib/promotions.js';
import { useContextStore } from '@/lib/store.js';
import type { CurrentUserContext, StaffPromotionQuote } from '@/lib/types.js';

function toAppointmentCreationContext(context: CurrentUserContext | null): AppointmentCreationContext | null {
  if (!context || (context.role !== 'OWNER' && context.role !== 'BARBER')) {
    return null;
  }

  return {
    role: context.role,
    barbershopId: context.barbershopId,
    authenticatedEmployeeId: context.employeeId,
  };
}

export default function AppointmentCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    prefillCustomerId?: string;
    prefillCustomerName?: string;
    prefillCustomerPhone?: string;
    prefillCustomerEmail?: string;
    prefillEmployeeId?: string;
    prefillDate?: string;
    prefillStartAt?: string;
  }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useTranslation();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, error: contextError, loadContext } = useContextStore();
  const recordCreatedAppointment = useAppointmentsStore((state) => state.recordCreatedAppointment);
  const creationContext = useMemo(() => toAppointmentCreationContext(context), [context]);
  const [creationState, setCreationState] = useState<AppointmentCreationState | null>(
    creationContext ? createInitialAppointmentCreationState(creationContext) : null,
  );
  const [employeesStatus, setEmployeesStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [servicesStatus, setServicesStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [availabilityReloadNonce, setAvailabilityReloadNonce] = useState(0);
  const employeeRequestIdRef = useRef(0);
  const servicesRequestIdRef = useRef(0);
  const availabilityRequestRef = useRef<ReturnType<typeof getAppointmentCreationAvailabilityRequest> | null>(null);
  const [customerInsights, setCustomerInsights] = useState<CustomerInsights | null>(null);
  const [promotionQuote, setPromotionQuote] = useState<Extract<StaffPromotionQuote, { eligible: true }> | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [isQuotingPromotion, setIsQuotingPromotion] = useState(false);
  const customerLookupRequestIdRef = useRef(0);
  const promotionRequestIdRef = useRef(0);
  const appliedPrefillKeyRef = useRef<string | null>(null);
  const appliedSchedulePrefillKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current || context) {
      return;
    }

    void loadContext(getTokenRef.current);
  }, [context, isSignedIn, loadContext]);

  useEffect(() => {
    if (!creationContext) {
      setCreationState(null);
      return;
    }

    setCreationState((current) => (
      current
        ? syncAppointmentCreationContext(current, creationContext)
        : createInitialAppointmentCreationState(creationContext)
    ));
  }, [creationContext]);

  useEffect(() => {
    const customerId = typeof params.prefillCustomerId === 'string'
      ? params.prefillCustomerId
      : null;
    const clientName = typeof params.prefillCustomerName === 'string'
      ? params.prefillCustomerName
      : null;
    const clientPhone = typeof params.prefillCustomerPhone === 'string'
      ? params.prefillCustomerPhone
      : null;
    const clientEmail = typeof params.prefillCustomerEmail === 'string'
      ? params.prefillCustomerEmail
      : null;

    if (!customerId || !clientName || !clientPhone) {
      return;
    }

    const prefillKey = `${customerId}::${clientName}::${clientPhone}::${clientEmail ?? ''}`;
    if (appliedPrefillKeyRef.current === prefillKey) {
      return;
    }

    appliedPrefillKeyRef.current = prefillKey;
    setCreationState((current) => (
      current
        ? applyAppointmentCreationCustomerPrefill(current, {
            customerId,
            clientName,
            clientPhone,
            clientEmail,
          })
        : current
    ));
  }, [
    params.prefillCustomerId,
    params.prefillCustomerName,
    params.prefillCustomerPhone,
    params.prefillCustomerEmail,
  ]);

  const loadOwnerEmployees = useCallback(async () => {
    if (!creationContext || creationContext.role !== 'OWNER' || !creationContext.barbershopId || !getTokenRef.current) {
      setEmployeesStatus('idle');
      setEmployeesError(null);
      return;
    }

    const requestId = employeeRequestIdRef.current + 1;
    employeeRequestIdRef.current = requestId;
    setEmployeesStatus('loading');
    setEmployeesError(null);

    try {
      const employees = await fetchEmployees(getTokenRef.current, creationContext.barbershopId);
      if (employeeRequestIdRef.current !== requestId) {
        return;
      }

      setCreationState((current) => (
        current ? setAppointmentCreationEmployees(current, employees) : current
      ));
      setEmployeesStatus(employees.filter((employee) => employee.isActive).length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (employeeRequestIdRef.current !== requestId) {
        return;
      }

      setCreationState((current) => (
        current ? setAppointmentCreationEmployees(current, []) : current
      ));
      setEmployeesStatus('error');
      setEmployeesError(error instanceof Error ? error.message : t('errors.unknownApi'));
    }
  }, [creationContext, t]);

  const loadServicesForEmployee = useCallback(async (employeeId: string | null) => {
    if (!creationContext || !creationContext.barbershopId || !employeeId || !getTokenRef.current) {
      servicesRequestIdRef.current += 1;
      setServicesStatus('idle');
      setServicesError(null);
      setCreationState((current) => (
        current ? setAppointmentCreationServices(current, []) : current
      ));
      return;
    }

    const requestId = servicesRequestIdRef.current + 1;
    servicesRequestIdRef.current = requestId;
    setServicesStatus('loading');
    setServicesError(null);

    try {
      const services = creationContext.role === 'BARBER'
        ? await fetchMyAssignedServices(getTokenRef.current, creationContext.barbershopId)
        : await fetchEmployeeServices(getTokenRef.current, creationContext.barbershopId, employeeId);

      if (servicesRequestIdRef.current !== requestId) {
        return;
      }

      setCreationState((current) => (
        current ? setAppointmentCreationServices(current, services) : current
      ));
      setServicesStatus(services.filter((service) => service.isActive).length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (servicesRequestIdRef.current !== requestId) {
        return;
      }

      setCreationState((current) => (
        current ? setAppointmentCreationServices(current, []) : current
      ));
      setServicesStatus('error');
      setServicesError(error instanceof Error ? error.message : t('errors.unknownApi'));
    }
  }, [creationContext, t]);

  useEffect(() => {
    const prefillDate = typeof params.prefillDate === 'string' ? params.prefillDate : null;
    const prefillEmployeeId = typeof params.prefillEmployeeId === 'string'
      ? params.prefillEmployeeId
      : null;
    const prefillStartAt = typeof params.prefillStartAt === 'string'
      ? params.prefillStartAt
      : null;

    if (!creationState || !prefillDate) {
      return;
    }

    const schedulePrefillKey = `${prefillEmployeeId ?? 'self'}::${prefillDate}::${prefillStartAt ?? ''}`;
    if (appliedSchedulePrefillKeyRef.current === schedulePrefillKey) {
      return;
    }

    appliedSchedulePrefillKeyRef.current = schedulePrefillKey;
    setCreationState((current) => {
      if (!current) {
        return current;
      }

      let nextState = current;
      if (current.context.role === 'OWNER' && prefillEmployeeId) {
        nextState = applyAppointmentCreationEmployeeChange(nextState, prefillEmployeeId);
      }

      nextState = applyAppointmentCreationDateChange(nextState, prefillDate);
      return nextState;
    });

    if (prefillEmployeeId) {
      void loadServicesForEmployee(prefillEmployeeId);
    }
  }, [
    creationState,
    loadServicesForEmployee,
    params.prefillDate,
    params.prefillEmployeeId,
    params.prefillStartAt,
  ]);

  const availabilityRequest = useMemo(
    () => (creationState ? getAppointmentCreationAvailabilityRequest(creationState) : null),
    [creationState],
  );
  const availabilityRequestKey = useMemo(
    () => (availabilityRequest ? buildAppointmentAvailabilityRequestKey(availabilityRequest) : null),
    [availabilityRequest],
  );

  useEffect(() => {
    availabilityRequestRef.current = availabilityRequest;
  }, [availabilityRequest]);

  useEffect(() => {
    if (!creationContext) {
      setEmployeesStatus('idle');
      setEmployeesError(null);
      setServicesStatus('idle');
      setServicesError(null);
      return;
    }

    if (creationContext.role === 'OWNER') {
      void loadOwnerEmployees();
      return;
    }

    if (!creationContext.authenticatedEmployeeId) {
      setServicesStatus('idle');
      setServicesError(null);
      setCreationState((current) => (
        current ? setAppointmentCreationServices(current, []) : current
      ));
      return;
    }

    void loadServicesForEmployee(creationContext.authenticatedEmployeeId);
  }, [creationContext, loadOwnerEmployees, loadServicesForEmployee]);

  useEffect(() => {
    const currentRequest = availabilityRequestRef.current;

    if (!creationContext?.barbershopId || !currentRequest || !getTokenRef.current) {
      return;
    }

    let cancelled = false;
    setCreationState((current) => (
      current ? beginAppointmentCreationAvailabilityRequest(current, currentRequest) : current
    ));

    void fetchAppointmentAvailability(getTokenRef.current, creationContext.barbershopId, currentRequest)
      .then((availability) => {
        if (cancelled) {
          return;
        }

        setCreationState((current) => (
          current
            ? resolveAppointmentCreationAvailabilitySuccess(current, currentRequest, availability)
            : current
        ));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setCreationState((current) => (
          current
            ? resolveAppointmentCreationAvailabilityFailure(
              current,
              currentRequest,
              mapAppointmentCreationError(error),
            )
            : current
        ));
      });

    return () => {
      cancelled = true;
    };
  }, [availabilityRequestKey, availabilityReloadNonce, creationContext?.barbershopId]);

  useEffect(() => {
    const preferredStartAt = typeof params.prefillStartAt === 'string'
      ? params.prefillStartAt
      : null;
    if (!preferredStartAt || !creationState?.availability) {
      return;
    }

    const matchingSlot = creationState.availability.slots.find(
      (slot) => slot.startAt === preferredStartAt,
    );

    if (!matchingSlot || creationState.selectedSlotStartAt === preferredStartAt) {
      return;
    }

    setCreationState((current) => (
      current ? selectAppointmentCreationSlot(current, preferredStartAt) : current
    ));
  }, [creationState?.availability, creationState?.selectedSlotStartAt, params.prefillStartAt]);

  const handleEmployeeSelect = useCallback((employeeId: string) => {
    setCreationState((current) => (
      current ? applyAppointmentCreationEmployeeChange(current, employeeId) : current
    ));
    setServicesStatus('idle');
    setServicesError(null);
    void loadServicesForEmployee(employeeId);
  }, [loadServicesForEmployee]);

  const handleServiceSelect = useCallback((serviceId: string) => {
    setCreationState((current) => (
      current ? applyAppointmentCreationServiceChange(current, serviceId) : current
    ));
    setPromotionQuote(null);
    setPromotionMessage(null);
  }, []);

  const handleSelectToday = useCallback(() => {
    setCreationState((current) => (
      current ? applyAppointmentCreationDateChange(current, getTodayDateString()) : current
    ));
  }, []);

  const handleSelectPreviousDate = useCallback(() => {
    setCreationState((current) => {
      if (!current || !current.localDate) {
        return current;
      }

      const previousDate = addDaysToDateString(current.localDate, -1);
      if (previousDate < getTodayDateString()) {
        return current;
      }

      return applyAppointmentCreationDateChange(current, previousDate);
    });
  }, []);

  const handleSelectNextDate = useCallback(() => {
    setCreationState((current) => {
      if (!current) {
        return current;
      }

      const baseDate = current.localDate || getTodayDateString();
      const nextDate = current.localDate ? addDaysToDateString(baseDate, 1) : baseDate;
      return applyAppointmentCreationDateChange(current, nextDate);
    });
  }, []);

  const handleSelectSlot = useCallback((startAt: string) => {
    setCreationState((current) => (
      current ? selectAppointmentCreationSlot(current, startAt) : current
    ));
  }, []);

  const handleClientNameChange = useCallback((value: string) => {
    setCreationState((current) => (
      current
        ? {
          ...current,
          clientName: value,
          submissionError: null,
          fieldErrors: {
            ...current.fieldErrors,
            clientName: undefined,
          },
        }
        : current
    ));
  }, []);

  const handleClientPhoneChange = useCallback((value: string) => {
    setCreationState((current) => (
      current
        ? {
          ...current,
          clientPhone: value,
          submissionError: null,
          fieldErrors: {
            ...current.fieldErrors,
            clientPhone: undefined,
          },
        }
        : current
    ));
    setPromotionQuote(null);
    setPromotionMessage(value.trim() ? t('appointmentCreation.messages.promotionNeedsReapply') : null);
  }, [t]);

  /**
   * Debounced repeat-customer lookup. The backend requires a
   * canonical E.164 phone and returns a zeroed-out response when no
   * history exists, so the UI can render an empty state without a
   * special branch. We keep the most recent request id and ignore
   * stale responses (out-of-order completion).
   */
  useEffect(() => {
    const phone = creationState?.clientPhone?.trim() ?? '';
    const barbershopId = creationContext?.barbershopId;
    if (!barbershopId) {
      setCustomerInsights(null);
      return;
    }

    if (!/^\+[1-9]\d{7,19}$/u.test(phone)) {
      // Don't query until the user has typed a real E.164 number.
      setCustomerInsights(null);
      return;
    }

    const requestId = customerLookupRequestIdRef.current + 1;
    customerLookupRequestIdRef.current = requestId;
    const handle = setTimeout(() => {
      if (customerLookupRequestIdRef.current !== requestId) {
        return;
      }
      const token = getTokenRef.current;
      if (!token) {
        return;
      }
      void lookupCustomerByPhone(token, barbershopId, phone)
        .then((insights) => {
          if (customerLookupRequestIdRef.current !== requestId) {
            return;
          }
          setCustomerInsights(insights);
        })
        .catch(() => {
          if (customerLookupRequestIdRef.current !== requestId) {
            return;
          }
          setCustomerInsights(null);
        });
    }, 400);

    return () => {
      clearTimeout(handle);
    };
  }, [creationState?.clientPhone, creationContext?.barbershopId]);

  const customerWarning = useMemo(() => {
    if (!customerInsights || customerInsights.noShowCount <= 0) {
      return null;
    }
    return {
      noShowCount: customerInsights.noShowCount,
      lastNoShowAt: customerInsights.lastNoShowAt,
    };
  }, [customerInsights]);

  const handleNotesChange = useCallback((value: string) => {
    setCreationState((current) => (
      current
        ? {
          ...current,
          notes: value,
          submissionError: null,
          fieldErrors: {
            ...current.fieldErrors,
            notes: undefined,
          },
        }
        : current
    ));
  }, []);

  const handleClientEmailChange = useCallback((value: string) => {
    setCreationState((current) => (
      current
        ? {
          ...current,
          clientEmail: value,
          submissionError: null,
          fieldErrors: {
            ...current.fieldErrors,
            clientEmail: undefined,
          },
        }
        : current
    ));
  }, []);

  const handlePromotionCodeChange = useCallback((value: string) => {
    setCreationState((current) => (
      current ? applyAppointmentCreationPromotionCodeChange(current, value) : current
    ));
    setPromotionQuote(null);
    setPromotionMessage(null);
  }, []);

  const handleRemovePromotion = useCallback(() => {
    setCreationState((current) => (
      current ? applyAppointmentCreationPromotionCodeChange(current, '') : current
    ));
    setPromotionQuote(null);
    setPromotionMessage(null);
  }, []);

  const handleApplyPromotion = useCallback(async () => {
    if (!creationContext?.barbershopId || !creationState?.serviceId || !getTokenRef.current) {
      setPromotionQuote(null);
      setPromotionMessage(t('appointmentCreation.messages.promotionSelectServiceFirst'));
      return;
    }

    const trimmedCode = creationState.promotionCode.trim();
    if (!trimmedCode) {
      setPromotionQuote(null);
      setPromotionMessage(t('appointmentCreation.messages.promotionEnterCode'));
      return;
    }

    const requestId = promotionRequestIdRef.current + 1;
    promotionRequestIdRef.current = requestId;
    setIsQuotingPromotion(true);
    setPromotionMessage(null);

    try {
      const quote = await quoteStaffPromotion(getTokenRef.current, creationContext.barbershopId, {
        serviceId: creationState.serviceId,
        code: trimmedCode,
        clientPhone: creationState.clientPhone,
      });

      if (promotionRequestIdRef.current !== requestId) {
        return;
      }

      if (!quote.eligible) {
        setPromotionQuote(null);
        setPromotionMessage(t('appointmentCreation.messages.promotionUnavailable'));
        return;
      }

      setCreationState((current) => (
        current ? applyAppointmentCreationPromotionCodeChange(current, quote.promotion.codeNormalized) : current
      ));
      setPromotionQuote(quote);
      setPromotionMessage(t('appointmentCreation.messages.promotionApplied', { name: quote.promotion.name }));
    } catch (error) {
      if (promotionRequestIdRef.current !== requestId) {
        return;
      }
      setPromotionQuote(null);
      setPromotionMessage(error instanceof Error ? error.message : t('appointmentCreation.messages.promotionUnavailable'));
    } finally {
      if (promotionRequestIdRef.current === requestId) {
        setIsQuotingPromotion(false);
      }
    }
  }, [creationContext?.barbershopId, creationState, t]);

  const refreshAvailability = useCallback(async () => {
    setAvailabilityReloadNonce((current) => current + 1);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!creationState || !creationContext) {
      return;
    }

    const nextState = await submitAppointmentCreationFlow({
      state: creationState,
      barbershopId: creationContext.barbershopId,
      createAppointment: (barbershopId, payload) => createStaffAppointment(getTokenRef.current, barbershopId, payload),
      recordCreatedAppointment,
      onSuccess: async () => {
        useFlashStore.getState().setMessage(t('appointmentCreation.successFeedback'));
        router.replace('/(tabs)/appointments');
      },
      refreshAvailability,
    });

    setCreationState(nextState);

    if (
      nextState.submissionError?.key === 'serviceUnavailable'
      || nextState.submissionError?.key === 'serviceNotAssigned'
    ) {
      const effectiveEmployeeId = nextState.context.role === 'BARBER'
        ? nextState.context.authenticatedEmployeeId
        : nextState.employeeId;
      await loadServicesForEmployee(effectiveEmployeeId);
    }

    if (
      nextState.submissionError?.key === 'employeeUnavailable'
      || nextState.submissionError?.key === 'forbiddenEmployeeScope'
    ) {
      await loadOwnerEmployees();
    }
  }, [creationContext, creationState, loadOwnerEmployees, loadServicesForEmployee, recordCreatedAppointment, refreshAvailability, router, t]);

  const blockingCopy = useMemo(() => {
    if (!context) {
      return { title: null, message: null };
    }

    if (context.role === 'CLIENT') {
      return {
        title: t('appointmentCreation.blockedTitle'),
        message: t('appointmentCreation.blockedMessage'),
      };
    }

    if ((context.role === 'OWNER' || context.role === 'BARBER') && !context.barbershopId) {
      return {
        title: t('appointmentCreation.blockedTitle'),
        message: t('appointmentCreation.ownerNoBarbershop'),
      };
    }

    if (context.role === 'BARBER' && !context.employeeId) {
      return {
        title: t('appointmentCreation.states.invalidBarberContextTitle'),
        message: t('appointmentCreation.barberNoEmployeeContext'),
      };
    }

    return { title: null, message: null };
  }, [context, t]);

  const selectedEmployeeName = useMemo(() => {
    if (context?.role === 'BARBER') {
      return context.employeeName ?? null;
    }

    if (!creationState?.employeeId) {
      return null;
    }

    const selectedEmployee = creationState.availableEmployees.find((employee) => employee.id === creationState.employeeId);
    return selectedEmployee?.user.name ?? selectedEmployee?.user.email ?? null;
  }, [context, creationState]);

  const employeeOptions = useMemo<AppointmentEmployeeOption[]>(() => {
    if (!creationState || context?.role !== 'OWNER') {
      return [];
    }

    return creationState.availableEmployees.map((employee) => ({
      id: employee.id,
      label: employee.user.name ?? employee.user.email,
      selected: creationState.employeeId === employee.id,
      testID: `appointment-create-employee-${employee.id}`,
      accessibilityLabel: t('appointmentCreation.accessibility.employeeOption', {
        name: employee.user.name ?? employee.user.email,
      }),
      onPress: () => handleEmployeeSelect(employee.id),
    }));
  }, [context?.role, creationState, handleEmployeeSelect, t]);

  const serviceOptions = useMemo<AppointmentServiceOption[]>(() => {
    if (!creationState) {
      return [];
    }

    return creationState.availableServices.map((service) => ({
      id: service.id,
      label: service.name,
      detail: buildAppointmentServiceDetail({
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        currency: service.currency,
        t,
      }),
      selected: creationState.serviceId === service.id,
      testID: `appointment-create-service-${service.id}`,
      accessibilityLabel: t('appointmentCreation.accessibility.serviceOption', {
        name: service.name,
      }),
      onPress: () => handleServiceSelect(service.id),
    }));
  }, [creationState, handleServiceSelect, t]);

  const slotOptions = useMemo<AppointmentSlotOption[]>(() => {
    if (!creationState?.availability) {
      return [];
    }

    return creationState.availability.slots.map((slot) => ({
      startAt: slot.startAt,
      label: slot.localStartTime,
      selected: creationState.selectedSlotStartAt === slot.startAt,
      testID: `appointment-create-slot-${slot.startAt}`,
      accessibilityLabel: creationState.selectedSlotStartAt === slot.startAt
        ? t('appointmentCreation.accessibility.selectedTimeOption', { time: slot.localStartTime })
        : t('appointmentCreation.accessibility.timeOption', { time: slot.localStartTime }),
      onPress: () => handleSelectSlot(slot.startAt),
    }));
  }, [creationState, handleSelectSlot, t]);

  const summary = useMemo(() => {
    if (!creationState || !creationState.serviceId || !selectedEmployeeName || !creationState.localDate || !creationState.selectedSlotStartAt) {
      return null;
    }

    const selectedService = creationState.availableServices.find((service) => service.id === creationState.serviceId);
    const selectedSlot = creationState.availability?.slots.find((slot) => slot.startAt === creationState.selectedSlotStartAt);

    if (!selectedService || !selectedSlot) {
      return null;
    }

    return buildAppointmentSummaryViewModel({
      clientName: creationState.clientName,
      employeeName: selectedEmployeeName,
      localDate: creationState.localDate,
      localStartTime: selectedSlot.localStartTime,
      localEndTime: selectedSlot.localEndTime,
      priceCents: promotionQuote?.finalPriceCents ?? selectedService.priceCents,
      currency: selectedService.currency,
      serviceName: selectedService.name,
      durationMinutes: selectedService.durationMinutes,
      t,
    });
  }, [creationState, promotionQuote, selectedEmployeeName, t]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <AppointmentCreateScreenView
      context={context}
      isContextLoading={isContextLoading}
      contextError={contextError}
      blockingTitle={blockingCopy.title}
      blockingMessage={blockingCopy.message}
      employeesStatus={employeesStatus}
      employeesError={employeesError}
      employeeOptions={employeeOptions}
      servicesStatus={servicesStatus}
      servicesError={servicesError}
      serviceOptions={serviceOptions}
      selectedEmployeeName={selectedEmployeeName}
      selectedDate={creationState?.localDate ?? ''}
      canMoveToPreviousDate={!!creationState?.localDate && creationState.localDate > getTodayDateString()}
      isDateSectionEnabled={!!creationState?.serviceId}
      availabilityStatus={creationState?.availabilityStatus ?? 'idle'}
      availabilityErrorKey={creationState?.availabilityError?.key ?? null}
      slotOptions={slotOptions}
      clientName={creationState?.clientName ?? ''}
      clientPhone={creationState?.clientPhone ?? ''}
      clientEmail={creationState?.clientEmail ?? ''}
      notes={creationState?.notes ?? ''}
      promotionCode={creationState?.promotionCode ?? ''}
      promotionQuote={promotionQuote}
      promotionMessage={promotionMessage}
      isQuotingPromotion={isQuotingPromotion}
      customerWarning={customerWarning}
      fieldErrors={creationState?.fieldErrors ?? {}}
      submissionErrorKey={creationState?.submissionError?.key ?? null}
      summary={summary}
      isSubmitting={creationState?.isSubmitting ?? false}
      onBack={() => router.back()}
      onRetryEmployees={loadOwnerEmployees}
      onRetryServices={() => {
        const effectiveEmployeeId = creationState?.context.role === 'BARBER'
          ? creationState?.context.authenticatedEmployeeId
          : creationState?.employeeId ?? null;
        void loadServicesForEmployee(effectiveEmployeeId);
      }}
      onSelectToday={handleSelectToday}
      onSelectPreviousDate={handleSelectPreviousDate}
      onSelectNextDate={handleSelectNextDate}
      onRetryAvailability={() => {
        void refreshAvailability();
      }}
      onClientNameChange={handleClientNameChange}
      onClientPhoneChange={handleClientPhoneChange}
      onClientEmailChange={handleClientEmailChange}
      onNotesChange={handleNotesChange}
      onPromotionCodeChange={handlePromotionCodeChange}
      onApplyPromotion={() => {
        void handleApplyPromotion();
      }}
      onRemovePromotion={handleRemovePromotion}
      onSubmit={() => {
        void handleSubmit();
      }}
    />
  );
}
