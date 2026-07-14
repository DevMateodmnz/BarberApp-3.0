'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type {
  PublicBookingConfirmation,
  PublicCancelBookingResult,
} from '@/lib/api/types';
import { BookingPageNotice } from '@/components/BookingPageNotice';
import { readBookingConfirmation } from '@/lib/bookingConfirmationStorage';

type CancelState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'submitting' }
  | { kind: 'success'; result: PublicCancelBookingResult }
  | { kind: 'error'; message: string };

function formatDate(confirmation: PublicBookingConfirmation) {
  const middayUtc = new Date(`${confirmation.localDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: confirmation.timezone,
    dateStyle: 'long',
  }).format(middayUtc);
}

export function PublicBookingConfirmationView({ slug }: { slug: string }) {
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(
    null
  );
  const [cancelState, setCancelState] = useState<CancelState>({ kind: 'idle' });
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    setConfirmation(readBookingConfirmation(slug));
  }, [slug]);

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
        title="No encontramos la confirmación en este navegador"
        message="Si ya reservaste, contactá a la barbería para validar tu turno con tu nombre y teléfono."
      />
    );
  }

  if (cancelState.kind === 'success') {
    return (
      <section
        aria-labelledby="booking-cancelled-title"
        style={{
          width: '100%',
          maxWidth: '42rem',
          padding: '1.5rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '1.5rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <p style={{ marginTop: 0, color: 'var(--success)', fontWeight: 700 }}>
          Tu reserva fue cancelada
        </p>
        <h1 id="booking-cancelled-title" style={{ marginTop: 0 }}>
          {confirmation.barbershopName}
        </h1>
        <p>
          La referencia <strong>{cancelState.result.publicReference}</strong> ya
          no tiene un turno reservado.
        </p>
        {cancelState.result.cancelReason ? (
          <p>
            <strong>Motivo registrado:</strong> {cancelState.result.cancelReason}
          </p>
        ) : null}
        <p>
          Si querés volver a reservar, volvé a la página de la barbería.
        </p>
      </section>
    );
  }

  const isSubmitting = cancelState.kind === 'submitting';
  const isConfirming = cancelState.kind === 'confirming';
  const isAlreadyTerminal = confirmation.status !== 'CONFIRMED';
  const cancelErrorMessage =
    cancelState.kind === 'error' ? cancelState.message : null;

  return (
    <section
      aria-labelledby="booking-confirmation-title"
      style={{
        width: '100%',
        maxWidth: '42rem',
        padding: '1.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '1.5rem',
        boxShadow: 'var(--shadow)',
      }}
    >
      <p style={{ marginTop: 0, color: 'var(--success)', fontWeight: 700 }}>
        ¡Reserva confirmada!
      </p>
      <h1 id="booking-confirmation-title" style={{ marginTop: 0 }}>
        {confirmation.barbershopName}
      </h1>
      <dl
        style={{
          display: 'grid',
          gap: '0.75rem',
          margin: 0,
        }}
      >
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
          <dt style={{ fontWeight: 700 }}>Teléfono</dt>
          <dd style={{ margin: 0 }}>{confirmation.clientPhoneDisplay}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Estado</dt>
          <dd style={{ margin: 0 }}>{confirmation.status}</dd>
        </div>
      </dl>

      {isAlreadyTerminal ? null : (
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          {isConfirming ? (
            <div role="dialog" aria-labelledby="cancel-confirm-title">
              <p
                id="cancel-confirm-title"
                style={{ margin: 0, fontWeight: 700 }}
              >
                ¿Querés cancelar tu reserva?
              </p>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                Si no podés asistir, avisanos para liberar el horario. Es
                opcional dejarnos un motivo.
              </p>
              <label
                htmlFor="cancel-reason"
                style={{ display: 'block', marginTop: '0.75rem' }}
              >
                Motivo (opcional)
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={500}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              {cancelErrorMessage ? (
                <p
                  role="alert"
                  style={{ color: 'var(--error)', margin: '0.5rem 0 0' }}
                >
                  {cancelErrorMessage}
                </p>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => void submitCancel()}
                  disabled={isSubmitting}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: 'var(--error)',
                    color: 'var(--text-inverse)',
                    cursor: isSubmitting ? 'wait' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Cancelando…' : 'Sí, cancelar reserva'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCancelState({ kind: 'idle' });
                    setCancelReason('');
                  }}
                  disabled={isSubmitting}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: isSubmitting ? 'wait' : 'pointer',
                  }}
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="public-cancel-open"
              onClick={() => setCancelState({ kind: 'confirming' })}
              style={{
                alignSelf: 'start',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              Cancelar mi reserva
            </button>
          )}
        </div>
      )}
    </section>
  );
}
