import { describe, expect, it } from 'vitest';
import { buildAppointmentPaymentLabels } from '@/lib/appointmentActions.js';

const t = (key: string) =>
  ({
    'appointments.paymentLabels.pending': 'Deposit pending',
    'appointments.paymentLabels.approved': 'Deposit paid',
    'appointments.paymentLabels.expired': 'Reservation expired',
    'appointments.paymentLabels.rejected': 'Payment rejected',
    'appointments.paymentLabels.reviewRequired': 'Payment review required',
  })[key] ?? key;

describe('buildAppointmentPaymentLabels', () => {
  it('maps pending-like payment states to the pending label', () => {
    expect(buildAppointmentPaymentLabels('CREATING', t)).toEqual(['Deposit pending']);
    expect(buildAppointmentPaymentLabels('PENDING', t)).toEqual(['Deposit pending']);
  });

  it('maps approved, rejected, expired, and review-required states to safe staff labels', () => {
    expect(buildAppointmentPaymentLabels('APPROVED', t)).toEqual(['Deposit paid']);
    expect(buildAppointmentPaymentLabels('REJECTED', t)).toEqual(['Payment rejected']);
    expect(buildAppointmentPaymentLabels('CANCELLED', t)).toEqual(['Reservation expired']);
    expect(buildAppointmentPaymentLabels('EXPIRED', t)).toEqual(['Reservation expired']);
    expect(buildAppointmentPaymentLabels('REVIEW_REQUIRED', t)).toEqual([
      'Payment review required',
    ]);
  });

  it('hides statuses that should not surface as appointment badges', () => {
    expect(buildAppointmentPaymentLabels('ERROR', t)).toEqual([]);
    expect(buildAppointmentPaymentLabels('REFUNDED', t)).toEqual([]);
    expect(buildAppointmentPaymentLabels(null, t)).toEqual([]);
  });
});
