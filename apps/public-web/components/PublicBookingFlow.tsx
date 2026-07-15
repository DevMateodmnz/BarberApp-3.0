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

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

function formatLocalTime(isoString: string, timezone: string) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
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
  const [availability, setAvailability] = useState<PublicAvailability | null>(
    null
  );
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
    () =>
      availability?.slots.find((slot) => slot.startAt === selectedSlotStartAt) ?? null,
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
      window.location.assign(`/barberias/${shop.slug}/confirmacion`);
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
        persistedAttempt &&
        JSON.stringify(persistedAttempt.payload) === currentFingerprint
          ? persistedAttempt.idempotencyKey
          : globalThis.crypto?.randomUUID?.() ??
            `booking_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const pendingAttempt = {
        idempotencyKey,
        payload,
      };

      savePendingBookingAttempt(shop.slug, pendingAttempt);

      const confirmation = await submitBooking({
        idempotencyKey: pendingAttempt.idempotencyKey,
        payload: pendingAttempt.payload,
      });

      clearPendingBookingAttempt(shop.slug);
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
          'No pudimos confirmar si la reserva se completó. Reintentá con el mismo formulario para validar el mismo turno.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="public-booking-title">
        <p className={styles.eyebrow}>Reserva online</p>
        <h1 id="public-booking-title" className={styles.title}>
          {shop.name}
        </h1>
        <p className={styles.subtitle}>Zona horaria: {shop.timezone}</p>
        <p className={styles.subtitle}>
          Reserva con {bookingConfig.policy.minimumNoticeMinutes} minutos de
          anticipación y hasta {bookingConfig.policy.maximumBookingHorizonDays}{' '}
          días corridos.
        </p>

        <div className={styles.stack}>
          <fieldset className={styles.section}>
            <legend className={styles.legend}>1. Elegí un servicio</legend>
            {services.length === 0 ? (
              <p className={styles.status}>
                Esta barbería todavía no publicó servicios para reservar.
              </p>
            ) : (
              <div className={styles.optionList}>
                {services.map((service) => (
                  <label key={service.serviceId} className={styles.option}>
                    <span className={styles.optionInline}>
                      <input
                        type="radio"
                        name="service"
                        value={service.serviceId}
                        checked={selectedServiceId === service.serviceId}
                        onChange={() => void handleServiceChange(service.serviceId)}
                      />
                      <span>
                        <span className={styles.optionTitle}>{service.name}</span>
                        <br />
                        <span className={styles.muted}>
                          {service.durationMinutes} min ·{' '}
                          {formatPrice(service.priceCents, service.currency)}
                        </span>
                        {service.description ? (
                          <>
                            <br />
                            <span className={styles.muted}>{service.description}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className={styles.section} disabled={!selectedServiceId}>
            <legend className={styles.legend}>2. Elegí un barbero</legend>
            {isLoadingBarbers ? (
              <p className={styles.status}>Buscando barberos disponibles…</p>
            ) : barbers.length > 0 ? (
              <div className={styles.optionList}>
                {barbers.map((barber) => (
                  <label key={barber.barberId} className={styles.option}>
                    <span className={styles.optionInline}>
                      <input
                        type="radio"
                        name="barber"
                        value={barber.barberId}
                        checked={selectedBarberId === barber.barberId}
                        onChange={() => {
                          clearAttemptState();
                          setSelectedBarberId(barber.barberId);
                          setAvailability(null);
                          setSelectedSlotStartAt('');
                          setAvailabilityMessage('');
                        }}
                      />
                      <span className={styles.optionTitle}>{barber.displayName}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className={barberMessage ? styles.error : styles.status}>
                {barberMessage || 'Primero elegí un servicio.'}
              </p>
            )}
          </fieldset>

          <section className={styles.section} aria-labelledby="date-section-title">
            <h2 id="date-section-title" className={styles.legend}>
              3. Elegí una fecha
            </h2>
            <div className={styles.controls}>
              <label className={styles.label}>
                Fecha de reserva
                <input
                  aria-label="Fecha de reserva"
                  className={styles.input}
                  type="date"
                  value={localDate}
                  onChange={(event) => {
                    clearAttemptState();
                    setLocalDate(event.currentTarget.value);
                    setAvailability(null);
                    setSelectedSlotStartAt('');
                    setAvailabilityMessage('');
                  }}
                  disabled={!selectedBarberId}
                />
              </label>
              <button
                type="button"
                className={styles.button}
                onClick={() => void handleAvailabilityLookup()}
                disabled={!selectedServiceId || !selectedBarberId || !localDate}
              >
                Ver horarios disponibles
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="slot-section-title">
            <h2 id="slot-section-title" className={styles.legend}>
              4. Elegí un horario
            </h2>
            {isLoadingAvailability ? (
              <p className={styles.status}>Buscando horarios disponibles…</p>
            ) : availability?.slots.length ? (
              <div className={styles.slotGrid}>
                {availability.slots.map((slot) => {
                  const isActive = slot.startAt === selectedSlotStartAt;
                  const className = isActive
                    ? `${styles.slotButton} ${styles.slotButtonActive}`
                    : styles.slotButton;

                  return (
                    <button
                      key={slot.startAt}
                      type="button"
                      className={className}
                      onClick={() => {
                        clearAttemptState();
                        setSelectedSlotStartAt(slot.startAt);
                      }}
                    >
                      {formatLocalTime(slot.startAt, availability.timezone)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={availabilityMessage ? styles.error : styles.status}>
                {availabilityMessage || 'Elegí servicio, barbero y fecha para ver horarios.'}
              </p>
            )}

            {selectedSlot && selectedService && selectedBarber ? (
              <p className={styles.summary}>
                Turno seleccionado: {selectedService.name} con{' '}
                {selectedBarber.displayName} el{' '}
                {formatLocalDateLabel(localDate, shop.timezone)} a las{' '}
                {formatLocalTime(selectedSlot.startAt, shop.timezone)}.
              </p>
            ) : null}
          </section>

          {shouldShowBookingForm ? (
            <section className={styles.section} aria-labelledby="form-section-title">
              <h2 id="form-section-title" className={styles.legend}>
                5. Completá tus datos
              </h2>
              <form
                className={styles.formGrid}
                noValidate
                onSubmit={(event) => void handleSubmit(event)}
              >
                <label className={styles.label}>
                  Nombre y apellido
                  <input
                    className={styles.input}
                    type="text"
                    value={clientName}
                    onChange={(event) => {
                      clearAttemptState();
                      setClientName(event.currentTarget.value);
                    }}
                    autoComplete="name"
                    required
                  />
                </label>

                <label className={styles.label}>
                  Teléfono
                  <input
                    className={styles.input}
                    type="tel"
                    value={clientPhone}
                    onChange={(event) => {
                      clearAttemptState();
                      setClientPhone(event.currentTarget.value);
                    }}
                    autoComplete="tel"
                    inputMode="tel"
                    pattern="^\\+[1-9]\\d{7,15}$"
                    required
                  />
                </label>

                <label className={styles.label}>
                  Email (opcional)
                  <input
                    className={styles.input}
                    type="email"
                    value={clientEmail}
                    onChange={(event) => {
                      clearAttemptState();
                      setClientEmail(event.currentTarget.value);
                    }}
                    autoComplete="email"
                    inputMode="email"
                    placeholder="email@ejemplo.com"
                  />
                </label>

                <label className={styles.label}>
                  Notas (opcional)
                  <textarea
                    className={styles.textarea}
                    value={notes}
                    onChange={(event) => {
                      clearAttemptState();
                      setNotes(event.currentTarget.value);
                    }}
                    maxLength={500}
                  />
                </label>

                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(event) => {
                      clearAttemptState();
                      setConsentAccepted(event.currentTarget.checked);
                    }}
                    required
                  />
                  <span>{bookingConfig.consent.text}</span>
                </label>

                {submitMessage ? (
                  <p
                    ref={submitMessageRef}
                    className={styles.error}
                    role="alert"
                    tabIndex={-1}
                  >
                    {submitMessage}
                  </p>
                ) : null}

                <button
                  type="submit"
                  className={styles.button}
                  disabled={isSubmitting || !selectedSlot}
                >
                  {isSubmitting ? 'Reservando…' : 'Reservar turno'}
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
