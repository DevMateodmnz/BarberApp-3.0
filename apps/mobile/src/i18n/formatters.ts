import { DEFAULT_LOCALE, type SupportedLocale } from './catalog.js';
import { mobileLocalizationRuntime } from './runtime.js';

const DEFAULT_CURRENCY = 'ARS';
const DEFAULT_BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const INTL_LOCALE_BY_SUPPORTED_LOCALE: Record<SupportedLocale, string> = {
  es: 'es-AR',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  'zh-Hans': 'zh-Hans-CN',
};

function getActiveLocale(locale?: SupportedLocale): SupportedLocale {
  return locale ?? mobileLocalizationRuntime.getSnapshot().locale ?? DEFAULT_LOCALE;
}

function getIntlLocale(locale?: SupportedLocale): string {
  return INTL_LOCALE_BY_SUPPORTED_LOCALE[getActiveLocale(locale)];
}

function getNumberFormatter(
  locale: SupportedLocale | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return new Intl.NumberFormat(getIntlLocale(locale), options);
}

function fallbackCurrency(value: number, fractionDigits: number): string {
  const absolute = Math.abs(value);
  const fixed = absolute.toFixed(fractionDigits);
  const [whole, decimal = ''] = fixed.split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = value < 0 ? '-' : '';
  return fractionDigits > 0
    ? `${sign}$${grouped}.${decimal}`
    : `${sign}$${grouped}`;
}

function fallbackInteger(value: number): string {
  return value.toString(10);
}

export interface DateFormatterOptions extends Intl.DateTimeFormatOptions {
  locale?: SupportedLocale;
  timeZone?: string;
}

export function formatInteger(value: number, locale?: SupportedLocale): string {
  try {
    return getNumberFormatter(locale, {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return fallbackInteger(Math.trunc(value));
  }
}

export function formatDecimal(
  value: number,
  options: { locale?: SupportedLocale; maximumFractionDigits?: number; minimumFractionDigits?: number } = {},
): string {
  const {
    locale,
    maximumFractionDigits = 2,
    minimumFractionDigits = 0,
  } = options;

  try {
    return getNumberFormatter(locale, {
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(value);
  } catch {
    return value.toFixed(Math.max(minimumFractionDigits, maximumFractionDigits));
  }
}

export function formatPercent(
  value: number,
  options: { locale?: SupportedLocale; maximumFractionDigits?: number } = {},
): string {
  const { locale, maximumFractionDigits = 0 } = options;

  try {
    return getNumberFormatter(locale, {
      style: 'percent',
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${Math.round(value * 100)}%`;
  }
}

export function formatCurrencyUnits(
  value: number,
  options: { locale?: SupportedLocale; currency?: string; fractionDigits?: number } = {},
): string {
  const { locale, currency = DEFAULT_CURRENCY, fractionDigits = 0 } = options;

  try {
    return getNumberFormatter(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return fallbackCurrency(value, fractionDigits);
  }
}

export function formatCurrencyMinorUnits(
  cents: number,
  options: { locale?: SupportedLocale; currency?: string; fractionDigits?: number } = {},
): string {
  if (!Number.isInteger(cents)) {
    throw new Error('cents must be an integer');
  }
  if (cents < 0) {
    throw new Error('cents must be non-negative');
  }

  const { fractionDigits = 2 } = options;
  return formatCurrencyUnits(cents / 100, { ...options, fractionDigits });
}

export function formatLocalizedDate(
  value: Date | string,
  options: DateFormatterOptions = {},
): string | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const { locale, timeZone = DEFAULT_BUSINESS_TIME_ZONE, ...intlOptions } = options;

  try {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone,
      ...intlOptions,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatLocalizedTime(
  value: Date | string,
  options: DateFormatterOptions = {},
): string | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const { locale, timeZone, ...intlOptions } = options;

  try {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      ...intlOptions,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatLocalizedWeekday(dayOfWeek: number, locale?: SupportedLocale): string {
  const reference = new Date(Date.UTC(2024, 0, 7 + dayOfWeek));

  try {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(reference);
  } catch {
    return reference.toUTCString();
  }
}
