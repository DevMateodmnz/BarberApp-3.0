'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type {
  PublicBookingConfirmation,
  PublicCancelBookingResult,
  PublicPaymentStatus,
} from '@/lib/api/types';
import { BookingPageNotice } from '@/components/BookingPageNotice';
import {
  readBookingConfirmation,
  saveBookingConfirmation,
} from '@/lib/bookingConfirmationStorage';
import { loadPublicPaymentStatus } from '@/lib/api/browser';

function formatDate(confirmation: PublicBookingConfirmation) {
  const middayUtc = new Date(`${confirmation.localDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: confirmation.timezone,
    dateStyle: 'long',
  }).format(middayUtc);
}

function formatMoney(valueCents: number | null | undefined, currency: string) {
  if (valueCents === null || valueCents === undefined) {
    return '—';
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function resolveHeadline(confirmation: PublicBookingConfirmation) {
  const appointmentStatus = confirmation.appointmentStatus ?? confirmation.status;
  const paymentStatus = confirmation.paymentStatus ?? (appointmentStatus === 'CONFIRMED' ? 'APPROVED' : 'NOT_REQUIRED');

  if (appointmentStatus === 'CONFIRMED' && paymentStatus === 'APPROVED') {
    return {
      eyebrow: '¡Turno confirmado!',
      statusLabel: 'Turno confirmado',
      accent: 'var(--success)',
    };
  }

  if (appointmentStatus === 'PENDING') {
    return {
      eyebrow: 'Esperando pago',
      statusLabel: 'Esperando pago',
      accent: 'var(--warning, #d97706)',
    };
  }

  if (paymentStatus === 'REVIEW_REQUIRED') {
    return {
      eyebrow: 'Se requiere revisión',
      statusLabel: 'Revisión de pago necesaria',
      accent: 'var(--warning, #d97706)',
    };
  }

  if (paymentStatus === 'REJECTED') {
    return {
      eyebrow: 'Pago rechazado',
      statusLabel: 'Pago rechazado',
      accent: 'var(--error)',
    };
  }

  if (paymentStatus === 'EXPIRED' || appointmentStatus === 'CANCELLED') {
    return {
      eyebrow: 'Reserva vencida',
      statusLabel: 'Reserva vencida',
      accent: 'var(--error)',
    };
  }

  return {
    eyebrow: 'Estado de la reserva',
      statusLabel: paymentStatus,
      accent: 'var(--text-primary)',
    };
  }

type CancelState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'submitting' }
  | { kind: 'success'; result: PublicCancelBookingResult }
  | { kind: 'error'; message: string };

export function PublicBookingConfirmationView({
  slug,
  referenceFromQuery,
}: {
  slug: string;
  referenceFromQuery?: string;
}) {
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(null);
  const [status, setStatus] = useState<PublicPaymentStatus | null>(null);
  const [cancelState, setCancelState] = useState<CancelState>({ kind: 'idle' });
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    const stored = readBookingConfirmation(slug);
    setConfirmation(stored);

    const reference = referenceFromQuery?.trim() || stored?.bookingReference;
    if (!reference) {
      return () => {
        cancelled = true;
      };
    }

    void fetch(
      `/api/public-booking/shops/${encodeURIComponent(slug)}/appointments/${encodeURIComponent(reference)}`
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          success: boolean;
          data?: PublicBookingConfirmation;
        };

        if (!response.ok || !body.success || !body.data || cancelled) {
          return;
        }

        saveBookingConfirmation(slug, body.data);
        setConfirmation(body.data);
      })
      .catch(() => {
        // Keep the stored browser copy when the latest state cannot be fetched.
      });

    void loadPublicPaymentStatus({ slug, reference })
      .then((nextStatus) => {
        if (!cancelled) {
          setStatus(nextStatus);
        }
      })
      .catch(() => {
        // Best-effort status refresh only.
      });

    return () => {
      cancelled = true;
    };
  }, [referenceFromQuery, slug]);

  const submitCancel = useCallback(async () => {
    if (!confirmation) {
      return;
    }
    setCancelState({ kind: 'submitting' });
    try {
      const response = await fetch(
        `/api/public-booking/shops/${encodeURIComponent(slug)}/appointments/${encodeURIComponent(confirmation.bookingReference)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            cancelReason.trim() ? { reason: cancelReason.trim() } : {}
          ),
        }
      );
      const body = (await response.json()) as {
        success: boolean;
        data?: PublicCancelBookingResult;
        error?: { code: string; message: string };
      };

      if (!response.ok || !body.success || !body.data) {
        setCancelState({
          kind: 'error',
          message: body.error?.message ?? 'No pudimos cancelar la reserva.',
        });
        return;
      }

      setCancelState({ kind: 'success', result: body.data });
    } catch (error) {
      setCancelState({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No pudimos cancelar la reserva.',
      });
    }
  }, [confirmation, slug, cancelReason]);

  if (!confirmation) {
    return (
      <BookingPageNotice
        title="No encontramos la reserva en este navegador"
        message="Si ya reservaste, contactá a la barbería para validar el estado con tu nombre y teléfono."
      />
    );
  }

  if (cancelState.kind === 'success') {
    return (
      <section aria-labelledby="booking-cancelled-title" style={cardStyle}>
        <p style={{ marginTop: 0, color: 'var(--success)', fontWeight: 700 }}>
          La reserva fue cancelada
        </p>
        <h1 id="booking-cancelled-title" style={{ marginTop: 0 }}>
          {confirmation.barbershopName}
        </h1>
        <p>
          La referencia <strong>{cancelState.result.publicReference}</strong> ya no
          tiene un turno reservado.
        </p>
        {cancelState.result.refundReviewRequired ? (
          <p>
            La cancelación no procesa automáticamente la devolución de la seña.
            La barbería revisará el pago y se comunicará contigo.
          </p>
        ) : null}
        {cancelState.result.cancelReason ? (
          <p>
            <strong>Motivo registrado:</strong> {cancelState.result.cancelReason}
          </p>
        ) : null}
      </section>
    );
  }

  const headline = resolveHeadline(confirmation);
  const isSubmitting = cancelState.kind === 'submitting';
  const isConfirming = cancelState.kind === 'confirming';
  const cancelErrorMessage =
    cancelState.kind === 'error' ? cancelState.message : null;
  const canCancel = status?.canCancel ?? confirmation.canCancel;
  const canRetry = status?.canRetry ?? confirmation.canRetry;

  return (
    <section aria-labelledby="booking-confirmation-title" style={cardStyle}>
      <p style={{ marginTop: 0, color: headline.accent, fontWeight: 700 }}>
        {headline.eyebrow}
      </p>
      <h1 id="booking-confirmation-title" style={{ marginTop: 0 }}>
        {confirmation.barbershopName}
      </h1>
      <dl style={{ display: 'grid', gap: '0.75rem', margin: 0 }}>
        <div>
          <dt style={{ fontWeight: 700 }}>Referencia</dt>
          <dd style={{ margin: 0 }}>{confirmation.bookingReference}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Servicio</dt>
          <dd style={{ margin: 0 }}>{confirmation.serviceName}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Barbero</dt>
          <dd style={{ margin: 0 }}>{confirmation.barberName}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Fecha y hora</dt>
          <dd style={{ margin: 0 }}>
            {formatDate(confirmation)} a las {confirmation.localStartTime}
          </dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Estado</dt>
          <dd style={{ margin: 0 }}>{headline.statusLabel}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Seña</dt>
          <dd style={{ margin: 0 }}>
            {formatMoney(confirmation.amountCents, confirmation.currency ?? 'ARS')}
          </dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Saldo en barbería</dt>
          <dd style={{ margin: 0 }}>
            {formatMoney(confirmation.remainingAmountCents, confirmation.currency ?? 'ARS')}
          </dd>
        </div>
        {confirmation.expiresAt ? (
          <div>
            <dt style={{ fontWeight: 700 }}>Vence</dt>
            <dd style={{ margin: 0 }}>
              {new Date(confirmation.expiresAt).toLocaleString('es-AR')}
            </dd>
          </div>
        ) : null}
      </dl>

      {confirmation.publicTerms ? (
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
          {confirmation.publicTerms}
        </p>
      ) : null}

      {confirmation.checkoutUrl && (confirmation.appointmentStatus ?? confirmation.status) === 'PENDING' ? (
        <div style={actionSectionStyle}>
          <a
            href={confirmation.checkoutUrl}
            style={primaryButtonStyle}
          >
            Continuar a Mercado Pago
          </a>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            El turno se confirmará cuando Mercado Pago apruebe la operación.
          </p>
        </div>
      ) : null}

      {canRetry && confirmation.checkoutUrl ? (
        <div style={actionSectionStyle}>
          <a href={confirmation.checkoutUrl} style={primaryButtonStyle}>
            Reintentar pago
          </a>
        </div>
      ) : null}

      {canCancel ? (
        <div style={actionSectionStyle}>
          {isConfirming ? (
            <div role="dialog" aria-labelledby="cancel-confirm-title">
              <p id="cancel-confirm-title" style={{ margin: 0, fontWeight: 700 }}>
                ¿Querés cancelar la reserva?
              </p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                Si la seña ya fue aprobada, la devolución no se procesa automáticamente.
                La barbería revisará el pago y se comunicará contigo.
              </p>
              <label htmlFor="cancel-reason" style={{ display: 'block', marginTop: '0.75rem' }}>
                Motivo (opcional)
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={500}
                rows={3}
                style={textareaStyle}
              />
              {cancelErrorMessage ? (
                <p role="alert" style={{ color: 'var(--error)', margin: '0.5rem 0 0' }}>
                  {cancelErrorMessage}
                </p>
              ) : null}
              <div style={buttonRowStyle}>
                <button type="button" onClick={() => void submitCancel()} disabled={isSubmitting} style={dangerButtonStyle}>
                  {isSubmitting ? 'Cancelando…' : 'Sí, cancelar reserva'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCancelState({ kind: 'idle' });
                    setCancelReason('');
                  }}
                  disabled={isSubmitting}
                  style={secondaryButtonStyle}
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCancelState({ kind: 'confirming' })}
              style={secondaryButtonStyle}
            >
              Cancelar reserva
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '42rem',
  padding: '1.5rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '1.5rem',
  boxShadow: 'var(--shadow)',
};

const actionSectionStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  paddingTop: '1.25rem',
  borderTop: '1px solid var(--border)',
  display: 'grid',
  gap: '0.75rem',
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  borderRadius: '0.75rem',
  background: 'var(--success)',
  color: 'var(--text-inverse)',
  textDecoration: 'none',
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: 'var(--error)',
  color: 'var(--text-inverse)',
  cursor: 'pointer',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'inherit',
  fontFamily: 'inherit',
  resize: 'vertical',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginTop: '0.75rem',
  flexWrap: 'wrap',
};
