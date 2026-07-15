import { describe, expect, it } from 'vitest';
import { buildAppointmentNotificationEmail } from '../../src/lib/appointmentNotificationEmail.js';

const basePayload = {
  customerName: 'Mateo <script>',
  barbershopName: 'Barbería Central',
  serviceName: 'Corte clásico',
  employeeName: 'Carlos',
  timezone: 'America/Argentina/Tucuman',
  startAt: '2026-07-20T13:00:00.000Z',
  publicSlug: 'barberia-central',
  publicReference: 'pb_ABCDEFGHJKLMNPQRST2',
};

describe('buildAppointmentNotificationEmail', () => {
  it('renders a Spanish booking confirmation with escaped HTML and a cancellation link', () => {
    const email = buildAppointmentNotificationEmail({
      type: 'BOOKING_CONFIRMATION',
      channel: 'EMAIL',
      idempotencyKey: 'appointment:appt_1:BOOKING_CONFIRMATION:EMAIL',
      recipientEmail: 'cliente@example.com',
      payload: basePayload,
      publicWebBaseUrl: 'http://localhost:3001',
    });

    expect(email.subject).toBe('Turno confirmado en Barbería Central');
    expect(email.text).toContain('Referencia de reserva: pb_ABCDEFGHJKLMNPQRST2');
    expect(email.text).toContain('20 de julio de 2026');
    expect(email.text).toContain('10:00');
    expect(email.text).toContain('http://localhost:3001/barberias/barberia-central/confirmacion?ref=pb_ABCDEFGHJKLMNPQRST2');
    expect(email.html).toContain('Mateo &lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.messageId).toMatch(/^<appointment-notification-[a-f0-9]{32}@barberapp\.local>$/);
    expect(email.messageId).not.toContain('appt_1');
  });

  it('renders a Spanish 24-hour reminder without leaking internal identifiers', () => {
    const email = buildAppointmentNotificationEmail({
      type: 'REMINDER_24H',
      channel: 'EMAIL',
      idempotencyKey: 'appointment:appt_1:REMINDER_24H:EMAIL:2026-07-19T13:00:00.000Z',
      recipientEmail: 'cliente@example.com',
      payload: {
        ...basePayload,
        publicReference: null,
        publicSlug: null,
      },
    });

    expect(email.subject).toBe('Recordatorio de tu turno en Barbería Central');
    expect(email.text).toContain('Te recordamos que tu turno es mañana');
    expect(email.text).toContain('Corte clásico');
    expect(email.html).not.toContain('appt_1');
    expect(email.html).not.toContain('clerk');
    expect(email.messageId).not.toContain('appt_1');
  });

  it('renders a Spanish reschedule confirmation with previous and new schedule copy', () => {
    const email = buildAppointmentNotificationEmail({
      type: 'APPOINTMENT_RESCHEDULED',
      channel: 'EMAIL',
      idempotencyKey: 'appointment:appt_1:APPOINTMENT_RESCHEDULED:EMAIL:change_1',
      recipientEmail: 'cliente@example.com',
      payload: {
        ...basePayload,
        serviceName: 'Corte premium',
        employeeName: 'María',
        startAt: '2026-07-22T16:00:00.000Z',
        previousStartAt: '2026-07-20T13:00:00.000Z',
        previousEndAt: '2026-07-20T13:30:00.000Z',
        previousServiceName: 'Corte clásico',
        previousEmployeeName: 'Carlos',
      },
      publicWebBaseUrl: 'http://localhost:3001',
    });

    expect(email.subject).toBe('Tu turno fue reprogramado en Barbería Central');
    expect(email.text).toContain('Horario anterior');
    expect(email.text).toContain('Nuevo servicio: Corte premium');
    expect(email.text).toContain('Nuevo barbero: María');
    expect(email.html).toContain('Nuevo horario');
    expect(email.html).toContain('Cancelar turno');
    expect(email.messageId).not.toContain('change_1');
  });
});
