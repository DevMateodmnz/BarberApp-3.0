import fs from 'node:fs';
import path from 'node:path';

export const QA_LOCAL_CONFIG_FILENAME = '.env.qa.local';
export const QA_LOCAL_CONFIG_EXAMPLE_FILENAME = '.env.qa.local.example';

export const DEFAULT_QA_BARBERSHOP_NAME = 'QA Barbershop';
export const DEFAULT_QA_OWNER_EMAIL = 'owner@barberapp-qa.com';
export const DEFAULT_QA_OWNER_NAME = 'QA Owner';
export const DEFAULT_QA_BARBER_EMAIL = 'barber@barberapp-qa.com';
export const DEFAULT_QA_BARBER_NAME = 'QA Barber';
export const DEFAULT_QA_BARBERSHOP_PHONE = '+54 11 5555-0000';
export const DEFAULT_QA_BARBERSHOP_TIMEZONE = 'America/Argentina/Tucuman';

const PLACEHOLDER_FRAGMENTS = [
  'your_',
  'example',
  'placeholder',
  'changeme',
  '<',
  '>',
  'user_owner_',
  'user_barber_',
];

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
]);

export interface QaActorConfig {
  clerkUserId: string;
  desiredEmail?: string;
  desiredName?: string;
  managedEmail: string;
  defaultName: string;
}

export interface QaBootstrapConfig {
  databaseUrl: string;
  allowNonLocalDatabase: boolean;
  qaBarbershopName: string;
  owner: QaActorConfig;
  barber: QaActorConfig;
}

export interface CandidateResolutionInput {
  clerkIdMatches?: string[];
  managedEmailMatches?: string[];
  pinnedMatches?: string[];
}

export interface CandidateResolution {
  action: 'create' | 'reuse';
  candidateId?: string;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function isValidClerkUserId(value: string): boolean {
  return /^user_[A-Za-z0-9]+$/.test(value.trim());
}

export function maskClerkUserId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) return `${trimmed.slice(0, 6)}***`;
  return `${trimmed.slice(0, 9)}…${trimmed.slice(-4)}`;
}

export function maskEmail(value: string): string {
  const trimmed = value.trim();
  const [local = '', domain = ''] = trimmed.split('@');

  if (!domain) {
    return `${local.slice(0, 3)}***`;
  }

  const [domainName = '', tld = ''] = domain.split('.');
  const maskedLocal = local.length <= 2
    ? `${local.slice(0, 1)}***`
    : `${local.slice(0, 2)}***`;
  const maskedDomain = domainName.length <= 1
    ? `${domainName.slice(0, 1)}***`
    : `${domainName.slice(0, 2)}***`;

  return `${maskedLocal}@${maskedDomain}${tld ? `.${tld}` : ''}`;
}

export function maskOptionalEmail(value: string | undefined): string | undefined {
  return value ? maskEmail(value) : undefined;
}

export function loadEnvFileIfPresent(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function getLocalQaConfigPath(cwd = process.cwd()): string {
  return path.resolve(cwd, QA_LOCAL_CONFIG_FILENAME);
}

export function getLocalQaConfigExamplePath(cwd = process.cwd()): string {
  return path.resolve(cwd, QA_LOCAL_CONFIG_EXAMPLE_FILENAME);
}

export function assertSafeLocalDatabaseUrl(databaseUrl: string, allowNonLocalDatabase: boolean): void {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//u, '').trim();

  if (process.env.NODE_ENV === 'production') {
    throw new Error('QA bootstrap refuses to run when NODE_ENV=production.');
  }

  if (!allowNonLocalDatabase && !LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      `QA bootstrap refuses non-local database host "${hostname}". Set QA_BOOTSTRAP_ALLOW_NONLOCAL_DATABASE=true only if you intentionally understand the risk.`,
    );
  }

  if (
    !allowNonLocalDatabase &&
    /(^|[-_])(prod|production)([-_]|$)/iu.test(databaseName)
  ) {
    throw new Error(
      `QA bootstrap refuses database name "${databaseName}" because it looks production-like.`,
    );
  }
}

export function resolveCandidate(
  input: CandidateResolutionInput,
): CandidateResolution {
  const candidateIds = new Set([
    ...(input.pinnedMatches ?? []),
    ...(input.clerkIdMatches ?? []),
    ...(input.managedEmailMatches ?? []),
  ].filter(Boolean));

  if (candidateIds.size === 0) {
    return { action: 'create' };
  }

  if (candidateIds.size > 1) {
    throw new Error(
      `Ambiguous QA entity selection: expected at most one candidate, found ${candidateIds.size}.`,
    );
  }

  return { action: 'reuse', candidateId: [...candidateIds][0]! };
}

export function readQaBootstrapConfig(env: NodeJS.ProcessEnv = process.env): QaBootstrapConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const ownerClerkUserId = env.QA_OWNER_CLERK_USER_ID?.trim();
  if (!ownerClerkUserId || isPlaceholderValue(ownerClerkUserId)) {
    throw new Error('QA_OWNER_CLERK_USER_ID is required and cannot be a placeholder.');
  }

  if (!isValidClerkUserId(ownerClerkUserId)) {
    throw new Error('QA_OWNER_CLERK_USER_ID must match the Clerk user ID format: user_...');
  }

  const barberClerkUserId = env.QA_BARBER_CLERK_USER_ID?.trim();
  if (!barberClerkUserId || isPlaceholderValue(barberClerkUserId)) {
    throw new Error('QA_BARBER_CLERK_USER_ID is required and cannot be a placeholder.');
  }

  if (!isValidClerkUserId(barberClerkUserId)) {
    throw new Error('QA_BARBER_CLERK_USER_ID must match the Clerk user ID format: user_...');
  }

  const ownerDesiredEmail = parseOptionalValue(env.QA_OWNER_EMAIL);
  if (ownerDesiredEmail && isPlaceholderValue(ownerDesiredEmail)) {
    throw new Error('QA_OWNER_EMAIL cannot be a placeholder when provided.');
  }

  const barberDesiredEmail = parseOptionalValue(env.QA_BARBER_EMAIL);
  if (barberDesiredEmail && isPlaceholderValue(barberDesiredEmail)) {
    throw new Error('QA_BARBER_EMAIL cannot be a placeholder when provided.');
  }

  const ownerDesiredName = parseOptionalValue(env.QA_OWNER_NAME);
  if (ownerDesiredName && isPlaceholderValue(ownerDesiredName)) {
    throw new Error('QA_OWNER_NAME cannot be a placeholder when provided.');
  }

  const barberDesiredName = parseOptionalValue(env.QA_BARBER_NAME);
  if (barberDesiredName && isPlaceholderValue(barberDesiredName)) {
    throw new Error('QA_BARBER_NAME cannot be a placeholder when provided.');
  }

  const qaBarbershopName = parseOptionalValue(env.QA_BARBERSHOP_NAME);
  if (qaBarbershopName && isPlaceholderValue(qaBarbershopName)) {
    throw new Error('QA_BARBERSHOP_NAME cannot be a placeholder when provided.');
  }

  return {
    databaseUrl,
    allowNonLocalDatabase: parseBoolean(env.QA_BOOTSTRAP_ALLOW_NONLOCAL_DATABASE),
    qaBarbershopName: qaBarbershopName ?? DEFAULT_QA_BARBERSHOP_NAME,
    owner: {
      clerkUserId: ownerClerkUserId,
      desiredEmail: ownerDesiredEmail,
      desiredName: ownerDesiredName,
      managedEmail: DEFAULT_QA_OWNER_EMAIL,
      defaultName: DEFAULT_QA_OWNER_NAME,
    },
    barber: {
      clerkUserId: barberClerkUserId,
      desiredEmail: barberDesiredEmail,
      desiredName: barberDesiredName,
      managedEmail: DEFAULT_QA_BARBER_EMAIL,
      defaultName: DEFAULT_QA_BARBER_NAME,
    },
  };
}

export interface QaMaskedSummary {
  qaBarbershopName: string;
  ownerClerkUserId: string;
  barberClerkUserId: string;
  ownerEmail?: string;
  barberEmail?: string;
}

export function formatMaskedSummary(summary: QaMaskedSummary): string {
  const lines = [
    `QA barbershop: ${summary.qaBarbershopName}`,
    `OWNER Clerk ID: ${summary.ownerClerkUserId}`,
    ...(summary.ownerEmail ? [`OWNER email: ${summary.ownerEmail}`] : []),
    `BARBER Clerk ID: ${summary.barberClerkUserId}`,
    ...(summary.barberEmail ? [`BARBER email: ${summary.barberEmail}`] : []),
  ];

  return lines.join('\n');
}
