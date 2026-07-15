import crypto from 'node:crypto';

import type { AppointmentNotificationChannel, AppointmentNotificationType } from '@prisma/client';
import type { EmailMessage } from './emailTransport.js';

export interface AppointmentNotificationPayload {
  customerName: string;
  barbershopName: string;
  serviceName: string;
  employeeName: string;
  timezone: string;
  startAt: string;
  publicSlug: string | null;
  publicReference: string | null;
  previousStartAt?: string;
  previousEndAt?: string;
  previousServiceName?: string;
  previousEmployeeName?: string;
}

export interface AppointmentNotificationEmailInput {
  type: AppointmentNotificationType;
  channel: AppointmentNotificationChannel;
  idempotencyKey: string;
  recipientEmail: string;
  payload: AppointmentNotificationPayload;
  publicWebBaseUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLocalDate(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    dateStyle: 'long',
  }).format(new Date(isoString));
}

function formatLocalTime(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

function buildPublicCancellationUrl(
  baseUrl: string | undefined,
  payload: AppointmentNotificationPayload
): string | null {
  const trimmedBaseUrl = baseUrl?.trim();
  if (!trimmedBaseUrl || !payload.publicSlug || !payload.publicReference) {
    return null;
  }

  const normalizedBase = trimmedBaseUrl.endsWith('/')
    ? trimmedBaseUrl.slice(0, -1)
    : trimmedBaseUrl;

  return `${normalizedBase}/barberias/${encodeURIComponent(payload.publicSlug)}/confirmacion?ref=${encodeURIComponent(payload.publicReference)}`;
}

function buildFooter(payload: AppointmentNotificationPayload): { text: string; html: string } {
  return {
    text: `Zona horaria: ${payload.timezone}`,
    html: `<p><strong>Zona horaria:</strong> ${escapeHtml(payload.timezone)}</p>`,
  };
}

function buildDeterministicMessageId(idempotencyKey: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(idempotencyKey)
    .digest('hex')
    .slice(0, 32);

  return `<appointment-notification-${digest}@barberapp.local>`;
}

function buildConfirmationCopy(
  payload: AppointmentNotificationPayload,
  publicCancellationUrl: string | null
): { subject: string; text: string; html: string } {
  const localDate = formatLocalDate(payload.startAt, payload.timezone);
  const localTime = formatLocalTime(payload.startAt, payload.timezone);
  const referenceLine = payload.publicReference
    ? `Referencia de reserva: ${payload.publicReference}`
    : null;
  const cancellationLine = publicCancellationUrl
    ? `Si necesitás cancelar, hacelo desde este enlace: ${publicCancellationUrl}`
    : 'Si necesitás cancelar o reprogramar, comunicate con la barbería cuanto antes.';
  const footer = buildFooter(payload);

  return {
    subject: `Turno confirmado en ${payload.barbershopName}`,
    text: [
      `Hola ${payload.customerName},`,
      '',
      `Tu turno en ${payload.barbershopName} quedó confirmado.`,
      `Servicio: ${payload.serviceName}`,
      `Barbero: ${payload.employeeName}`,
      `Fecha: ${localDate}`,
      `Hora: ${localTime}`,
      referenceLine,
      cancellationLine,
      footer.text,
    ]
      .filter(Boolean)
      .join('\n'),
    html: [
      `<p>Hola ${escapeHtml(payload.customerName)},</p>`,
      `<p>Tu turno en <strong>${escapeHtml(payload.barbershopName)}</strong> quedó confirmado.</p>`,
      '<ul>',
      `<li><strong>Servicio:</strong> ${escapeHtml(payload.serviceName)}</li>`,
      `<li><strong>Barbero:</strong> ${escapeHtml(payload.employeeName)}</li>`,
      `<li><strong>Fecha:</strong> ${escapeHtml(localDate)}</li>`,
      `<li><strong>Hora:</strong> ${escapeHtml(localTime)}</li>`,
      payload.publicReference
        ? `<li><strong>Referencia de reserva:</strong> ${escapeHtml(payload.publicReference)}</li>`
        : '',
      '</ul>',
      publicCancellationUrl
        ? `<p>Si necesitás cancelar, podés hacerlo acá: <a href="${escapeHtml(publicCancellationUrl)}">Cancelar turno</a></p>`
        : '<p>Si necesitás cancelar o reprogramar, comunicate con la barbería cuanto antes.</p>',
      footer.html,
    ]
      .filter(Boolean)
      .join(''),
  };
}

function buildReminderCopy(
  payload: AppointmentNotificationPayload,
  publicCancellationUrl: string | null
): { subject: string; text: string; html: string } {
  const localDate = formatLocalDate(payload.startAt, payload.timezone);
  const localTime = formatLocalTime(payload.startAt, payload.timezone);
  const footer = buildFooter(payload);

  return {
    subject: `Recordatorio de tu turno en ${payload.barbershopName}`,
    text: [
      `Hola ${payload.customerName},`,
      '',
      `Te recordamos que tu turno es mañana en ${payload.barbershopName}.`,
      `Servicio: ${payload.serviceName}`,
      `Barbero: ${payload.employeeName}`,
      `Fecha: ${localDate}`,
      `Hora: ${localTime}`,
      publicCancellationUrl
        ? `Si necesitás cancelar, usá este enlace: ${publicCancellationUrl}`
        : 'Si necesitás cancelar o reprogramar, comunicate con la barbería cuanto antes.',
      footer.text,
    ].join('\n'),
    html: [
      `<p>Hola ${escapeHtml(payload.customerName)},</p>`,
      `<p>Te recordamos que tu turno es mañana en <strong>${escapeHtml(payload.barbershopName)}</strong>.</p>`,
      '<ul>',
      `<li><strong>Servicio:</strong> ${escapeHtml(payload.serviceName)}</li>`,
      `<li><strong>Barbero:</strong> ${escapeHtml(payload.employeeName)}</li>`,
      `<li><strong>Fecha:</strong> ${escapeHtml(localDate)}</li>`,
      `<li><strong>Hora:</strong> ${escapeHtml(localTime)}</li>`,
      '</ul>',
      publicCancellationUrl
        ? `<p>Si necesitás cancelar, podés hacerlo acá: <a href="${escapeHtml(publicCancellationUrl)}">Cancelar turno</a></p>`
        : '<p>Si necesitás cancelar o reprogramar, comunicate con la barbería cuanto antes.</p>',
      footer.html,
    ].join(''),
  };
}

function buildRescheduledCopy(
  payload: AppointmentNotificationPayload,
  publicCancellationUrl: string | null
): { subject: string; text: string; html: string } {
  const localDate = formatLocalDate(payload.startAt, payload.timezone);
  const localTime = formatLocalTime(payload.startAt, payload.timezone);
  const previousDate = payload.previousStartAt
    ? formatLocalDate(payload.previousStartAt, payload.timezone)
    : null;
  const previousTime = payload.previousStartAt
    ? formatLocalTime(payload.previousStartAt, payload.timezone)
    : null;
  const footer = buildFooter(payload);

  return {
    subject: `Tu turno fue reprogramado en ${payload.barbershopName}`,
    text: [
      `Hola ${payload.customerName},`,
      '',
      `Tu turno en ${payload.barbershopName} cambió de horario.`,
      previousDate && previousTime
        ? `Horario anterior: ${previousDate} a las ${previousTime}`
        : null,
      `Nuevo servicio: ${payload.serviceName}`,
      `Nuevo barbero: ${payload.employeeName}`,
      `Nueva fecha: ${localDate}`,
      `Nuevo horario: ${localTime}`,
      publicCancellationUrl
        ? `Si necesitás cancelar, usá este enlace: ${publicCancellationUrl}`
        : 'Si necesitás cancelar, comunicate con la barbería cuanto antes.',
      footer.text,
    ]
      .filter(Boolean)
      .join('\n'),
    html: [
      `<p>Hola ${escapeHtml(payload.customerName)},</p>`,
      `<p>Tu turno en <strong>${escapeHtml(payload.barbershopName)}</strong> cambió de horario.</p>`,
      '<ul>',
      previousDate && previousTime
        ? `<li><strong>Horario anterior:</strong> ${escapeHtml(previousDate)} a las ${escapeHtml(previousTime)}</li>`
        : '',
      `<li><strong>Nuevo servicio:</strong> ${escapeHtml(payload.serviceName)}</li>`,
      `<li><strong>Nuevo barbero:</strong> ${escapeHtml(payload.employeeName)}</li>`,
      `<li><strong>Nueva fecha:</strong> ${escapeHtml(localDate)}</li>`,
      `<li><strong>Nuevo horario:</strong> ${escapeHtml(localTime)}</li>`,
      '</ul>',
      publicCancellationUrl
        ? `<p>Si necesitás cancelar, podés hacerlo acá: <a href="${escapeHtml(publicCancellationUrl)}">Cancelar turno</a></p>`
        : '<p>Si necesitás cancelar, comunicate con la barbería cuanto antes.</p>',
      footer.html,
    ]
      .filter(Boolean)
      .join(''),
  };
}

export function buildAppointmentNotificationEmail(
  input: AppointmentNotificationEmailInput
): EmailMessage {
  if (input.channel !== 'EMAIL') {
    throw new Error(`Unsupported appointment notification channel: ${input.channel}`);
  }

  const publicCancellationUrl = buildPublicCancellationUrl(
    input.publicWebBaseUrl,
    input.payload
  );
  const copy = input.type === 'BOOKING_CONFIRMATION'
    ? buildConfirmationCopy(input.payload, publicCancellationUrl)
    : input.type === 'REMINDER_24H'
      ? buildReminderCopy(input.payload, publicCancellationUrl)
      : buildRescheduledCopy(input.payload, publicCancellationUrl);

  return {
    to: input.recipientEmail,
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
    messageId: buildDeterministicMessageId(input.idempotencyKey),
  };
}
