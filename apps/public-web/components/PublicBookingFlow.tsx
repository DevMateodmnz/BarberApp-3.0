'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PublicBookingFlow.module.css';
import {
  BrowserApiError,
  loadAvailabilityForSelection,
  loadBarbersForService,
  submitPublicBooking,
} from '@/lib/api/browser';
import {
  clearPendingBookingAttempt,
  readPendingBookingAttempt,
  savePendingBookingAttempt,
} from '@/lib/bookingAttemptStorage';
import { saveBookingConfirmation } from '@/lib/bookingConfirmationStorage';
import type {
  PublicAvailability,
  PublicBarber,
  PublicBookingConfig,
  PublicBookingConfirmation,
  PublicCreateAppointmentPayload,
  PublicService,
  PublicShop,
} from '@/lib/api/types';

interface PublicBookingFlowProps {
  shop: PublicShop;
  services: PublicService[];
  bookingConfig: PublicBookingConfig;
  loadBarbers?: (serviceId: string) => Promise<PublicBarber[]>;
  loadAvailability?: (input: {
    barberId: string;
    localDate: string;
    serviceId: string;
  }) => Promise<PublicAvailability>;
  submitBooking?: (input: {
    idempotencyKey: string;
    payload: PublicCreateAppointmentPayload;
  }) => Promise<PublicBookingConfirmation>;
  onBookingConfirmed?: (confirmation: PublicBookingConfirmation) => void;
}

function formatPrice(priceCents: number | null | undefined, currency: string) {
  if (priceCents === null || priceCents === undefined) {
    return '—';
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

function formatLocalDateLabel(localDate: string, timezone: string) {
  const middayUtc = new Date(`${localDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    dateStyle: 'long',
  }).format(middayUtc);
}

function mapBrowserError(error: unknown) {
  if (error instanceof BrowserApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Ocurrió un error inesperado.';
}

function isValidE164Phone(value: string) {
  return /^\+[1-9]\d{7,15}$/.test(value.trim());
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

export function PublicBookingFlow({
  shop,
  services,
  bookingConfig,
  loadBarbers = (serviceId) => loadBarbersForService(shop.slug, serviceId),
  loadAvailability = (input) =>
    loadAvailabilityForSelection({
      slug: shop.slug,
      serviceId: input.serviceId,
      barberId: input.barberId,
      localDate: input.localDate,
    }),
  submitBooking = (input) =>
    submitPublicBooking({
      slug: shop.slug,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
    }),
  onBookingConfirmed,
}: PublicBookingFlowProps) {
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedBarberId, setSelectedBarberId] = useState('');
  const [localDate, setLocalDate] = useState('');
  const [barbers, setBarbers] = useState<PublicBarber[]>([]);
  const [barberMessage, setBarberMessage] = useState('');
  const [availability, setAvailability] = useState<PublicAvailability | null>(null);
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitMessageRef = useRef<HTMLParagraphElement | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.serviceId === selectedServiceId) ?? null,
    [selectedServiceId, services]
  );

  const selectedBarber = useMemo(
    () => barbers.find((barber) => barber.barberId === selectedBarberId) ?? null,
    [barbers, selectedBarberId]
  );

  const selectedSlot = useMemo(
    () => availability?.slots.find((slot) => slot.startAt === selectedSlotStartAt) ?? null,
    [availability, selectedSlotStartAt]
  );

  const shouldShowBookingForm = Boolean(
    selectedService &&
      selectedBarber &&
      (selectedSlot ||
        submitMessage ||
        clientName ||
        clientPhone ||
        clientEmail ||
        notes ||
        consentAccepted)
  );

  const handleBookingConfirmed =
    onBookingConfirmed ??
    ((confirmation: PublicBookingConfirmation) => {
      clearPendingBookingAttempt(shop.slug);
      saveBookingConfirmation(shop.slug, confirmation);

      if (confirmation.checkoutUrl && confirmation.appointmentStatus === 'PENDING') {
        window.location.assign(confirmation.checkoutUrl);
        return;
      }

      window.location.assign(`/barberias/${shop.slug}/confirmacion?ref=${encodeURIComponent(confirmation.bookingReference)}`);
    });

  useEffect(() => {
    if (submitMessage) {
      submitMessageRef.current?.focus();
    }
  }, [submitMessage]);

  function clearAttemptState() {
    clearPendingBookingAttempt(shop.slug);
    setSubmitMessage('');
  }

  function buildBookingPayload(): PublicCreateAppointmentPayload | null {
    if (!selectedService || !selectedBarber || !selectedSlot) {
      return null;
    }

    const normalizedClientName = clientName.trim();
    if (!normalizedClientName) {
      setSubmitMessage('Ingresá tu nombre y apellido para continuar.');
      return null;
    }

    const normalizedClientPhone = clientPhone.trim();
    if (!normalizedClientPhone) {
      setSubmitMessage('Ingresá un teléfono en formato internacional.');
      return null;
    }

    if (!isValidE164Phone(normalizedClientPhone)) {
      setSubmitMessage(
        'Usá un teléfono válido con formato internacional, por ejemplo +543811234567.'
      );
      return null;
    }

    if (!consentAccepted) {
      setSubmitMessage('Tenés que aceptar el consentimiento para reservar.');
      return null;
    }

    const normalizedClientEmail = clientEmail.trim();
    if (normalizedClientEmail && !isValidEmail(normalizedClientEmail)) {
      setSubmitMessage('Ingresá un email válido o dejá el campo vacío.');
      return null;
    }

    return {
      serviceId: selectedService.serviceId,
      barberId: selectedBarber.barberId,
      startAt: selectedSlot.startAt,
      clientName: normalizedClientName,
      clientPhone: normalizedClientPhone,
      ...(normalizedClientEmail ? { clientEmail: normalizedClientEmail } : {}),
      notes: notes.trim() ? notes.trim() : undefined,
      consentAccepted: true,
      consentVersion: bookingConfig.consent.version,
    };
  }

  async function handleServiceChange(serviceId: string) {
    clearAttemptState();
    setSelectedServiceId(serviceId);
    setSelectedBarberId('');
    setLocalDate('');
    setAvailability(null);
    setSelectedSlotStartAt('');
    setAvailabilityMessage('');
    setBarberMessage('');
    setIsLoadingBarbers(true);

    try {
      const result = await loadBarbers(serviceId);
      setBarbers(result);
      if (result.length === 0) {
        setBarberMessage('No hay barberos disponibles para este servicio.');
      }
    } catch (error) {
      setBarbers([]);
      setBarberMessage(mapBrowserError(error));
    } finally {
      setIsLoadingBarbers(false);
    }
  }

  async function handleAvailabilityLookup() {
    if (!selectedServiceId || !selectedBarberId || !localDate) {
      return;
    }

    setAvailability(null);
    setSelectedSlotStartAt('');
    setAvailabilityMessage('');
    setIsLoadingAvailability(true);

    try {
      const result = await loadAvailability({
        serviceId: selectedServiceId,
        barberId: selectedBarberId,
        localDate,
      });
      setAvailability(result);

      if (result.slots.length === 0) {
        setAvailabilityMessage('No quedan horarios disponibles para esa fecha.');
      }
    } catch (error) {
      setAvailabilityMessage(mapBrowserError(error));
    } finally {
      setIsLoadingAvailability(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildBookingPayload();
    if (!payload) {
      return;
    }

    setSubmitMessage('');
    setIsSubmitting(true);

    try {
      const persistedAttempt = readPendingBookingAttempt(shop.slug);
      const currentFingerprint = JSON.stringify(payload);
      const idempotencyKey =
        persistedAttempt && JSON.stringify(persistedAttempt.payload) === currentFingerprint
          ? persistedAttempt.idempotencyKey
          : globalThis.crypto?.randomUUID?.() ??
            `booking_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const pendingAttempt = { idempotencyKey, payload };
      savePendingBookingAttempt(shop.slug, pendingAttempt);

      const confirmation = await submitBooking({
        idempotencyKey: pendingAttempt.idempotencyKey,
        payload: pendingAttempt.payload,
      });

      handleBookingConfirmed(confirmation);
    } catch (error) {
      if (
        error instanceof BrowserApiError &&
        error.code === 'PUBLIC_BOOKING_SLOT_UNAVAILABLE'
      ) {
        setSubmitMessage(
          'Ese horario ya no está disponible. Elegí otro turno para continuar.'
        );
        setSelectedSlotStartAt('');
        await handleAvailabilityLookup();
      } else if (
        error instanceof BrowserApiError &&
        error.code === 'PUBLIC_BOOKING_WRITE_RATE_LIMITED'
      ) {
        setSubmitMessage(
          'Llegaste al límite de intentos. Esperá unos minutos antes de volver a reservar.'
        );
      } else if (error instanceof BrowserApiError && error.status) {
        setSubmitMessage(mapBrowserError(error));
      } else {
        setSubmitMessage(
          'No pudimos confirmar el estado de la reserva. Reintentá con el mismo formulario para validar el mismo turno.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.headerBlock}>
          <p className={styles.eyebrow}>Reservá tu turno</p>
          <h1 className={styles.title}>{shop.name}</h1>
          <p className={styles.subtitle}>
            Elegí servicio, profesional y horario. La agenda respeta la disponibilidad real de la barbería.
          </p>
        </div>

        <div className={styles.section}>
          <label className={styles.label} htmlFor="service-select">
            Servicio
          </label>
          <select
            id="service-select"
            className={styles.select}
            value={selectedServiceId}
            onChange={(event) => void handleServiceChange(event.target.value)}
          >
            <option value="">Seleccioná un servicio</option>
            {services.map((service) => (
              <option key={service.serviceId} value={service.serviceId}>
                {service.name} · {formatPrice(service.priceCents, service.currency)}
              </option>
            ))}
          </select>
        </div>

        {selectedService ? (
          <div className={styles.infoPanel}>
            <p className={styles.infoTitle}>{selectedService.name}</p>
            <p className={styles.infoBody}>
              Duración estimada: {selectedService.durationMinutes} minutos.
            </p>
            {selectedService.depositRequired ? (
              <div className={styles.depositPanel}>
                <p className={styles.infoTitle}>Seña para confirmar el turno</p>
                <p className={styles.infoBody}>
                  Total del servicio: {formatPrice(selectedService.priceCents, selectedService.currency)}.
                </p>
                <p className={styles.infoBody}>
                  Seña requerida: {formatPrice(selectedService.depositAmountCents, selectedService.currency)}.
                </p>
                <p className={styles.infoBody}>
                  Saldo en barbería: {formatPrice(selectedService.remainingAmountCents, selectedService.currency)}.
                </p>
                <p className={styles.infoBody}>
                  El horario quedará reservado durante {bookingConfig.depositPolicy?.holdDurationMinutes ?? 15} minutos mientras realizás el pago.
                </p>
                <p className={styles.infoBody}>
                  Tu turno se confirmará cuando Mercado Pago apruebe la operación.
                </p>
                {bookingConfig.depositPolicy?.publicTerms ? (
                  <p className={styles.infoBody}>{bookingConfig.depositPolicy.publicTerms}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedServiceId ? (
          <div className={styles.section}>
            <label className={styles.label} htmlFor="barber-select">
              Profesional
            </label>
            <select
              id="barber-select"
              className={styles.select}
              value={selectedBarberId}
              onChange={(event) => {
                clearAttemptState();
                setSelectedBarberId(event.target.value);
                setLocalDate('');
                setAvailability(null);
                setSelectedSlotStartAt('');
                setAvailabilityMessage('');
              }}
              disabled={isLoadingBarbers || barbers.length === 0}
            >
              <option value="">Seleccioná un profesional</option>
              {barbers.map((barber) => (
                <option key={barber.barberId} value={barber.barberId}>
                  {barber.displayName}
                </option>
              ))}
            </select>
            {barberMessage ? <p className={styles.message}>{barberMessage}</p> : null}
          </div>
        ) : null}

        {selectedBarber ? (
          <div className={styles.section}>
            <label className={styles.label} htmlFor="date-select">
              Fecha
            </label>
            <input
              id="date-select"
              className={styles.input}
              type="date"
              value={localDate}
              onChange={(event) => {
                clearAttemptState();
                setLocalDate(event.target.value);
                setAvailability(null);
                setSelectedSlotStartAt('');
                setAvailabilityMessage('');
              }}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleAvailabilityLookup()}
              disabled={!localDate || isLoadingAvailability}
            >
              {isLoadingAvailability ? 'Buscando horarios…' : 'Ver horarios disponibles'}
            </button>
            {availabilityMessage ? <p className={styles.message}>{availabilityMessage}</p> : null}
          </div>
        ) : null}

        {availability && availability.slots.length > 0 ? (
          <div className={styles.section}>
            <p className={styles.label}>
              Horarios para {formatLocalDateLabel(availability.localDate, availability.timezone)}
            </p>
            <div className={styles.slotGrid}>
              {availability.slots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  className={slot.startAt === selectedSlotStartAt ? styles.slotButtonActive : styles.slotButton}
                  onClick={() => {
                    clearAttemptState();
                    setSelectedSlotStartAt(slot.startAt);
                  }}
                >
                  {new Intl.DateTimeFormat('es-AR', {
                    timeZone: availability.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }).format(new Date(slot.startAt))}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {shouldShowBookingForm ? (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label} htmlFor="client-name">Nombre y apellido</label>
            <input id="client-name" className={styles.input} value={clientName} onChange={(event) => setClientName(event.target.value)} />

            <label className={styles.label} htmlFor="client-phone">Teléfono</label>
            <input id="client-phone" className={styles.input} value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} placeholder="+543811234567" />

            <label className={styles.label} htmlFor="client-email">Email (opcional)</label>
            <input id="client-email" className={styles.input} value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />

            <label className={styles.label} htmlFor="client-notes">Notas (opcional)</label>
            <textarea id="client-notes" className={styles.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />

            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
              <span>{bookingConfig.consent.text}</span>
            </label>

            {submitMessage ? (
              <p ref={submitMessageRef} className={styles.message} tabIndex={-1}>
                {submitMessage}
              </p>
            ) : null}

            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? 'Procesando…' : selectedService?.depositRequired ? 'Reservar y pagar seña' : 'Confirmar turno'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
