/* eslint-env node */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  boundRecords,
  classifyPortOccupant,
  createRuntimeMetadata,
  isRuntimeMetadataStale,
  maskPhone,
  parseApiQaRequests,
  parseAndValidateDatabaseTarget,
  parseLanRouteSource,
  parseMobileQaEvents,
  planSafeProcessStops,
  redactSecrets,
  sanitizeEnvironmentForMetadata,
  selectLanIpv4,
  summarizeRuntimeReadiness,
  summarizeMobileActionEvidence,
  validatePaymentEncryptionKey,
} from './core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

test('rejects a missing payment encryption key with an actionable command', () => {
  assert.throws(
    () => validatePaymentEncryptionKey(undefined),
    /qa:physical:configure/u,
  );
});

test('rejects an invalid payment encryption key', () => {
  assert.throws(
    () => validatePaymentEncryptionKey('too-short'),
    /exactly 32 bytes/u,
  );
});

test('accepts a valid base64-encoded 32-byte payment key', () => {
  assert.doesNotThrow(() =>
    validatePaymentEncryptionKey(Buffer.alloc(32, 7).toString('base64')),
  );
});

test('classifies free, recorded, and unrelated required-port listeners', () => {
  assert.equal(
    classifyPortOccupant({
      listenerPids: [],
      expectedProcessGroupId: null,
      processGroupByPid: new Map(),
    }),
    'free',
  );
  assert.equal(
    classifyPortOccupant({
      listenerPids: [21, 22],
      expectedProcessGroupId: 20,
      processGroupByPid: new Map([
        [21, 20],
        [22, 20],
      ]),
    }),
    'recorded-runtime',
  );
  assert.equal(
    classifyPortOccupant({
      listenerPids: [31],
      expectedProcessGroupId: 20,
      processGroupByPid: new Map([[31, 30]]),
    }),
    'unrelated',
  );
});

test('marks missing-process and old-HEAD runtime metadata stale', () => {
  const metadata = {
    repositoryPath: '/repo',
    head: 'abc',
    readyAt: '2026-07-24T10:00:00.000Z',
  };
  assert.equal(
    isRuntimeMetadataStale({
      metadata,
      currentRepoRoot: '/repo',
      currentHead: 'abc',
      processChecks: { api: { ok: false } },
      now: Date.parse('2026-07-24T11:00:00.000Z'),
    }),
    true,
  );
  assert.equal(
    isRuntimeMetadataStale({
      metadata,
      currentRepoRoot: '/repo',
      currentHead: 'def',
      processChecks: { api: { ok: true } },
      now: Date.parse('2026-07-24T11:00:00.000Z'),
    }),
    true,
  );
});

test('plans partial-startup cleanup only for identity-verified processes', () => {
  const records = [
    {
      pid: 100,
      processGroupId: 100,
      startTime: '10',
      cwd: '/repo/apps/api',
      commandMarker: 'log-runner.mjs',
    },
    {
      pid: 200,
      processGroupId: 200,
      startTime: '20',
      cwd: '/repo/apps/mobile',
      commandMarker: 'log-runner.mjs',
    },
  ];
  const plan = planSafeProcessStops(
    records,
    new Map([
      [
        100,
        {
          startTime: '10',
          cwd: '/repo/apps/api',
          command: 'node log-runner.mjs api',
        },
      ],
      [
        200,
        {
          startTime: 'different',
          cwd: '/repo/apps/mobile',
          command: 'node log-runner.mjs metro',
        },
      ],
    ]),
  );
  assert.deepEqual(plan.safe, [{ pid: 100, processGroupId: 100 }]);
  assert.match(plan.skipped[0].reason, /PID was reused/u);
});

test('reports all-healthy and one-service-died status deterministically', () => {
  const healthy = summarizeRuntimeReadiness({
    api: { identity: true, port: true, health: true },
    publicWeb: { identity: true, port: true, health: true },
    metro: { identity: true, port: true, health: true },
  });
  assert.equal(healthy.ready, true);

  const died = summarizeRuntimeReadiness({
    api: { identity: true, port: true, health: true },
    publicWeb: { identity: false, port: false, health: false },
    metro: { identity: true, port: true, health: true },
  });
  assert.equal(died.ready, false);
  assert.equal(died.services.publicWeb.ready, false);
});

test('resolves LAN IPv4 from route output and deterministic interface fallback', () => {
  assert.equal(
    parseLanRouteSource(
      '1.1.1.1 via 192.168.1.1 dev wlan0 src 192.168.1.25 uid 1000',
    ),
    '192.168.1.25',
  );
  assert.equal(
    selectLanIpv4({
      docker0: [
        { family: 'IPv4', internal: false, address: '172.17.0.1' },
      ],
      wlan0: [
        { family: 'IPv4', internal: false, address: '10.20.30.40' },
      ],
    }),
    '10.20.30.40',
  );
});

test('validates only the intended shared database and rejects test port 5433', () => {
  assert.equal(
    parseAndValidateDatabaseTarget(
      'postgresql://user:secret@localhost:5432/barberapp',
    ).sanitized,
    'postgresql://localhost:5432/barberapp',
  );
  assert.throws(
    () =>
      parseAndValidateDatabaseTarget(
        'postgresql://user:secret@localhost:5433/barberapp_test',
      ),
    /5433 is test-only/u,
  );
});

test('metadata stores generated paths and public targets but no secrets', () => {
  const metadata = createRuntimeMetadata({
    repositoryPath: '/repo',
    branch: 'main',
    head: 'abc',
    lanIp: '192.168.1.25',
    database: { sanitized: 'postgresql://localhost:5432/barberapp' },
    services: {
      api: {
        logPath: '.qa-runtime/logs/api.log',
        publicEnvironment: sanitizeEnvironmentForMetadata({
          EXPO_PUBLIC_API_URL: 'http://192.168.1.25:3000/api/v1',
          PAYMENT_CREDENTIAL_ENCRYPTION_KEY: 'super-secret-key',
          CLERK_SECRET_KEY: 'sk_test_secret',
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/barberapp',
        }),
      },
    },
    startedAt: '2026-07-24T10:00:00.000Z',
  });
  const serialized = JSON.stringify(metadata);
  assert.match(serialized, /\.qa-runtime\/logs\/api\.log/u);
  assert.match(serialized, /192\.168\.1\.25:3000\/api\/v1/u);
  assert.doesNotMatch(serialized, /super-secret|sk_test_secret|user:pass/u);
});

test('redacts common keys and database passwords from diagnostics', () => {
  const redacted = redactSecrets(
    'sk_test_abcdefgh whsec_abcdefgh postgresql://user:password@localhost:5432/barberapp phone=+543815559021 rewardCode=LOYALTY-SECRET',
  );
  assert.doesNotMatch(
    redacted,
    /abcdefgh|password|543815559021|LOYALTY-SECRET/u,
  );
  assert.match(redacted, /REDACTED/u);
});

test('snapshot helpers mask phones and enforce bounded output', () => {
  assert.equal(maskPhone('+54 381 555 9021'), '***9021');
  assert.deepEqual(boundRecords([1, 2, 3, 4], 2), [1, 2]);
  assert.equal(boundRecords(Array.from({ length: 150 }), 999).length, 100);
});

test('runtime and snapshot output directories are ignored by Git', () => {
  const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.qa-runtime\/$/mu);
  assert.match(gitignore, /apps\/api\/\.env\.physical-qa\.local/u);
});

test('parses prefixed mobile and API trace lines without depending on surrounding log text', () => {
  const mobile = parseMobileQaEvents(
    [
      'LOG qa.mobile.event {"timestamp":"2026-07-24T10:00:00.000Z","action":"loyalty-program-save","stage":"press_received","attemptId":"qa-1"}',
      'qa.mobile.event malformed',
      'qa.mobile.event {"action":"other","stage":"press_received","attemptId":"qa-2"}',
    ].join('\n'),
    'loyalty-program-save',
  );
  const api = parseApiQaRequests(
    'qa.api.request {"method":"PUT","route":"/api/v1/barbershops/:value/loyalty-program","status":200,"correlationId":"qa-1"}',
  );

  assert.equal(mobile.length, 1);
  assert.equal(mobile[0].attemptId, 'qa-1');
  assert.equal(api.length, 1);
  assert.equal(api[0].status, 200);
});

test('classifies empty, validation, pre-request, rejected, mismatch, and authoritative mobile evidence', () => {
  const loyaltyProgram = { visitsRequired: 2, updatedAt: '2026-07-24T10:00:01Z' };
  const event = (stage, extra = {}) => ({
    action: 'loyalty-program-save',
    attemptId: 'qa-1',
    stage,
    ...extra,
  });
  const summarize = (mobileEvents, apiRequests = [], program = loyaltyProgram) =>
    summarizeMobileActionEvidence({
      action: 'loyalty-program-save',
      mobileEvents,
      apiRequests,
      loyaltyProgram: program,
    }).classification;

  assert.equal(summarize([]), 'PRESS_NOT_OBSERVED');
  assert.equal(summarize([
    event('press_received'),
    event('validation_started'),
    event('validation_failed'),
  ]), 'VALIDATION_BLOCKED');
  assert.equal(summarize([
    event('press_received'),
    event('validation_started'),
    event('mutation_started', { visitsRequired: 2 }),
  ]), 'REQUEST_NOT_STARTED');
  assert.equal(summarize([
    event('press_received'),
    event('validation_started'),
    event('mutation_started', { visitsRequired: 2 }),
    event('request_started'),
    event('response_received', { status: 403 }),
    event('mutation_failed'),
  ]), 'API_REJECTED');

  const successfulEvents = [
    event('press_received'),
    event('validation_started'),
    event('mutation_started', { visitsRequired: 2 }),
    event('request_started'),
    event('response_received', { status: 200 }),
    event('mutation_succeeded', { visitsRequired: 2 }),
    event('authoritative_state_applied', { visitsRequired: 2 }),
  ];
  const successfulApi = [{
    correlationId: 'qa-1',
    method: 'PUT',
    status: 200,
  }];
  assert.equal(
    summarize(successfulEvents, successfulApi),
    'AUTHORITATIVE_SUCCESS',
  );
  assert.equal(
    summarize(successfulEvents, successfulApi, { visitsRequired: 5 }),
    'PERSISTENCE_MISMATCH',
  );
});
