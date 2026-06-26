import {
  applyAppointmentCreationEmployeeChange,
  applyAppointmentCreationServiceChange,
  buildCreateStaffAppointmentPayload,
  failAppointmentCreationSubmission,
  finishAppointmentCreationSubmission,
  mapAppointmentCreationError,
  startAppointmentCreationSubmission,
  type AppointmentCreationState,
} from './appointmentCreationDomain.js';
import type { Appointment, CreateStaffAppointmentInput } from './types.js';

interface SubmitAppointmentCreationFlowInput {
  state: AppointmentCreationState;
  barbershopId: string | null;
  createAppointment: (barbershopId: string, payload: CreateStaffAppointmentInput) => Promise<Appointment>;
  recordCreatedAppointment: (appointment: Appointment) => void;
  onSuccess: (appointment: Appointment) => Promise<void> | void;
  refreshAvailability: () => Promise<void> | void;
}

export async function submitAppointmentCreationFlow(
  input: SubmitAppointmentCreationFlowInput,
): Promise<AppointmentCreationState> {
  const validation = buildCreateStaffAppointmentPayload(input.state);
  if (!('payload' in validation)) {
    return {
      ...input.state,
      fieldErrors: validation.fieldErrors,
      submissionError: null,
      isSubmitting: false,
    };
  }

  if (!input.barbershopId) {
    return {
      ...input.state,
      isSubmitting: false,
      submissionError: {
        key: 'barbershopAccessDenied',
        shouldClearSelectedSlot: false,
        shouldRefreshAvailability: false,
      },
    };
  }

  let nextState = startAppointmentCreationSubmission(input.state);

  try {
    const appointment = await input.createAppointment(input.barbershopId, validation.payload);
    input.recordCreatedAppointment(appointment);
    await input.onSuccess(appointment);
    nextState = finishAppointmentCreationSubmission(nextState);
    return nextState;
  } catch (error) {
    const descriptor = mapAppointmentCreationError(error);
    nextState = failAppointmentCreationSubmission(nextState, descriptor);

    if (descriptor.key === 'forbiddenEmployeeScope' || descriptor.key === 'employeeUnavailable') {
      if (nextState.context.role === 'OWNER') {
        nextState = {
          ...applyAppointmentCreationEmployeeChange(nextState, null),
          submissionError: descriptor,
        };
      }
    }

    if (descriptor.key === 'serviceUnavailable' || descriptor.key === 'serviceNotAssigned') {
      nextState = {
        ...applyAppointmentCreationServiceChange(nextState, null),
        submissionError: descriptor,
      };
    }

    if (descriptor.shouldRefreshAvailability) {
      await input.refreshAvailability();
    }

    return nextState;
  }
}
