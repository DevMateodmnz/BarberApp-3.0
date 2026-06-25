import type { Appointment } from './types.js';

export function getAppointmentClientDisplayName(appointment: Appointment): string {
  const snapshotName = appointment.clientName?.trim();
  if (snapshotName) {
    return snapshotName;
  }

  const relationName = appointment.client?.name?.trim();
  if (relationName) {
    return relationName;
  }

  return appointment.client?.email ?? '—';
}

export function getAppointmentServiceDisplayName(appointment: Appointment): string {
  const snapshotName = appointment.serviceName?.trim();
  if (snapshotName) {
    return snapshotName;
  }

  return appointment.service.name;
}

export function getAppointmentServicePriceCents(appointment: Appointment): number {
  return Number.isInteger(appointment.servicePriceCents)
    ? appointment.servicePriceCents
    : appointment.service.priceCents;
}

export function getAppointmentServiceDurationMinutes(appointment: Appointment): number {
  return Number.isInteger(appointment.serviceDurationMinutes)
    ? appointment.serviceDurationMinutes
    : appointment.service.durationMinutes;
}

export function getAppointmentServiceCurrency(appointment: Appointment): string {
  return appointment.serviceCurrency?.trim() || appointment.service.currency || 'ARS';
}
