import { ApiError } from './api.js';
import type {
  Appointment,
  AppointmentAvailability,
  AppointmentAvailabilitySlot,
  CreateStaffAppointmentInput,
  EmployeeListItem,
  Service,
  UserRole,
} from './types.js';

export type AppointmentCreationRole = Extract<UserRole, 'OWNER' | 'BARBER'>;

export type AppointmentCreationField =
  | 'employeeId'
  | 'serviceId'
  | 'localDate'
  | 'selectedSlot'
  | 'clientName'
  | 'clientPhone'
  | 'clientEmail'
  | 'notes';

export type AppointmentCreationValidationKey =
  | 'employeeRequired'
  | 'employeeContextRequired'
  | 'serviceRequired'
  | 'dateRequired'
  | 'slotRequired'
  | 'clientNameRequired'
  | 'clientNameTooLong'
  | 'clientPhoneTooLong'
  | 'clientEmailInvalid'
  | 'notesTooLong'
  | 'invalidDate'
  | 'staleSlot';

export type AppointmentCreationErrorKey =
  | 'authenticationRequired'
  | 'forbiddenEmployeeScope'
  | 'barbershopAccessDenied'
  | 'employeeUnavailable'
  | 'serviceUnavailable'
  | 'serviceNotAssigned'
  | 'appointmentTimeInvalid'
  | 'appointmentOutsideWorkingHours'
  | 'appointmentSlotTaken'
  | 'invalidClientFields'
  | 'networkError'
  | 'unknownServerError';

export interface AppointmentCreationContext {
  role: AppointmentCreationRole;
  barbershopId: string | null;
  authenticatedEmployeeId: string | null;
}

export interface AppointmentCreationAvailabilityRequest {
  employeeId: string;
  serviceId: string;
  localDate: string;
}

export interface AppointmentCreationErrorDescriptor {
  key: AppointmentCreationErrorKey;
  shouldClearSelectedSlot: boolean;
  shouldRefreshAvailability: boolean;
}

export interface AppointmentCreationState {
  context: AppointmentCreationContext;
  customerId: string | null;
  employeeId: string | null;
  serviceId: string | null;
  localDate: string;
  selectedSlotStartAt: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  notes: string;
  availableEmployees: EmployeeListItem[];
  availableServices: Service[];
  availability: AppointmentAvailability | null;
  availabilityStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  availabilityError: AppointmentCreationErrorDescriptor | null;
  isSubmitting: boolean;
  submissionError: AppointmentCreationErrorDescriptor | null;
  fieldErrors: Partial<Record<AppointmentCreationField, AppointmentCreationValidationKey>>;
  activeAvailabilityRequestKey: string | null;
}

export interface AppointmentCreationValidationResult {
  ok: boolean;
  fieldErrors: Partial<Record<AppointmentCreationField, AppointmentCreationValidationKey>>;
}

export type BuildStaffAppointmentPayloadResult =
  | {
      ok: true;
      payload: CreateStaffAppointmentInput;
      effectiveEmployeeId: string;
      selectedSlot: AppointmentAvailabilitySlot;
    }
  | AppointmentCreationValidationResult;

const CLIENT_NAME_MAX_LENGTH = 200;
const CLIENT_PHONE_MAX_LENGTH = 50;
const CLIENT_EMAIL_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 500;

function trimOptionalText(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeClientName(value: string): string {
  return value.trim();
}

function isValidClientEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function lowerMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  if (typeof error === 'string') {
    return error.toLowerCase();
  }

  return '';
}

export function isValidLocalDateString(localDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return false;
  }

  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

export function getEffectiveAppointmentEmployeeId(input: {
  role: AppointmentCreationRole;
  selectedEmployeeId: string | null;
  authenticatedEmployeeId: string | null;
}): string | null {
  return input.role === 'BARBER'
    ? input.authenticatedEmployeeId
    : input.selectedEmployeeId;
}

export function buildAppointmentAvailabilityRequestKey(
  request: AppointmentCreationAvailabilityRequest
): string {
  return `${request.employeeId}::${request.serviceId}::${request.localDate}`;
}

export function createInitialAppointmentCreationState(
  context: AppointmentCreationContext
): AppointmentCreationState {
  return {
    context,
    customerId: null,
    employeeId: context.role === 'BARBER' ? context.authenticatedEmployeeId : null,
    serviceId: null,
    localDate: '',
    selectedSlotStartAt: null,
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    notes: '',
    availableEmployees: [],
    availableServices: [],
    availability: null,
    availabilityStatus: 'idle',
    availabilityError: null,
    isSubmitting: false,
    submissionError: null,
    fieldErrors: {},
    activeAvailabilityRequestKey: null,
  };
}

export function applyAppointmentCreationCustomerPrefill(
  state: AppointmentCreationState,
  input: {
    customerId: string;
    clientName: string;
    clientPhone: string;
    clientEmail?: string | null;
  }
): AppointmentCreationState {
  return {
    ...state,
    customerId: input.customerId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    clientEmail: input.clientEmail ?? '',
    submissionError: null,
    fieldErrors: {
      ...state.fieldErrors,
      clientName: undefined,
      clientPhone: undefined,
      clientEmail: undefined,
    },
  };
}

function clearAvailabilityState(state: AppointmentCreationState): AppointmentCreationState {
  return {
    ...state,
    availability: null,
    availabilityStatus: 'idle',
    availabilityError: null,
    selectedSlotStartAt: null,
    activeAvailabilityRequestKey: null,
  };
}

export function setAppointmentCreationEmployees(
  state: AppointmentCreationState,
  employees: EmployeeListItem[]
): AppointmentCreationState {
  const nextEmployees = employees.filter((employee) => employee.isActive);

  if (state.context.role !== 'OWNER') {
    return { ...state, availableEmployees: nextEmployees };
  }

  if (
    state.employeeId &&
    !nextEmployees.some((employee) => employee.id === state.employeeId)
  ) {
    return {
      ...applyAppointmentCreationEmployeeChange(
        { ...state, availableEmployees: nextEmployees },
        null
      ),
      availableEmployees: nextEmployees,
    };
  }

  return { ...state, availableEmployees: nextEmployees };
}

export function setAppointmentCreationServices(
  state: AppointmentCreationState,
  services: Service[]
): AppointmentCreationState {
  const nextServices = services.filter((service) => service.isActive);

  if (
    state.serviceId &&
    !nextServices.some((service) => service.id === state.serviceId)
  ) {
    return {
      ...applyAppointmentCreationServiceChange(
        { ...state, availableServices: nextServices },
        null
      ),
      availableServices: nextServices,
    };
  }

  return { ...state, availableServices: nextServices };
}

export function syncAppointmentCreationContext(
  state: AppointmentCreationState,
  nextContext: AppointmentCreationContext
): AppointmentCreationState {
  const contextChanged =
    state.context.role !== nextContext.role ||
    state.context.barbershopId !== nextContext.barbershopId ||
    state.context.authenticatedEmployeeId !== nextContext.authenticatedEmployeeId;

  if (!contextChanged) {
    return state;
  }

  return {
    ...createInitialAppointmentCreationState(nextContext),
    customerId: state.customerId,
    clientName: state.clientName,
    clientPhone: state.clientPhone,
    clientEmail: state.clientEmail,
    notes: state.notes,
    localDate: state.localDate,
  };
}

export function applyAppointmentCreationEmployeeChange(
  state: AppointmentCreationState,
  employeeId: string | null
): AppointmentCreationState {
  if (state.employeeId === employeeId) {
    return state;
  }

  return {
    ...clearAvailabilityState(state),
    employeeId,
    serviceId: null,
    availableServices: state.context.role === 'OWNER' ? [] : state.availableServices,
    fieldErrors: {
      ...state.fieldErrors,
      employeeId: undefined,
      serviceId: undefined,
      localDate: undefined,
      selectedSlot: undefined,
    },
    submissionError: null,
  };
}

export function applyAppointmentCreationServiceChange(
  state: AppointmentCreationState,
  serviceId: string | null
): AppointmentCreationState {
  if (state.serviceId === serviceId) {
    return state;
  }

  return {
    ...clearAvailabilityState(state),
    serviceId,
    fieldErrors: {
      ...state.fieldErrors,
      serviceId: undefined,
      localDate: undefined,
      selectedSlot: undefined,
    },
    submissionError: null,
  };
}

export function applyAppointmentCreationDateChange(
  state: AppointmentCreationState,
  localDate: string
): AppointmentCreationState {
  if (state.localDate === localDate) {
    return state;
  }

  return {
    ...clearAvailabilityState(state),
    localDate,
    fieldErrors: {
      ...state.fieldErrors,
      localDate: undefined,
      selectedSlot: undefined,
    },
    submissionError: null,
  };
}

export function selectAppointmentCreationSlot(
  state: AppointmentCreationState,
  startAt: string | null
): AppointmentCreationState {
  return {
    ...state,
    selectedSlotStartAt: startAt,
    fieldErrors: {
      ...state.fieldErrors,
      selectedSlot: undefined,
    },
    submissionError: null,
  };
}

export function getAppointmentCreationAvailabilityRequest(
  state: AppointmentCreationState
): AppointmentCreationAvailabilityRequest | null {
  const effectiveEmployeeId = getEffectiveAppointmentEmployeeId({
    role: state.context.role,
    selectedEmployeeId: state.employeeId,
    authenticatedEmployeeId: state.context.authenticatedEmployeeId,
  });

  if (!effectiveEmployeeId || !state.serviceId || !state.localDate) {
    return null;
  }

  return {
    employeeId: effectiveEmployeeId,
    serviceId: state.serviceId,
    localDate: state.localDate,
  };
}

export function beginAppointmentCreationAvailabilityRequest(
  state: AppointmentCreationState,
  request: AppointmentCreationAvailabilityRequest
): AppointmentCreationState {
  return {
    ...state,
    availabilityStatus: 'loading',
    availabilityError: null,
    submissionError: null,
    activeAvailabilityRequestKey: buildAppointmentAvailabilityRequestKey(request),
  };
}

export function resolveAppointmentCreationAvailabilitySuccess(
  state: AppointmentCreationState,
  request: AppointmentCreationAvailabilityRequest,
  availability: AppointmentAvailability
): AppointmentCreationState {
  const requestKey = buildAppointmentAvailabilityRequestKey(request);
  if (state.activeAvailabilityRequestKey !== requestKey) {
    return state;
  }

  const selectedSlotStillPresent =
    state.selectedSlotStartAt !== null &&
    availability.slots.some((slot) => slot.startAt === state.selectedSlotStartAt);

  return {
    ...state,
    availability,
    availabilityStatus: availability.slots.length > 0 ? 'success' : 'empty',
    availabilityError: null,
    selectedSlotStartAt: selectedSlotStillPresent ? state.selectedSlotStartAt : null,
    activeAvailabilityRequestKey: null,
    fieldErrors: {
      ...state.fieldErrors,
      selectedSlot:
        state.selectedSlotStartAt && !selectedSlotStillPresent
          ? 'staleSlot'
          : undefined,
    },
  };
}

export function resolveAppointmentCreationAvailabilityFailure(
  state: AppointmentCreationState,
  request: AppointmentCreationAvailabilityRequest,
  error: AppointmentCreationErrorDescriptor
): AppointmentCreationState {
  const requestKey = buildAppointmentAvailabilityRequestKey(request);
  if (state.activeAvailabilityRequestKey !== requestKey) {
    return state;
  }

  return {
    ...state,
    availabilityStatus: 'error',
    availabilityError: error,
    activeAvailabilityRequestKey: null,
  };
}

export function startAppointmentCreationSubmission(
  state: AppointmentCreationState
): AppointmentCreationState {
  return {
    ...state,
    isSubmitting: true,
    submissionError: null,
  };
}

export function finishAppointmentCreationSubmission(
  state: AppointmentCreationState
): AppointmentCreationState {
  return {
    ...state,
    isSubmitting: false,
  };
}

export function failAppointmentCreationSubmission(
  state: AppointmentCreationState,
  error: AppointmentCreationErrorDescriptor
): AppointmentCreationState {
  return {
    ...state,
    isSubmitting: false,
    submissionError: error,
    selectedSlotStartAt: error.shouldClearSelectedSlot ? null : state.selectedSlotStartAt,
    fieldErrors: {
      ...state.fieldErrors,
      selectedSlot: error.shouldClearSelectedSlot ? 'staleSlot' : state.fieldErrors.selectedSlot,
    },
  };
}

export function validateAppointmentCreationDraft(
  state: AppointmentCreationState
): AppointmentCreationValidationResult {
  const fieldErrors: Partial<
    Record<AppointmentCreationField, AppointmentCreationValidationKey>
  > = {};

  const effectiveEmployeeId = getEffectiveAppointmentEmployeeId({
    role: state.context.role,
    selectedEmployeeId: state.employeeId,
    authenticatedEmployeeId: state.context.authenticatedEmployeeId,
  });

  if (state.context.role === 'OWNER' && !effectiveEmployeeId) {
    fieldErrors.employeeId = 'employeeRequired';
  }

  if (state.context.role === 'BARBER' && !effectiveEmployeeId) {
    fieldErrors.employeeId = 'employeeContextRequired';
  }

  if (!state.serviceId) {
    fieldErrors.serviceId = 'serviceRequired';
  }

  if (!state.localDate) {
    fieldErrors.localDate = 'dateRequired';
  } else if (!isValidLocalDateString(state.localDate)) {
    fieldErrors.localDate = 'invalidDate';
  }

  const trimmedClientName = normalizeClientName(state.clientName);
  if (!trimmedClientName) {
    fieldErrors.clientName = 'clientNameRequired';
  } else if (trimmedClientName.length > CLIENT_NAME_MAX_LENGTH) {
    fieldErrors.clientName = 'clientNameTooLong';
  }

  const trimmedClientPhone = trimOptionalText(state.clientPhone);
  if (trimmedClientPhone && trimmedClientPhone.length > CLIENT_PHONE_MAX_LENGTH) {
    fieldErrors.clientPhone = 'clientPhoneTooLong';
  }

  const trimmedClientEmail = trimOptionalText(state.clientEmail);
  if (
    trimmedClientEmail
    && (
      trimmedClientEmail.length > CLIENT_EMAIL_MAX_LENGTH
      || !isValidClientEmail(trimmedClientEmail)
    )
  ) {
    fieldErrors.clientEmail = 'clientEmailInvalid';
  }

  const trimmedNotes = trimOptionalText(state.notes);
  if (trimmedNotes && trimmedNotes.length > NOTES_MAX_LENGTH) {
    fieldErrors.notes = 'notesTooLong';
  }

  if (!state.selectedSlotStartAt) {
    fieldErrors.selectedSlot = 'slotRequired';
  } else if (
    !state.availability ||
    !state.availability.slots.some((slot) => slot.startAt === state.selectedSlotStartAt)
  ) {
    fieldErrors.selectedSlot = 'staleSlot';
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

export function buildCreateStaffAppointmentPayload(
  state: AppointmentCreationState
): BuildStaffAppointmentPayloadResult {
  const validation = validateAppointmentCreationDraft(state);
  if (!validation.ok) {
    return validation;
  }

  const effectiveEmployeeId = getEffectiveAppointmentEmployeeId({
    role: state.context.role,
    selectedEmployeeId: state.employeeId,
    authenticatedEmployeeId: state.context.authenticatedEmployeeId,
  });

  const selectedSlot = state.availability!.slots.find(
    (slot) => slot.startAt === state.selectedSlotStartAt
  );

  if (!effectiveEmployeeId || !selectedSlot) {
    return {
      ok: false,
      fieldErrors: {
        employeeId: !effectiveEmployeeId
          ? state.context.role === 'BARBER'
            ? 'employeeContextRequired'
            : 'employeeRequired'
          : undefined,
        selectedSlot: !selectedSlot ? 'staleSlot' : undefined,
      },
    };
  }

  const payload: CreateStaffAppointmentInput = {
    serviceId: state.serviceId!,
    startAt: selectedSlot.startAt,
    clientName: normalizeClientName(state.clientName),
    ...(state.context.role === 'OWNER' ? { employeeId: effectiveEmployeeId } : {}),
    ...(state.customerId ? { customerId: state.customerId } : {}),
    ...(trimOptionalText(state.clientPhone)
      ? { clientPhone: trimOptionalText(state.clientPhone) }
      : {}),
    ...(trimOptionalText(state.clientEmail)
      ? { clientEmail: trimOptionalText(state.clientEmail) }
      : {}),
    ...(trimOptionalText(state.notes) ? { notes: trimOptionalText(state.notes) } : {}),
  };

  return {
    ok: true,
    payload,
    effectiveEmployeeId,
    selectedSlot,
  };
}

export function mapAppointmentCreationError(
  error: unknown
): AppointmentCreationErrorDescriptor {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();

    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return {
        key: 'authenticationRequired',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      };
    }

    if (error.code === 'FORBIDDEN_EMPLOYEE_SCOPE') {
      return {
        key: 'forbiddenEmployeeScope',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      };
    }

    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return {
        key: 'barbershopAccessDenied',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      };
    }

    if (error.status === 409 || error.code === 'CONFLICT') {
      return {
        key: 'appointmentSlotTaken',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (error.code === 'INVALID_APPOINTMENT_DATE' || error.code === 'INVALID_APPOINTMENT_TIME') {
      return {
        key: 'appointmentTimeInvalid',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      };
    }

    if (
      error.code === 'EMPLOYEE_NOT_WORKING' ||
      error.code === 'EMPLOYEE_TIME_OFF' ||
      error.code === 'EMPLOYEE_SCHEDULE_CONFLICT' ||
      error.code === 'BARBERSHOP_CLOSED'
    ) {
      return {
        key: 'appointmentOutsideWorkingHours',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (error.code === 'VALIDATION_ERROR') {
      return {
        key: 'invalidClientFields',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      };
    }

    if (message.includes('employee does not offer this service')) {
      return {
        key: 'serviceNotAssigned',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (
      message.includes('before opening hours') ||
      message.includes('after closing hours') ||
      message.includes('barbershop is closed')
    ) {
      return {
        key: 'appointmentOutsideWorkingHours',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (
      message.includes('employee is not active') ||
      message.includes('employee does not belong') ||
      message.includes('employee not found')
    ) {
      return {
        key: 'employeeUnavailable',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (
      message.includes('service is not available') ||
      message.includes('service does not belong') ||
      message.includes('service not found')
    ) {
      return {
        key: 'serviceUnavailable',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (
      message.includes('must be scheduled in the future') ||
      message.includes('30-minute interval') ||
      message.includes('past date')
    ) {
      return {
        key: 'appointmentTimeInvalid',
        shouldClearSelectedSlot: true,
        shouldRefreshAvailability: true,
      };
    }

    if (message.includes('client name')) {
      return {
        key: 'invalidClientFields',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      };
    }

    return {
      key: 'unknownServerError',
      shouldClearSelectedSlot: false,
      shouldRefreshAvailability: false,
    };
  }

  const message = lowerMessage(error);
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket') ||
    message.includes('failed to fetch')
  ) {
    return {
      key: 'networkError',
      shouldClearSelectedSlot: false,
      shouldRefreshAvailability: false,
    };
  }

  return {
    key: 'unknownServerError',
    shouldClearSelectedSlot: false,
    shouldRefreshAvailability: false,
  };
}

export function appointmentMatchesContext(
  appointment: Appointment,
  context: {
    role: UserRole;
    userId: string;
    barbershopId: string | null;
    employeeId: string | null;
  }
): boolean {
  if (context.role === 'OWNER') {
    return context.barbershopId === null || appointment.barbershopId === context.barbershopId;
  }

  if (context.role === 'BARBER') {
    return (
      context.barbershopId !== null &&
      context.employeeId !== null &&
      appointment.barbershopId === context.barbershopId &&
      appointment.employeeId === context.employeeId
    );
  }

  return appointment.clientId === context.userId;
}

export function upsertAppointmentById(
  appointments: Appointment[],
  appointment: Appointment
): Appointment[] {
  const nextAppointments = [
    appointment,
    ...appointments.filter((current) => current.id !== appointment.id),
  ];

  nextAppointments.sort((a, b) => b.startAt.localeCompare(a.startAt));
  return nextAppointments;
}
