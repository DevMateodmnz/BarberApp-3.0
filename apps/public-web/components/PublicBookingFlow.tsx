'use client';

import React, { useMemo, useState } from 'react';
import styles from './PublicBookingFlow.module.css';
import {
  BrowserApiError,
  loadAvailabilityForSelection,
  loadBarbersForService,
} from '@/lib/api/browser';
import type {
  PublicAvailability,
  PublicBarber,
  PublicService,
  PublicShop,
} from '@/lib/api/types';

interface PublicBookingFlowProps {
  shop: PublicShop;
  services: PublicService[];
  loadBarbers?: (serviceId: string) => Promise<PublicBarber[]>;
  loadAvailability?: (input: {
    barberId: string;
    localDate: string;
    serviceId: string;
  }) => Promise<PublicAvailability>;
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

export function PublicBookingFlow({
  shop,
  services,
  loadBarbers = (serviceId) => loadBarbersForService(shop.slug, serviceId),
  loadAvailability = (input) =>
    loadAvailabilityForSelection({
      slug: shop.slug,
      serviceId: input.serviceId,
      barberId: input.barberId,
      localDate: input.localDate,
    }),
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

  async function handleServiceChange(serviceId: string) {
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

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="public-booking-title">
        <p className={styles.eyebrow}>Reserva online</p>
        <h1 id="public-booking-title" className={styles.title}>
          {shop.name}
        </h1>
        <p className={styles.subtitle}>Zona horaria: {shop.timezone}</p>

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
                      onClick={() => setSelectedSlotStartAt(slot.startAt)}
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
        </div>
      </section>
    </main>
  );
}
