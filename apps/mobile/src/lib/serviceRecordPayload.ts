import type { CreateServiceRecordInput } from './types.js';

interface BuildBarberServiceRecordPayloadInput {
  employeeId: string;
  priceCents: number;
  serviceId: string;
}

export function buildBarberServiceRecordPayload({
  employeeId,
  priceCents,
  serviceId,
}: BuildBarberServiceRecordPayloadInput): CreateServiceRecordInput {
  return {
    employeeId,
    serviceId,
    priceCents,
  };
}
