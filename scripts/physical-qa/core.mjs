/* eslint-env node */
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const REQUIRED_PORTS = Object.freeze({
  api: 3000,
  publicWeb: 3001,
  metro: 8081,
});

export const SHARED_DATABASE = Object.freeze({
  hosts: new Set(['localhost', '127.0.0.1', '::1']),
  port: '5432',
  name: 'barberapp',
});

export const DEVICE_HEARTBEAT_STALE_MS = 45_000;

const SECRET_NAME_PATTERN =
  /(SECRET|TOKEN|PASSWORD|ENCRYPTION_KEY|PRIVATE_KEY|DATABASE_URL)/i;

export function parseDotEnv(source) {
  const parsed = {};

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(
      line,
    );
    if (!match) continue;

    const [, name, rawValue] = match;
    let value = rawValue.trim();
    const quote = value[0];

    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replaceAll('\\n', '\n')
          .replaceAll('\\r', '\r')
          .replaceAll('\\t', '\t')
          .replaceAll('\\"', '"')
          .replaceAll('\\\\', '\\');
      }
    } else {
      value = value.replace(/\s+#.*$/u, '').trim();
    }

    parsed[name] = value;
  }

  return parsed;
}

export function validatePaymentEncryptionKey(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new Error(
      'PAYMENT_CREDENTIAL_ENCRYPTION_KEY is missing. Run `npm run qa:physical:configure`.',
    );
  }

  const value = rawValue.trim();
  const candidates = [
    Buffer.from(value, 'base64url'),
    Buffer.from(value, 'base64'),
    Buffer.from(value, 'hex'),
    Buffer.from(value, 'utf8'),
  ];

  if (!candidates.some((candidate) => candidate.length === 32)) {
    throw new Error(
      'PAYMENT_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256-GCM).',
    );
  }
}

export function parseAndValidateDatabaseTarget(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new Error('DATABASE_URL is required for physical QA.');
  }

  let url;
  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  const port = url.port || '5432';
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/u, ''));

  if (
    !SHARED_DATABASE.hosts.has(url.hostname) ||
    port !== SHARED_DATABASE.port ||
    databaseName !== SHARED_DATABASE.name
  ) {
    throw new Error(
      'Physical QA must use the shared local PostgreSQL target localhost:5432/barberapp; port 5433 is test-only.',
    );
  }

  return {
    host: url.hostname,
    port: Number(port),
    database: databaseName,
    sanitized: `postgresql://${url.hostname}:${port}/${databaseName}`,
  };
}

export function validatePhysicalQaEnvironment(env) {
  const database = parseAndValidateDatabaseTarget(env.DATABASE_URL);
  validatePaymentEncryptionKey(env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY);

  if (!/^sk_(test|live)_[A-Za-z0-9_-]+$/u.test(env.CLERK_SECRET_KEY ?? '')) {
    throw new Error('CLERK_SECRET_KEY is missing or malformed in apps/api/.env.');
  }

  if (
    !/^pk_(test|live)_[A-Za-z0-9_-]+$/u.test(
      env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    )
  ) {
    throw new Error(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing or malformed in apps/mobile/.env.local.',
    );
  }

  return { database };
}

export function parseLanRouteSource(output) {
  const match = /\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/u.exec(output);
  return match?.[1] ?? null;
}

function isUsableIpv4(value) {
  const octets = value.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return false;
  }

  return (
    octets[0] !== 0 &&
    octets[0] !== 127 &&
    !(octets[0] === 169 && octets[1] === 254)
  );
}

export function selectLanIpv4(networkInterfaces) {
  const candidates = [];

  for (const [name, addresses] of Object.entries(networkInterfaces)) {
    for (const address of addresses ?? []) {
      if (
        address.family !== 'IPv4' ||
        address.internal ||
        !isUsableIpv4(address.address)
      ) {
        continue;
      }

      const lowerName = name.toLowerCase();
      const virtual =
        lowerName.startsWith('docker') ||
        lowerName.startsWith('br-') ||
        lowerName.startsWith('veth');
      candidates.push({ address: address.address, virtual });
    }
  }

  return (
    candidates.find((candidate) => !candidate.virtual)?.address ??
    candidates[0]?.address ??
    null
  );
}

export function sanitizeDatabaseUrl(rawValue) {
  try {
    const parsed = new URL(rawValue);
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return '(invalid database URL)';
  }
}

export function sanitizeEnvironmentForMetadata(env) {
  const result = {};

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || SECRET_NAME_PATTERN.test(name)) continue;
    if (
      name === 'EXPO_PUBLIC_API_URL' ||
      name === 'EXPO_PUBLIC_PHYSICAL_QA_MODE' ||
      name === 'EXPO_PUBLIC_PHYSICAL_QA_TRACE' ||
      name === 'EXPO_PUBLIC_QA_RUNTIME_ID' ||
      name === 'EXPO_PUBLIC_QA_RUNTIME_FINGERPRINT' ||
      name === 'EXPO_PUBLIC_QA_RUNTIME_HEAD' ||
      name === 'EXPO_PUBLIC_QA_RUNTIME_STARTED_AT' ||
      name === 'PHYSICAL_QA_MODE' ||
      name === 'PHYSICAL_QA_REQUEST_TRACE' ||
      name === 'BARBERAPP_QA_RUNTIME_ID' ||
      name === 'BARBERAPP_QA_RUNTIME_FINGERPRINT' ||
      name === 'BARBERAPP_QA_RUNTIME_HEAD' ||
      name === 'BARBERAPP_QA_RUNTIME_STARTED_AT' ||
      name === 'BARBERAPP_QA_MOBILE_EVENTS_PATH' ||
      name === 'PUBLIC_WEB_API_URL' ||
      name === 'NEXT_PUBLIC_QA_RUNTIME_ID' ||
      name === 'NODE_ENV'
    ) {
      result[name] = value;
    }
  }

  return result;
}

export function redactSecrets(text, env = {}) {
  let redacted = String(text)
    .replace(
      /\b(?:sk_(?:test|live)|whsec|pk_(?:test|live))_[A-Za-z0-9_-]+\b/gu,
      '[REDACTED_KEY]',
    )
    .replace(
      /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/gu,
      'postgresql://[REDACTED]@',
    )
    .replace(/\+\d{8,15}\b/gu, '[MASKED_PHONE]')
    .replace(
      /((?:phone|phoneNormalized|clientPhone)["']?\s*[:=]\s*["']?)[^"',\s}]+/giu,
      '$1[MASKED_PHONE]',
    )
    .replace(
      /((?:rewardCode|codeSnapshot)["']?\s*[:=]\s*["']?)[^"',\s}]+/giu,
      '$1[MASKED_REWARD_CODE]',
    );

  for (const [name, value] of Object.entries(env)) {
    if (
      SECRET_NAME_PATTERN.test(name) &&
      typeof value === 'string' &&
      value.length >= 8
    ) {
      redacted = redacted.replaceAll(value, `[REDACTED_${name}]`);
    }
  }

  return redacted;
}

export function maskIdentifier(value) {
  if (!value) return null;
  const text = String(value);
  return text.length > 8
    ? `${text.slice(0, 3)}…${text.slice(-3)}`
    : 'masked';
}

export function maskPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/gu, '');
  if (!digits) return 'masked';
  return `***${digits.slice(-4).padStart(Math.min(4, digits.length), '*')}`;
}

export function boundRecords(records, limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  return records.slice(0, safeLimit);
}

export function classifyPortOccupant({
  listenerPids,
  expectedProcessGroupId,
  processGroupByPid,
}) {
  if (listenerPids.length === 0) return 'free';
  if (
    expectedProcessGroupId &&
    listenerPids.every(
      (pid) => processGroupByPid.get(pid) === expectedProcessGroupId,
    )
  ) {
    return 'recorded-runtime';
  }
  return 'unrelated';
}

export function verifyRecordedProcess(record, snapshot) {
  if (!snapshot) {
    return { ok: false, reason: 'process is not alive' };
  }
  if (snapshot.startTime !== record.startTime) {
    return { ok: false, reason: 'PID was reused by another process' };
  }
  if (path.resolve(snapshot.cwd) !== path.resolve(record.cwd)) {
    return { ok: false, reason: 'process working directory changed' };
  }
  if (!snapshot.command.includes(record.commandMarker)) {
    return { ok: false, reason: 'process command identity does not match' };
  }
  return { ok: true };
}

export function planSafeProcessStops(records, snapshotsByPid) {
  const safe = [];
  const skipped = [];

  for (const record of records) {
    const identity = verifyRecordedProcess(
      record,
      snapshotsByPid.get(record.pid),
    );
    if (identity.ok) {
      safe.push({
        pid: record.pid,
        processGroupId: record.processGroupId,
      });
    } else {
      skipped.push({ pid: record.pid, reason: identity.reason });
    }
  }

  return { safe, skipped };
}

export function isRuntimeMetadataStale({
  metadata,
  currentRepoRoot,
  currentHead,
  processChecks,
  now = Date.now(),
}) {
  if (!metadata || metadata.repositoryPath !== currentRepoRoot) return true;
  if (metadata.head !== currentHead) return true;
  if (!metadata.readyAt) return true;
  if (Date.parse(metadata.readyAt) > now + 60_000) return true;
  return Object.values(processChecks).some((check) => !check.ok);
}

export function summarizeRuntimeReadiness(serviceResults) {
  const services = Object.fromEntries(
    Object.entries(serviceResults).map(([name, result]) => [
      name,
      {
        ready:
          result.identity === true &&
          result.port === true &&
          result.health === true,
        ...result,
      },
    ]),
  );

  return {
    ready: Object.values(services).every((service) => service.ready),
    services,
  };
}

export function parseMobileQaEvents(source, action) {
  return parseStructuredLogLines(source, 'qa.mobile.event')
    .filter((event) => event.action === action)
    .slice(-200);
}

export function parseApiQaRequests(source) {
  return parseStructuredLogLines(source, 'qa.api.request').slice(-200);
}

export function parsePhysicalQaRuntimeMismatches(source) {
  return parseStructuredLogLines(source, 'qa.runtime.mismatch').slice(-200);
}

export function parseNdjsonRecords(source, limit = 2_000) {
  const records = [];
  for (const line of String(source).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push(parsed);
      }
    } catch {
      // Ignore partial final lines; persisted evidence is append-only.
    }
  }
  return records.slice(-Math.max(1, Math.min(Number(limit) || 2_000, 10_000)));
}

export function summarizeDeviceReadiness({
  metadata,
  events,
  mismatchEvents = [],
  now = Date.now(),
  staleAfterMs = DEVICE_HEARTBEAT_STALE_MS,
}) {
  const runtime = metadata?.runtime;
  if (!runtime?.id || !runtime?.fingerprint || !metadata?.head) {
    return createDeviceSummary('DEVICE_NOT_CONNECTED');
  }

  const currentEvents = events
    .filter((event) => event.runtimeId === runtime.id)
    .sort(compareEventTime);
  const latestCurrentAt = eventTime(currentEvents.at(-1));
  const latestMismatch = mismatchEvents
    .filter(
      (event) =>
        event.expectedFingerprint === runtime.fingerprint
        && (
          event.client === 'mobile'
          || typeof event.receivedFingerprint === 'string'
        ),
    )
    .sort(compareEventTime)
    .at(-1);
  const latestMismatchAt = eventTime(latestMismatch);

  if (
    latestMismatch
    && latestMismatchAt > latestCurrentAt
    && latestMismatch.reason === 'head'
  ) {
    return createDeviceSummary('DEVICE_HEAD_MISMATCH', {
      runtimeFingerprint: runtime.fingerprint,
      appHead: latestMismatch.receivedHead ?? null,
      lastSeenAt: latestMismatch.timestamp ?? null,
    });
  }
  if (latestMismatch && latestMismatchAt > latestCurrentAt) {
    return createDeviceSummary('DEVICE_RUNTIME_MISMATCH', {
      runtimeFingerprint: runtime.fingerprint,
      appRuntimeFingerprint:
        latestMismatch.receivedFingerprint ?? null,
      lastSeenAt: latestMismatch.timestamp ?? null,
    });
  }

  const sessionEvent = [...currentEvents]
    .reverse()
    .find((event) => typeof event.appSessionId === 'string');
  if (!sessionEvent) {
    return createDeviceSummary('DEVICE_NOT_CONNECTED', {
      runtimeFingerprint: runtime.fingerprint,
    });
  }

  const appSessionId = sessionEvent.appSessionId;
  const sessionEvents = currentEvents.filter(
    (event) => event.appSessionId === appSessionId,
  );
  const heartbeat = [...sessionEvents]
    .reverse()
    .find((event) => event.eventType === 'heartbeat');
  const handshakeSucceeded = [...sessionEvents]
    .reverse()
    .find((event) => event.eventType === 'runtime_handshake_succeeded');
  const handshakeFailed = [...sessionEvents]
    .reverse()
    .find((event) => event.eventType === 'runtime_handshake_failed');
  const focused = [...sessionEvents]
    .reverse()
    .find((event) => event.eventType === 'screen_focused');
  const latest = sessionEvents.at(-1);
  const appHead = latest?.appHead ?? null;
  const appRuntimeFingerprint = latest?.runtimeFingerprint ?? null;
  const apiTarget = latest?.apiTarget ?? null;
  const lastHeartbeatAt = heartbeat?.receivedAt ?? heartbeat?.timestamp ?? null;
  const heartbeatAgeMs = lastHeartbeatAt
    ? Math.max(0, now - Date.parse(lastHeartbeatAt))
    : null;
  const base = {
    runtimeFingerprint: runtime.fingerprint,
    appRuntimeFingerprint,
    appSessionId,
    appHead,
    apiHead: metadata.head,
    apiTarget,
    expectedApiTarget: metadata.urls?.apiBaseLan ?? null,
    lastHeartbeatAt,
    heartbeatAgeMs,
    lastSeenAt: latest?.receivedAt ?? latest?.timestamp ?? null,
    lastFocusedScreen: focused?.screen ?? null,
    traceEnabled: latest?.traceVersion === 1,
    handshakeStatus: handshakeSucceeded ? 'succeeded' : 'not_observed',
  };

  if (appRuntimeFingerprint !== runtime.fingerprint) {
    return createDeviceSummary('DEVICE_RUNTIME_MISMATCH', base);
  }
  if (appHead !== metadata.head) {
    return createDeviceSummary('DEVICE_HEAD_MISMATCH', base);
  }
  if (apiTarget !== metadata.urls?.apiBaseLan) {
    return createDeviceSummary('DEVICE_HANDSHAKE_FAILED', {
      ...base,
      handshakeStatus: 'failed',
    });
  }
  if (
    !handshakeSucceeded
    || (
      handshakeFailed
      && eventTime(handshakeFailed) > eventTime(handshakeSucceeded)
    )
  ) {
    return createDeviceSummary('DEVICE_HANDSHAKE_FAILED', {
      ...base,
      handshakeStatus: 'failed',
    });
  }
  if (!heartbeat || heartbeatAgeMs === null) {
    return createDeviceSummary('DEVICE_NOT_CONNECTED', base);
  }
  if (heartbeatAgeMs > staleAfterMs) {
    return createDeviceSummary('DEVICE_STALE', base);
  }

  return createDeviceSummary('DEVICE_READY', base);
}

export function createPhysicalQaRuntimeIdentity(
  bytes = randomBytes(16),
) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 16) {
    throw new Error('Physical-QA runtime identity requires exactly 16 bytes.');
  }
  const id = bytes.toString('hex');
  return {
    id,
    fingerprint: id.slice(0, 8).toUpperCase(),
  };
}

export function buildPhysicalQaCheckpoint({
  action,
  metadata,
  deviceReadiness,
  checkpointId,
  checkpointStartedAt,
  armedAt,
  beforeSnapshot,
}) {
  if (deviceReadiness?.classification !== 'DEVICE_READY') {
    throw new Error(
      `Checkpoint arming refused: ${
        deviceReadiness?.classification ?? 'DEVICE_NOT_CONNECTED'
      }`,
    );
  }
  if (action !== 'loyalty-program-save') {
    throw new Error('Unsupported physical-QA checkpoint action.');
  }
  return {
    version: 1,
    checkpointId,
    action,
    runtimeId: metadata.runtime.id,
    runtimeFingerprint: metadata.runtime.fingerprint,
    runtimeHead: metadata.head,
    appSessionId: deviceReadiness.appSessionId,
    appHead: deviceReadiness.appHead,
    checkpointStartedAt,
    armedAt,
    beforeSnapshot,
  };
}

function createDeviceSummary(classification, fields = {}) {
  return {
    classification,
    ready: classification === 'DEVICE_READY',
    runtimeFingerprint: null,
    appRuntimeFingerprint: null,
    appSessionId: null,
    appHead: null,
    apiHead: null,
    apiTarget: null,
    expectedApiTarget: null,
    lastHeartbeatAt: null,
    heartbeatAgeMs: null,
    lastSeenAt: null,
    lastFocusedScreen: null,
    traceEnabled: false,
    handshakeStatus: 'not_observed',
    ...fields,
  };
}

function eventTime(event) {
  if (!event) return Number.NEGATIVE_INFINITY;
  const raw = event.receivedAt ?? event.timestamp;
  const parsed = typeof raw === 'string' ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareEventTime(left, right) {
  return eventTime(left) - eventTime(right);
}

export function summarizeMobileActionEvidence({
  action,
  mobileEvents,
  apiRequests,
  loyaltyProgram,
  deviceReadiness,
}) {
  if (deviceReadiness && !deviceReadiness.ready) {
    return {
      classification: deviceReadiness.classification,
      attemptId: null,
      mobileEvents: [],
      apiRequest: null,
      expectedVisitsRequired: null,
      loyaltyProgram,
    };
  }

  const presses = mobileEvents.filter(
    (event) => event.action === action && event.stage === 'press_received',
  );
  const press = presses.at(-1) ?? null;

  if (!press || typeof press.attemptId !== 'string') {
    return {
      classification: 'PRESS_NOT_OBSERVED',
      attemptId: null,
      mobileEvents: [],
      apiRequest: null,
      expectedVisitsRequired: null,
      loyaltyProgram,
    };
  }

  const attemptEvents = mobileEvents.filter(
    (event) => event.attemptId === press.attemptId,
  );
  const stages = new Set(attemptEvents.map((event) => event.stage));
  const apiRequest = apiRequests
    .filter((event) => event.correlationId === press.attemptId)
    .at(-1) ?? null;
  const expectedVisitsRequired = [...attemptEvents]
    .reverse()
    .find((event) =>
      Number.isInteger(event.visitsRequired)
      && (
        event.stage === 'authoritative_state_applied'
        || event.stage === 'mutation_started'
      )
    )?.visitsRequired ?? null;

  let classification = 'TRACE_INCOMPLETE';
  if (stages.has('validation_failed')) {
    classification = 'VALIDATION_BLOCKED';
  } else if (!stages.has('validation_started') || !stages.has('mutation_started')) {
    classification = 'MUTATION_NOT_STARTED';
  } else if (!stages.has('request_started')) {
    classification = 'REQUEST_NOT_STARTED';
  } else if (
    (typeof apiRequest?.status === 'number' && apiRequest.status >= 400)
    || attemptEvents.some(
      (event) =>
        event.stage === 'response_received'
        && typeof event.status === 'number'
        && event.status >= 400,
    )
  ) {
    classification = 'API_REJECTED';
  } else if (stages.has('mutation_failed')) {
    classification = 'REQUEST_FAILED';
  } else if (
    stages.has('mutation_succeeded')
    && stages.has('authoritative_state_applied')
    && apiRequest
    && typeof apiRequest.status === 'number'
    && apiRequest.status >= 200
    && apiRequest.status < 300
  ) {
    classification =
      expectedVisitsRequired !== null
      && loyaltyProgram?.visitsRequired === expectedVisitsRequired
        ? 'AUTHORITATIVE_SUCCESS'
        : 'PERSISTENCE_MISMATCH';
  } else if (
    apiRequest
    && typeof apiRequest.status === 'number'
    && apiRequest.status >= 200
    && apiRequest.status < 300
    && expectedVisitsRequired !== null
    && loyaltyProgram?.visitsRequired !== expectedVisitsRequired
  ) {
    classification = 'PERSISTENCE_MISMATCH';
  }

  return {
    classification,
    attemptId: press.attemptId,
    mobileEvents: attemptEvents,
    apiRequest,
    expectedVisitsRequired,
    loyaltyProgram,
  };
}

function parseStructuredLogLines(source, prefix) {
  const events = [];
  for (const line of String(source).split(/\r?\n/u)) {
    const markerIndex = line.indexOf(`${prefix} `);
    if (markerIndex < 0) continue;
    const payload = line.slice(markerIndex + prefix.length + 1).trim();
    const endIndex = payload.lastIndexOf('}');
    if (!payload.startsWith('{') || endIndex < 0) continue;
    try {
      const parsed = JSON.parse(payload.slice(0, endIndex + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        events.push(parsed);
      }
    } catch {
      // Ignore malformed or partial log lines; evidence will classify gaps.
    }
  }
  return events;
}

export function createRuntimeMetadata({
  repositoryPath,
  branch,
  head,
  lanIp,
  database,
  services,
  startedAt,
  runtimeIdentity,
  mobileEventsPath,
}) {
  const apiLanBase = `http://${lanIp}:${REQUIRED_PORTS.api}`;
  const publicLanBase = `http://${lanIp}:${REQUIRED_PORTS.publicWeb}`;

  return {
    version: 2,
    repositoryPath,
    branch,
    head,
    lanIp,
    startedAt,
    readyAt: null,
    runtime: {
      id: runtimeIdentity.id,
      fingerprint: runtimeIdentity.fingerprint,
      mobileEventsPath,
    },
    database: database.sanitized,
    urls: {
      apiLocal: `http://127.0.0.1:${REQUIRED_PORTS.api}`,
      apiLan: apiLanBase,
      apiBaseLan: `${apiLanBase}/api/v1`,
      publicLocal: `http://127.0.0.1:${REQUIRED_PORTS.publicWeb}`,
      publicLan: publicLanBase,
      publicBookingLocal: `http://127.0.0.1:${REQUIRED_PORTS.publicWeb}/barberias/qa-barbershop`,
      publicBookingLan: `${publicLanBase}/barberias/qa-barbershop`,
      metroLocal: `http://127.0.0.1:${REQUIRED_PORTS.metro}`,
      metroLan: `http://${lanIp}:${REQUIRED_PORTS.metro}`,
      expo: `exp://${lanIp}:${REQUIRED_PORTS.metro}`,
    },
    services,
  };
}
