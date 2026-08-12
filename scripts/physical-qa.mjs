#!/usr/bin/env node
/* eslint-env node */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  REQUIRED_PORTS,
  boundRecords,
  buildPhysicalQaCheckpoint,
  classifyPortOccupant,
  createPhysicalQaRuntimeIdentity,
  createRuntimeMetadata,
  isRuntimeMetadataStale,
  maskIdentifier,
  maskPhone,
  parseApiQaRequests,
  parseDotEnv,
  parseLanRouteSource,
  parseNdjsonRecords,
  parsePhysicalQaRuntimeMismatches,
  redactSecrets,
  sanitizeEnvironmentForMetadata,
  selectLanIpv4,
  summarizeRuntimeReadiness,
  summarizeDeviceReadiness,
  summarizeMobileActionEvidence,
  validatePhysicalQaEnvironment,
  verifyRecordedProcess,
} from './physical-qa/core.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const qrcode = require('qrcode-terminal');
const repoRoot = path.resolve(scriptDir, '..');
const apiRoot = path.join(repoRoot, 'apps', 'api');
const publicWebRoot = path.join(repoRoot, 'apps', 'public-web');
const mobileRoot = path.join(repoRoot, 'apps', 'mobile');
const runtimeDir = path.join(repoRoot, '.qa-runtime');
const logsDir = path.join(runtimeDir, 'logs');
const snapshotsDir = path.join(runtimeDir, 'snapshots');
const mobileEventsDir = path.join(runtimeDir, 'mobile-events');
const checkpointsDir = path.join(runtimeDir, 'checkpoints');
const evidenceDir = path.join(runtimeDir, 'evidence');
const metadataPath = path.join(runtimeDir, 'runtime.json');
const paymentEnvPath = path.join(apiRoot, '.env.physical-qa.local');
const runnerPath = path.join(scriptDir, 'physical-qa', 'log-runner.mjs');
const serviceOrder = ['api', 'publicWeb', 'metro'];
const serviceLabels = {
  api: 'API',
  publicWeb: 'public web',
  metro: 'Metro',
};

function print(message = '') {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

function ensureRepoRoot() {
  const packagePath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (
    packageJson.name !== 'barberapp-3.0' ||
    path.resolve(process.cwd()) !== repoRoot
  ) {
    fail(`Run this command from the BarberApp repository root: ${repoRoot}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    timeout: options.timeout ?? 120_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = redactSecrets(
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
      options.env,
    ).trim();
    fail(
      `${command} ${args.join(' ')} failed with exit ${result.status}.` +
        (detail ? `\n${detail}` : ''),
    );
  }
  return result;
}

function git(...args) {
  return run('git', args).stdout.trim();
}

function loadEnvFile(filePath) {
  return existsSync(filePath)
    ? parseDotEnv(readFileSync(filePath, 'utf8'))
    : {};
}

function loadRuntimeEnvironment() {
  return {
    ...process.env,
    ...loadEnvFile(path.join(repoRoot, '.env')),
    ...loadEnvFile(path.join(apiRoot, '.env')),
    ...loadEnvFile(paymentEnvPath),
    ...loadEnvFile(path.join(mobileRoot, '.env.local')),
  };
}

function currentGitTruth() {
  return {
    branch: git('branch', '--show-current') || '(detached)',
    head: git('rev-parse', 'HEAD'),
    shortHead: git('rev-parse', '--short=7', 'HEAD'),
    status: git('status', '--short'),
  };
}

function printGitTruth(truth) {
  print(`Repository: ${repoRoot}`);
  print(`Git: ${truth.branch} @ ${truth.shortHead}`);

  if (!truth.status) {
    print('Worktree: clean');
    return;
  }

  const lines = truth.status.split('\n');
  const generated = lines.filter((line) =>
    line.endsWith('apps/public-web/next-env.d.ts'),
  );
  const product = lines.filter(
    (line) => !line.endsWith('apps/public-web/next-env.d.ts'),
  );

  if (generated.length) {
    print(`Generated drift warning: ${generated.join(', ')}`);
  }
  if (product.length) {
    print('Source/workflow drift warning:');
    for (const line of product) print(`  ${line}`);
  }
}

function assertTooling() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 20) fail(`Node.js >=20 is required; found ${process.version}.`);

  const npmVersion = run('npm', ['--version']).stdout.trim();
  if (Number(npmVersion.split('.')[0]) < 10) {
    fail(`npm >=10 is required; found ${npmVersion}.`);
  }

  run('docker', ['info'], { timeout: 30_000 });
  print(`Tooling: Node ${process.version}, npm ${npmVersion}, Docker ready`);
}

function processSnapshot(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const closeParen = stat.lastIndexOf(')');
    const fields = stat.slice(closeParen + 2).split(' ');
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      .split('\0')
      .filter(Boolean)
      .join(' ');
    return {
      pid,
      groupId: Number(fields[2]),
      startTime: fields[19],
      cwd: readlinkSync(`/proc/${pid}/cwd`),
      command,
    };
  } catch {
    return null;
  }
}

function listenerPids(port) {
  const result = run(
    'lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
    { allowFailure: true },
  );
  const lsofPids = [
    ...new Set(
      result.stdout
        .split(/\s+/u)
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger),
    ),
  ];
  if (lsofPids.length) return lsofPids;

  const socketResult = run('ss', ['-ltnpH', `sport = :${port}`], {
    allowFailure: true,
  });
  return [
    ...new Set(
      [...socketResult.stdout.matchAll(/\bpid=(\d+)\b/gu)].map((match) =>
        Number(match[1]),
      ),
    ),
  ];
}

function isPortListening(port) {
  const result = run('ss', ['-ltnH', `sport = :${port}`], {
    allowFailure: true,
  });
  return result.status === 0 && result.stdout.trim() !== '';
}

function describePid(pid) {
  const snapshot = processSnapshot(pid);
  if (!snapshot) return `PID ${pid} (exited)`;
  return `PID ${pid}, cwd=${snapshot.cwd}, command=${snapshot.command}`;
}

function readMetadata() {
  if (!existsSync(metadataPath)) return null;
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8'));
  } catch {
    fail(`${metadataPath} is not valid JSON; run npm run qa:physical:stop.`);
  }
}

function writeMetadata(metadata) {
  mkdirSync(runtimeDir, { recursive: true });
  const temporaryPath = `${metadataPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, metadataPath);
}

function resolveLanIp() {
  const route = run('ip', ['-4', 'route', 'get', '1.1.1.1'], {
    allowFailure: true,
  });
  const routeSource = parseLanRouteSource(route.stdout);
  const fallback = selectLanIpv4(networkInterfaces());
  const lanIp = routeSource ?? fallback;
  if (!lanIp) fail('Could not determine a LAN IPv4 address.');
  return lanIp;
}

function assertSharedDatabase(env, database) {
  if (!isPortListening(5432)) {
    fail(
      'Shared PostgreSQL is not listening on 5432. Start the existing shared database without starting test PostgreSQL 5433.',
    );
  }
  if (isPortListening(5433)) {
    fail('Port 5433 is active. Stop test PostgreSQL before physical QA.');
  }

  const migrationStatus = run(
    'npx',
    ['prisma', 'migrate', 'status', '--schema=prisma/schema.prisma'],
    { cwd: apiRoot, env, timeout: 120_000 },
  );
  if (!migrationStatus.stdout.includes('Database schema is up to date')) {
    fail('Prisma migration status did not confirm the shared schema is current.');
  }

  const shadowDatabase = 'barberapp_physical_qa_shadow';
  const shadowUrl = `postgresql://postgres:postgres@localhost:5433/${shadowDatabase}`;
  let testDatabaseStarted = false;

  try {
    run('docker', ['compose', 'up', '-d', 'postgres_test'], {
      timeout: 60_000,
    });
    testDatabaseStarted = true;

    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const check = run(
        'docker',
        ['compose', 'exec', '-T', 'postgres_test', 'pg_isready', '-U', 'postgres'],
        { allowFailure: true, timeout: 5_000 },
      );
      if (check.status === 0) {
        ready = true;
        break;
      }
      run('sleep', ['0.25']);
    }
    if (!ready) fail('Timed out preparing the isolated schema-drift checker.');

    run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres_test',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `DROP DATABASE IF EXISTS ${shadowDatabase} WITH (FORCE);`,
        '-c',
        `CREATE DATABASE ${shadowDatabase};`,
      ],
      { timeout: 30_000 },
    );

    const drift = run(
      'npx',
      [
        'prisma',
        'migrate',
        'diff',
        '--exit-code',
        '--from-migrations=prisma/migrations',
        '--to-schema-datasource=prisma/schema.prisma',
        `--shadow-database-url=${shadowUrl}`,
      ],
      {
        cwd: apiRoot,
        env,
        timeout: 120_000,
        allowFailure: true,
      },
    );
    if (drift.status === 2) {
      fail(
        `Shared database schema drift detected against the committed migration chain:\n${redactSecrets(
          drift.stdout || drift.stderr,
          env,
        ).trim()}`,
      );
    }
    if (drift.status !== 0) {
      fail(
        `Could not inspect shared database drift:\n${redactSecrets(
          drift.stdout || drift.stderr,
          env,
        ).trim()}`,
      );
    }
  } finally {
    if (testDatabaseStarted) {
      run(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'postgres_test',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-c',
          `DROP DATABASE IF EXISTS ${shadowDatabase} WITH (FORCE);`,
        ],
        { allowFailure: true, timeout: 30_000 },
      );
      run('docker', ['compose', 'stop', 'postgres_test'], {
        allowFailure: true,
        timeout: 60_000,
      });
    }
  }

  print(`Database: ${database.sanitized} (migrations current, no schema drift)`);
}

function assertPortsFree() {
  for (const [name, port] of Object.entries(REQUIRED_PORTS)) {
    const pids = listenerPids(port);
    const classification = classifyPortOccupant({
      listenerPids: pids,
      expectedProcessGroupId: null,
      processGroupByPid: new Map(
        pids.map((pid) => [pid, processSnapshot(pid)?.groupId]),
      ),
    });
    if (classification !== 'free' || isPortListening(port)) {
      fail(
        `Port ${port} (${serviceLabels[name]}) is occupied by an unrelated process: ${
          pids.length ? pids.map(describePid).join('; ') : 'listener identity unavailable'
        }`,
      );
    }
  }
}

function configure() {
  ensureRepoRoot();
  mkdirSync(apiRoot, { recursive: true });

  if (existsSync(paymentEnvPath)) {
    const env = loadEnvFile(paymentEnvPath);
    validatePhysicalQaEnvironment({
      DATABASE_URL: 'postgresql://local:local@localhost:5432/barberapp',
      PAYMENT_CREDENTIAL_ENCRYPTION_KEY:
        env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY,
      CLERK_SECRET_KEY: 'sk_test_local',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_local',
    });
    print(
      `Existing ${path.relative(repoRoot, paymentEnvPath)} is valid; no key was rotated.`,
    );
    return;
  }

  const key = randomBytes(32).toString('base64');
  writeFileSync(
    paymentEnvPath,
    [
      '# Ignored local-only key for durable BarberApp physical QA.',
      '# Do not commit, print, or rotate while local encrypted credentials exist.',
      `PAYMENT_CREDENTIAL_ENCRYPTION_KEY=${key}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
  print(
    `Created ${path.relative(
      repoRoot,
      paymentEnvPath,
    )} with a valid local key (value not printed).`,
  );
}

function tail(filePath, lines = 18) {
  try {
    return readFileSync(filePath, 'utf8')
      .trimEnd()
      .split('\n')
      .slice(-lines)
      .join('\n');
  } catch {
    return '(log unavailable)';
  }
}

function processEnvironment(pid) {
  try {
    return Object.fromEntries(
      readFileSync(`/proc/${pid}/environ`, 'utf8')
        .split('\0')
        .filter(Boolean)
        .map((entry) => {
          const separator = entry.indexOf('=');
          return [entry.slice(0, separator), entry.slice(separator + 1)];
        }),
    );
  } catch {
    return {};
  }
}

async function httpReady(url, expectedText) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
      headers: { Accept: 'application/json,text/plain,text/html' },
    });
    const body = await response.text();
    return response.ok && (!expectedText || body.includes(expectedText));
  } catch {
    return false;
  }
}

async function physicalQaHandshakeReady(metadata) {
  try {
    const response = await fetch(`${metadata.urls.apiLocal}/api/v1/qa/runtime`, {
      signal: AbortSignal.timeout(3_000),
      headers: {
        Accept: 'application/json',
        'X-BarberApp-QA-Client': 'harness',
        'X-BarberApp-QA-Head': metadata.head,
        'X-BarberApp-QA-Runtime': metadata.runtime.id,
        'X-BarberApp-QA-Session': 'harness-status',
      },
    });
    const body = await response.json();
    return (
      response.ok
      && body?.data?.runtimeId === metadata.runtime.id
      && body?.data?.runtimeFingerprint === metadata.runtime.fingerprint
      && body?.data?.repositoryHead === metadata.head
      && body?.data?.physicalQaMode === true
    );
  } catch {
    return false;
  }
}

async function waitFor(label, check, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`Timed out waiting for ${label}.`);
}

function spawnService({ name, cwd, command, args, env, metadata }) {
  mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${name}.log`);
  writeFileSync(
    logPath,
    `[${new Date().toISOString()}] [harness] launching ${serviceLabels[name]}\n`,
    { mode: 0o600 },
  );
  const outputFd = openSync(logPath, 'a');
  const encodedArgs = Buffer.from(JSON.stringify(args)).toString('base64url');
  const child = spawn(
    process.execPath,
    [runnerPath, name, cwd, command, encodedArgs],
    {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', outputFd, outputFd],
    },
  );
  child.unref();
  closeSync(outputFd);

  const snapshot = processSnapshot(child.pid);
  if (!snapshot) fail(`Could not inspect new ${serviceLabels[name]} process.`);

  metadata.services[name] = {
    pid: child.pid,
    processGroupId: snapshot.groupId,
    startTime: snapshot.startTime,
    cwd,
    commandMarker: 'log-runner.mjs',
    command: [command, ...args],
    port: REQUIRED_PORTS[name],
    logPath: path.relative(repoRoot, logPath),
    publicEnvironment: sanitizeEnvironmentForMetadata(env),
  };
  writeMetadata(metadata);
}

function verifyServiceIdentity(record) {
  const rootSnapshot = processSnapshot(record.pid);
  const identity = verifyRecordedProcess(record, rootSnapshot);
  if (!identity.ok) return { ok: false, reason: identity.reason };

  const pids = listenerPids(record.port);
  const groups = new Map(
    pids.map((pid) => [pid, processSnapshot(pid)?.groupId]),
  );
  const occupant = classifyPortOccupant({
    listenerPids: pids,
    expectedProcessGroupId: record.processGroupId,
    processGroupByPid: groups,
  });

  return {
    ok: occupant === 'recorded-runtime' && isPortListening(record.port),
    reason:
      occupant === 'recorded-runtime' && isPortListening(record.port)
        ? null
        : occupant === 'free'
          ? `port ${record.port} is not listening`
          : `port ${record.port} was replaced by an unrelated process`,
    rootSnapshot,
    listenerPids: pids,
  };
}

async function collectStatus(metadata) {
  const serviceResults = {};
  const healthChecks = {
    api: () => httpReady(`${metadata.urls.apiLocal}/health`, '"status":"ok"'),
    publicWeb: () => httpReady(metadata.urls.publicBookingLocal, null),
    metro: () => httpReady(`${metadata.urls.metroLocal}/status`, 'running'),
  };

  for (const name of serviceOrder) {
    const record = metadata.services[name];
    if (!record) {
      serviceResults[name] = {
        identity: false,
        port: false,
        health: false,
        detail: 'not recorded',
      };
      continue;
    }
    const identity = verifyServiceIdentity(record);
    const environment = processEnvironment(record.pid);
    const expectedApiUrl = metadata.urls.apiBaseLan;
    const effectiveApiMatches =
      name === 'api' ||
      (name === 'publicWeb'
        ? environment.PUBLIC_WEB_API_URL === expectedApiUrl
        : environment.EXPO_PUBLIC_API_URL === expectedApiUrl);
    const effectiveTraceMatches =
      name === 'publicWeb'
      || (
        name === 'api'
          ? environment.PHYSICAL_QA_REQUEST_TRACE === 'true'
          : environment.EXPO_PUBLIC_PHYSICAL_QA_TRACE === 'true'
      );
    const effectiveRuntimeMatches =
      metadata.runtime?.id
      && (
        name === 'api'
          ? environment.PHYSICAL_QA_MODE === 'true'
            && environment.BARBERAPP_QA_RUNTIME_ID === metadata.runtime.id
            && environment.BARBERAPP_QA_RUNTIME_HEAD === metadata.head
          : name === 'publicWeb'
            ? environment.NEXT_PUBLIC_QA_RUNTIME_ID === metadata.runtime.id
            : environment.EXPO_PUBLIC_PHYSICAL_QA_MODE === 'true'
              && environment.EXPO_PUBLIC_QA_RUNTIME_ID === metadata.runtime.id
              && environment.EXPO_PUBLIC_QA_RUNTIME_HEAD === metadata.head
      );
    serviceResults[name] = {
      identity: identity.ok,
      port: identity.ok,
      health: identity.ok ? await healthChecks[name]() : false,
      effectiveApiMatches,
      effectiveTraceMatches,
      effectiveRuntimeMatches: Boolean(effectiveRuntimeMatches),
      detail: identity.reason,
    };
  }

  const summary = summarizeRuntimeReadiness(serviceResults);
  if (
    !Object.values(summary.services).every(
      (service) =>
        service.effectiveApiMatches
        && service.effectiveTraceMatches
        && service.effectiveRuntimeMatches,
    )
  ) {
    summary.ready = false;
  }
  return summary;
}

async function stopRecordedProcesses(metadata, { quiet = false } = {}) {
  if (!metadata) {
    if (!quiet) print('No physical-QA runtime metadata exists.');
    return;
  }

  for (const name of [...serviceOrder].reverse()) {
    const record = metadata.services?.[name];
    if (!record) continue;
    const identity = verifyRecordedProcess(record, processSnapshot(record.pid));
    if (!identity.ok) {
      if (!quiet) {
        print(
          `Skipped ${serviceLabels[name]} PID ${record.pid}: ${identity.reason}.`,
        );
      }
      continue;
    }
    try {
      process.kill(-record.processGroupId, 'SIGTERM');
      if (!quiet) print(`Sent SIGTERM to ${serviceLabels[name]}.`);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }

  const deadline = Date.now() + 10_000;
  while (
    Date.now() < deadline &&
    serviceOrder.some((name) => {
      const record = metadata.services?.[name];
      return record && processSnapshot(record.pid);
    })
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  for (const name of [...serviceOrder].reverse()) {
    const record = metadata.services?.[name];
    if (!record) continue;
    const identity = verifyRecordedProcess(record, processSnapshot(record.pid));
    if (identity.ok) {
      process.kill(-record.processGroupId, 'SIGKILL');
      if (!quiet) print(`Forced ${serviceLabels[name]} to stop after timeout.`);
    }
  }
}

async function start() {
  ensureRepoRoot();
  const truth = currentGitTruth();
  printGitTruth(truth);

  const existing = readMetadata();
  if (existing) {
    const existingStatus = await collectStatus(existing);
    if (existingStatus.ready) {
      print('Physical-QA runtime is already ready; reusing it.');
      printUrls(existing);
      return;
    }
    await stopRecordedProcesses(existing, { quiet: true });
    rmSync(metadataPath, { force: true });
  }

  assertTooling();
  if (!existsSync(paymentEnvPath)) {
    fail(
      `Missing ${path.relative(
        repoRoot,
        paymentEnvPath,
      )}. Run \`npm run qa:physical:configure\` once.`,
    );
  }

  const env = loadRuntimeEnvironment();
  const { database } = validatePhysicalQaEnvironment(env);
  assertSharedDatabase(env, database);
  assertPortsFree();

  const lanIp = resolveLanIp();
  const apiBaseLan = `http://${lanIp}:${REQUIRED_PORTS.api}/api/v1`;
  const startedAt = new Date().toISOString();
  const runtimeIdentity = createPhysicalQaRuntimeIdentity();
  const mobileEventsPath = path.join(
    mobileEventsDir,
    `${runtimeIdentity.id}.ndjson`,
  );
  const metadata = createRuntimeMetadata({
    repositoryPath: repoRoot,
    branch: truth.branch,
    head: truth.head,
    lanIp,
    database,
    services: {},
    startedAt,
    runtimeIdentity,
    mobileEventsPath: path.relative(repoRoot, mobileEventsPath),
  });

  mkdirSync(logsDir, { recursive: true });
  mkdirSync(mobileEventsDir, { recursive: true, mode: 0o700 });
  writeFileSync(mobileEventsPath, '', { mode: 0o600, flag: 'wx' });
  try {
    const apiEnv = {
      ...env,
      NODE_ENV: 'development',
      PHYSICAL_QA_MODE: 'true',
      PHYSICAL_QA_REQUEST_TRACE: 'true',
      BARBERAPP_QA_RUNTIME_ID: runtimeIdentity.id,
      BARBERAPP_QA_RUNTIME_FINGERPRINT: runtimeIdentity.fingerprint,
      BARBERAPP_QA_RUNTIME_HEAD: truth.head,
      BARBERAPP_QA_RUNTIME_STARTED_AT: startedAt,
      BARBERAPP_QA_MOBILE_EVENTS_PATH: mobileEventsPath,
      PORT: String(REQUIRED_PORTS.api),
      PUBLIC_WEB_BASE_URL: `http://${lanIp}:${REQUIRED_PORTS.publicWeb}`,
    };
    spawnService({
      name: 'api',
      cwd: apiRoot,
      command: 'npx',
      args: ['tsx', 'watch', 'src/index.ts'],
      env: apiEnv,
      metadata,
    });
    await waitFor('API health', async () => {
      const record = metadata.services.api;
      if (!processSnapshot(record.pid)) {
        fail(`API exited during startup:\n${tail(path.join(repoRoot, record.logPath))}`);
      }
      return (
        (await httpReady(`${metadata.urls.apiLocal}/health`, '"status":"ok"')) &&
        (await httpReady(`${metadata.urls.apiLocal}/api/v1/ping`, '"pong"'))
      );
    });

    const publicEnv = {
      ...env,
      NODE_ENV: 'development',
      PORT: String(REQUIRED_PORTS.publicWeb),
      PUBLIC_WEB_API_URL: apiBaseLan,
      NEXT_PUBLIC_QA_RUNTIME_ID: runtimeIdentity.id,
    };
    spawnService({
      name: 'publicWeb',
      cwd: publicWebRoot,
      command: 'npm',
      args: ['run', 'dev', '--', '--hostname', '0.0.0.0'],
      env: publicEnv,
      metadata,
    });
    await waitFor('public booking page', async () => {
      const record = metadata.services.publicWeb;
      if (!processSnapshot(record.pid)) {
        fail(
          `Public web exited during startup:\n${tail(path.join(repoRoot, record.logPath))}`,
        );
      }
      return httpReady(metadata.urls.publicBookingLocal, null);
    });

    const metroEnv = {
      ...env,
      NODE_ENV: 'development',
      EXPO_PUBLIC_API_URL: apiBaseLan,
      EXPO_PUBLIC_PHYSICAL_QA_MODE: 'true',
      EXPO_PUBLIC_PHYSICAL_QA_TRACE: 'true',
      EXPO_PUBLIC_QA_RUNTIME_ID: runtimeIdentity.id,
      EXPO_PUBLIC_QA_RUNTIME_FINGERPRINT: runtimeIdentity.fingerprint,
      EXPO_PUBLIC_QA_RUNTIME_HEAD: truth.head,
      EXPO_PUBLIC_QA_RUNTIME_STARTED_AT: startedAt,
    };
    spawnService({
      name: 'metro',
      cwd: mobileRoot,
      command: 'npx',
      args: [
        'expo',
        'start',
        '--lan',
        '--clear',
        '--port',
        String(REQUIRED_PORTS.metro),
      ],
      env: metroEnv,
      metadata,
    });
    await waitFor('Metro', async () => {
      const record = metadata.services.metro;
      if (!processSnapshot(record.pid)) {
        fail(
          `Metro exited during startup:\n${tail(path.join(repoRoot, record.logPath))}`,
        );
      }
      return httpReady(`${metadata.urls.metroLocal}/status`, 'running');
    });

    await waitFor(
      'LAN API health',
      () => httpReady(`${metadata.urls.apiLan}/health`, '"status":"ok"'),
      30_000,
    );
    await waitFor(
      'physical-QA API handshake',
      () => physicalQaHandshakeReady(metadata),
      30_000,
    );
    await waitFor(
      'LAN public booking page',
      () => httpReady(metadata.urls.publicBookingLan, null),
      30_000,
    );
    await waitFor(
      'LAN Metro',
      () => httpReady(`${metadata.urls.metroLan}/status`, 'running'),
      30_000,
    );

    metadata.readyAt = new Date().toISOString();
    writeMetadata(metadata);
    const ready = await collectStatus(metadata);
    if (!ready.ready) {
      fail(
        `Runtime failed its final status inspection:\n${JSON.stringify(
          ready.services,
          null,
          2,
        )}`,
      );
    }

    print('Physical-QA runtime: READY');
    printUrls(metadata, { includeQr: true });
  } catch (error) {
    await stopRecordedProcesses(metadata, { quiet: true });
    rmSync(metadataPath, { force: true });
    throw error;
  }
}

function printUrls(metadata, { includeQr = false } = {}) {
  print(
    `Runtime fingerprint: ${metadata.runtime?.fingerprint ?? '(legacy runtime)'}`,
  );
  print(`Runtime HEAD: ${metadata.head.slice(0, 7)}`);
  print(`API local: ${metadata.urls.apiLocal}`);
  print(`API LAN: ${metadata.urls.apiLan}`);
  print(`Public local: ${metadata.urls.publicBookingLocal}`);
  print(`Public LAN: ${metadata.urls.publicBookingLan}`);
  print(`Expo Go: ${metadata.urls.expo}`);
  if (includeQr) {
    print(
      `Scan this Expo LAN QR for runtime ${metadata.runtime.fingerprint}:`,
    );
    qrcode.generate(metadata.urls.expo, { small: true }, (code) => {
      print(code.trimEnd());
    });
  }
  print(`Logs: ${path.relative(repoRoot, logsDir)}/{api,publicWeb,metro}.log`);
  print('Tail logs: tail -f .qa-runtime/logs/*.log');
  print('Status: npm run qa:physical:status');
  print('Device: npm run qa:physical:device');
  print('QA readiness: npm run qa:physical:ready');
  print('Stop: npm run qa:physical:stop');
  print(
    `Open the newly started Expo project; only the badge "QA ${metadata.head.slice(
      0,
      7,
    )} · ${metadata.runtime?.fingerprint ?? 'UNKNOWN'}" belongs to this runtime.`,
  );
}

async function status() {
  ensureRepoRoot();
  const metadata = readMetadata();
  if (!metadata) {
    print('Physical-QA runtime: NOT READY (no runtime metadata)');
    process.exitCode = 1;
    return;
  }

  const truth = currentGitTruth();
  const summary = await collectStatus(metadata);
  const processChecks = Object.fromEntries(
    Object.entries(summary.services).map(([name, service]) => [
      name,
      { ok: service.identity },
    ]),
  );
  const stale = isRuntimeMetadataStale({
    metadata,
    currentRepoRoot: repoRoot,
    currentHead: truth.head,
    processChecks,
  });

  print(`Physical-QA runtime: ${summary.ready && !stale ? 'READY' : 'NOT READY'}`);
  print(`Recorded: ${metadata.branch} @ ${metadata.head.slice(0, 7)}`);
  print(`Current: ${truth.branch} @ ${truth.shortHead}`);
  print(`Started: ${metadata.startedAt}`);
  print(`Ready: ${metadata.readyAt ?? '(never)'}`);
  print(`Metadata stale: ${stale ? 'yes' : 'no'}`);
  print(`Database: ${metadata.database}`);
  print(`LAN IP: ${metadata.lanIp}`);
  print(
    `Runtime fingerprint: ${metadata.runtime?.fingerprint ?? '(legacy runtime)'}`,
  );

  for (const name of serviceOrder) {
    const record = metadata.services[name];
    const result = summary.services[name];
    print(
      `${serviceLabels[name]}: PID ${record?.pid ?? '-'} | identity ${
        result.identity ? 'ok' : 'failed'
      } | port ${result.port ? 'listening' : 'down'} | readiness ${
        result.health ? 'ok' : 'failed'
      } | API target ${result.effectiveApiMatches ? 'current' : 'wrong'}`,
    );
    if (!result.effectiveTraceMatches) {
      print('  required physical-QA tracing is disabled');
    }
    if (!result.effectiveRuntimeMatches) {
      print('  physical-QA runtime identity is missing or stale');
    }
    if (!result.ready) {
      if (result.detail) print(`  ${result.detail}`);
      if (record?.logPath) {
        print(`  recent log:\n${tail(path.join(repoRoot, record.logPath))}`);
      }
    }
  }
  printUrls(metadata);
  print(
    `Mobile mutation trace: ${
      metadata.services.metro?.publicEnvironment?.EXPO_PUBLIC_PHYSICAL_QA_TRACE === 'true'
        ? 'enabled'
        : 'disabled'
    }`,
  );
  print(
    `API request trace: ${
      metadata.services.api?.publicEnvironment?.PHYSICAL_QA_REQUEST_TRACE === 'true'
        ? 'enabled'
        : 'disabled'
    }`,
  );

  if (!summary.ready || stale) process.exitCode = 1;
}

function collectDeviceReadiness(metadata, now = Date.now()) {
  const eventsPath = metadata.runtime?.mobileEventsPath
    ? path.join(repoRoot, metadata.runtime.mobileEventsPath)
    : null;
  const events =
    eventsPath && existsSync(eventsPath)
      ? parseNdjsonRecords(readFileSync(eventsPath, 'utf8'))
      : [];
  const apiLogPath = metadata.services?.api?.logPath
    ? path.join(repoRoot, metadata.services.api.logPath)
    : null;
  const mismatchEvents =
    apiLogPath && existsSync(apiLogPath)
      ? parsePhysicalQaRuntimeMismatches(readFileSync(apiLogPath, 'utf8'))
      : [];
  return summarizeDeviceReadiness({
    metadata,
    events,
    mismatchEvents,
    now,
  });
}

function printDeviceReadiness(result) {
  print(`Physical-QA device: ${result.classification}`);
  print(`Runtime fingerprint: ${result.runtimeFingerprint ?? '(none)'}`);
  print(
    `App runtime fingerprint: ${result.appRuntimeFingerprint ?? '(none)'}`,
  );
  print(`App session: ${maskIdentifier(result.appSessionId) ?? '(none)'}`);
  print(
    `Heartbeat last seen: ${result.lastHeartbeatAt ?? '(none)'}`,
  );
  print(
    `Heartbeat age: ${
      result.heartbeatAgeMs === null
        ? '(none)'
        : `${Math.round(result.heartbeatAgeMs / 1000)}s`
    }`,
  );
  print(`App HEAD: ${result.appHead?.slice(0, 7) ?? '(none)'}`);
  print(`API HEAD: ${result.apiHead?.slice(0, 7) ?? '(none)'}`);
  print(`App API target: ${result.apiTarget ?? '(none)'}`);
  print(`Handshake: ${result.handshakeStatus}`);
  print(`Last focused screen: ${result.lastFocusedScreen ?? '(none)'}`);
  print(`Trace transport: ${result.traceEnabled ? 'enabled' : 'not proven'}`);
  print(
    `Current runtime session: ${result.ready ? 'verified' : 'not verified'}`,
  );
}

async function requireCurrentRuntime() {
  const metadata = readMetadata();
  if (!metadata) {
    fail('Start the physical-QA runtime first.');
  }
  const truth = currentGitTruth();
  const summary = await collectStatus(metadata);
  const processChecks = Object.fromEntries(
    Object.entries(summary.services).map(([name, service]) => [
      name,
      { ok: service.identity },
    ]),
  );
  const stale = isRuntimeMetadataStale({
    metadata,
    currentRepoRoot: repoRoot,
    currentHead: truth.head,
    processChecks,
  });
  if (!summary.ready || stale) {
    fail('Physical-QA server runtime is not current and READY.');
  }
  return { metadata, truth, summary };
}

async function device() {
  ensureRepoRoot();
  const { metadata } = await requireCurrentRuntime();
  const result = collectDeviceReadiness(metadata);
  printDeviceReadiness(result);
  if (!result.ready) process.exitCode = 1;
}

async function ready() {
  ensureRepoRoot();
  let runtime;
  try {
    runtime = await requireCurrentRuntime();
  } catch (error) {
    print('Physical-QA combined readiness: NOT READY');
    print('Runtime: RUNTIME_NOT_READY');
    print('Device: DEVICE_NOT_CONNECTED');
    throw error;
  }
  print('Runtime: RUNTIME_READY');
  const deviceResult = collectDeviceReadiness(runtime.metadata);
  print(`Device: ${deviceResult.classification}`);
  print(
    `Physical-QA combined readiness: ${
      deviceResult.ready ? 'QA_READY' : 'NOT READY'
    }`,
  );
  if (!deviceResult.ready) process.exitCode = 1;
}

async function stop() {
  ensureRepoRoot();
  const metadata = readMetadata();
  await stopRecordedProcesses(metadata);
  rmSync(metadataPath, { force: true });

  let unexpected = false;
  for (const [name, port] of Object.entries(REQUIRED_PORTS)) {
    const pids = listenerPids(port);
    if (pids.length || isPortListening(port)) {
      unexpected = true;
      print(
        `WARNING: port ${port} (${serviceLabels[name]}) still has an unexpected listener: ${pids
          .map(describePid)
          .join('; ')}`,
      );
    } else {
      print(`Port ${port}: free`);
    }
  }
  print('Shared PostgreSQL 5432 was left untouched.');
  if (unexpected) process.exitCode = 1;
}

function parseSnapshotOptions(args) {
  const options = {
    barbershop: 'qa-barbershop',
    phoneSuffixes: [],
    limit: 25,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];
    if (value === '--barbershop' && next) {
      options.barbershop = next;
      index += 1;
    } else if (value === '--phone-suffix' && next) {
      if (!/^\d{2,6}$/u.test(next)) {
        fail('--phone-suffix must contain 2 to 6 digits.');
      }
      options.phoneSuffixes.push(next);
      index += 1;
    } else if (value === '--limit' && next) {
      options.limit = Math.max(1, Math.min(Number(next) || 25, 100));
      index += 1;
    } else {
      fail(`Unknown snapshot option: ${value}`);
    }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(options.barbershop)) {
    fail('--barbershop must be a safe public slug.');
  }
  return options;
}

async function snapshot(args) {
  ensureRepoRoot();
  const metadata = readMetadata();
  if (!metadata) fail('Start the physical-QA runtime before taking a snapshot.');
  const ready = await collectStatus(metadata);
  if (!ready.ready) fail('Physical-QA runtime is not ready; snapshot refused.');

  const env = loadRuntimeEnvironment();
  const { database } = validatePhysicalQaEnvironment(env);
  if (database.sanitized !== metadata.database) {
    fail('Runtime and snapshot database targets do not match.');
  }
  const options = parseSnapshotOptions(args);
  process.env.DATABASE_URL = env.DATABASE_URL;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });

  try {
    const shop = await prisma.barbershop.findUnique({
      where: { publicSlug: options.barbershop },
      select: {
        id: true,
        publicSlug: true,
        name: true,
        isActive: true,
        updatedAt: true,
        loyaltyProgram: {
          select: {
            isEnabled: true,
            visitsRequired: true,
            rewardValidityDays: true,
            createdAt: true,
            updatedAt: true,
            rewardPromotion: {
              select: {
                name: true,
                discountType: true,
                fixedDiscountCents: true,
                percentageBasisPoints: true,
                isActive: true,
                startsAt: true,
                endsAt: true,
              },
            },
          },
        },
        _count: {
          select: {
            employees: true,
            services: true,
            customers: true,
            promotions: true,
          },
        },
      },
    });
    if (!shop) fail(`Barbershop slug "${options.barbershop}" was not found.`);

    const customerWhere = {
      barbershopId: shop.id,
      deletedAt: null,
      ...(options.phoneSuffixes.length
        ? {
            OR: options.phoneSuffixes.map((suffix) => ({
              phoneNormalized: { endsWith: suffix },
            })),
          }
        : {}),
    };
    const customers = await prisma.customer.findMany({
      where: customerWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: options.limit,
      select: {
        id: true,
        phoneNormalized: true,
        firstSeenAt: true,
        lastSeenAt: true,
        updatedAt: true,
        loyaltySummary: {
          select: {
            currentStampCount: true,
            lifetimeEligibleVisits: true,
            availableRewardCount: true,
            lastEarnedAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const [appointmentCounts, rewardCounts, ledgerCounts, redemptionCounts] =
      await Promise.all([
        prisma.appointment.groupBy({
          by: ['status'],
          where: { barbershopId: shop.id, deletedAt: null },
          _count: { _all: true },
        }),
        prisma.loyaltyReward.groupBy({
          by: ['status'],
          where: { barbershopId: shop.id },
          _count: { _all: true },
        }),
        prisma.loyaltyLedgerEvent.groupBy({
          by: ['eventType'],
          where: { barbershopId: shop.id },
          _count: { _all: true },
        }),
        prisma.promotionRedemption.groupBy({
          by: ['status'],
          where: { barbershopId: shop.id },
          _count: { _all: true },
        }),
      ]);

    const customerIds = customers.map((customer) => customer.id);
    const [recentAppointments, recentRewards, recentLedger] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          barbershopId: shop.id,
          deletedAt: null,
          ...(customerIds.length ? { customerId: { in: customerIds } } : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: options.limit,
        select: {
          id: true,
          customerId: true,
          publicReference: true,
          status: true,
          startAt: true,
          completedAt: true,
          updatedAt: true,
        },
      }),
      prisma.loyaltyReward.findMany({
        where: {
          barbershopId: shop.id,
          ...(customerIds.length ? { customerId: { in: customerIds } } : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: options.limit,
        select: {
          id: true,
          customerId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          redeemedAt: true,
          updatedAt: true,
        },
      }),
      prisma.loyaltyLedgerEvent.findMany({
        where: {
          barbershopId: shop.id,
          ...(customerIds.length ? { customerId: { in: customerIds } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: options.limit,
        select: {
          id: true,
          customerId: true,
          eventType: true,
          stampDelta: true,
          rewardDelta: true,
          actorRole: true,
          createdAt: true,
        },
      }),
    ]);

    const report = {
      version: 1,
      capturedAt: new Date().toISOString(),
      runtime: {
        readyAt: metadata.readyAt,
        head: metadata.head,
        database: metadata.database,
        apiBaseUrl: metadata.urls.apiBaseLan,
      },
      filters: {
        barbershop: options.barbershop,
        phoneSuffixes: options.phoneSuffixes.map((suffix) => `***${suffix}`),
        limit: options.limit,
      },
      barbershop: {
        id: maskIdentifier(shop.id),
        publicSlug: shop.publicSlug,
        name: shop.name,
        isActive: shop.isActive,
        updatedAt: shop.updatedAt,
        fixtures: shop._count,
      },
      loyaltyProgram: shop.loyaltyProgram,
      counts: {
        appointments: Object.fromEntries(
          appointmentCounts.map((row) => [row.status, row._count._all]),
        ),
        rewards: Object.fromEntries(
          rewardCounts.map((row) => [row.status, row._count._all]),
        ),
        ledgerEvents: Object.fromEntries(
          ledgerCounts.map((row) => [row.eventType, row._count._all]),
        ),
        promotionRedemptions: Object.fromEntries(
          redemptionCounts.map((row) => [row.status, row._count._all]),
        ),
      },
      customers: boundRecords(customers, options.limit).map((customer) => ({
        id: maskIdentifier(customer.id),
        phone: maskPhone(customer.phoneNormalized),
        firstSeenAt: customer.firstSeenAt,
        lastSeenAt: customer.lastSeenAt,
        updatedAt: customer.updatedAt,
        loyaltySummary: customer.loyaltySummary,
      })),
      recent: {
        appointments: recentAppointments.map((appointment) => ({
          ...appointment,
          id: maskIdentifier(appointment.id),
          customerId: maskIdentifier(appointment.customerId),
          publicReference: maskIdentifier(appointment.publicReference),
        })),
        rewards: recentRewards.map((reward) => ({
          ...reward,
          id: maskIdentifier(reward.id),
          customerId: maskIdentifier(reward.customerId),
        })),
        ledgerEvents: recentLedger.map((event) => ({
          ...event,
          id: maskIdentifier(event.id),
          customerId: maskIdentifier(event.customerId),
        })),
      },
    };

    mkdirSync(snapshotsDir, { recursive: true });
    const timestamp = report.capturedAt.replaceAll(':', '-');
    const outputPath = path.join(
      snapshotsDir,
      `${timestamp}-${options.barbershop}-loyalty.json`,
    );
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
    print(`Snapshot: ${path.relative(repoRoot, outputPath)}`);
    print(`Database: ${metadata.database}`);
    print(
      `Loyalty threshold: ${shop.loyaltyProgram?.visitsRequired ?? 'not configured'}`,
    );
    print(`Customers included: ${customers.length} (limit ${options.limit})`);
    print(
      `Loyalty totals: summaries ${customers.filter((c) => c.loyaltySummary).length}, rewards ${Object.values(
        report.counts.rewards,
      ).reduce((sum, value) => sum + value, 0)}, ledger events ${Object.values(
        report.counts.ledgerEvents,
      ).reduce((sum, value) => sum + value, 0)}`,
    );
    return { outputPath, report };
  } finally {
    await prisma.$disconnect();
  }
}

async function arm(action, args) {
  ensureRepoRoot();
  if (action !== 'loyalty-program-save') {
    fail('Only the `loyalty-program-save` checkpoint is supported.');
  }

  const { metadata } = await requireCurrentRuntime();
  const deviceResult = collectDeviceReadiness(metadata);
  if (!deviceResult.ready) {
    printDeviceReadiness(deviceResult);
    fail(
      `Checkpoint arming refused: ${deviceResult.classification}. Connect and verify the current phone runtime first.`,
    );
  }

  const checkpointStartedAt = new Date().toISOString();
  const snapshotResult = await snapshot(args);
  const armedAt = new Date().toISOString();
  const checkpointId = `checkpoint-${randomBytes(8).toString('hex')}`;
  const runtimeCheckpointDir = path.join(
    checkpointsDir,
    metadata.runtime.id,
  );
  mkdirSync(runtimeCheckpointDir, { recursive: true, mode: 0o700 });
  const checkpoint = buildPhysicalQaCheckpoint({
    action,
    metadata,
    deviceReadiness: deviceResult,
    checkpointId,
    checkpointStartedAt,
    armedAt,
    beforeSnapshot: path.relative(repoRoot, snapshotResult.outputPath),
  });
  const outputPath = path.join(
    runtimeCheckpointDir,
    `${armedAt.replaceAll(':', '-')}-${action}.json`,
  );
  writeFileSync(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    mode: 0o600,
  });
  const latestPath = path.join(runtimeCheckpointDir, `latest-${action}.json`);
  const temporaryLatestPath = `${latestPath}.tmp`;
  writeFileSync(
    temporaryLatestPath,
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    { mode: 0o600 },
  );
  renameSync(temporaryLatestPath, latestPath);

  print(`Physical-QA checkpoint: ARMED`);
  print(`Checkpoint: ${checkpointId}`);
  print(`Runtime fingerprint: ${metadata.runtime.fingerprint}`);
  print(`App session: ${maskIdentifier(deviceResult.appSessionId)}`);
  print(`Armed at: ${armedAt}`);
  print(`Before snapshot: ${path.relative(repoRoot, snapshotResult.outputPath)}`);
  print(
    'One action only: keep the Android keyboard open, tap Save loyalty program once, then stop.',
  );
}

function readLatestCheckpoint(metadata, action) {
  const checkpointPath = path.join(
    checkpointsDir,
    metadata.runtime.id,
    `latest-${action}.json`,
  );
  if (!existsSync(checkpointPath)) return null;
  try {
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    if (
      checkpoint.runtimeId !== metadata.runtime.id
      || checkpoint.runtimeHead !== metadata.head
      || checkpoint.action !== action
    ) {
      return null;
    }
    return { ...checkpoint, path: checkpointPath };
  } catch {
    return null;
  }
}

async function evidence(domain, args) {
  ensureRepoRoot();
  if (domain !== 'mobile-action') {
    fail('Only `evidence mobile-action <action>` is supported.');
  }

  const [action, ...optionArgs] = args;
  if (action !== 'loyalty-program-save') {
    fail('Only the `loyalty-program-save` mobile action is supported.');
  }

  const { metadata } = await requireCurrentRuntime();

  const options = parseSnapshotOptions(optionArgs);
  const env = loadRuntimeEnvironment();
  const { database } = validatePhysicalQaEnvironment(env);
  if (database.sanitized !== metadata.database) {
    fail('Runtime and evidence database targets do not match.');
  }

  process.env.DATABASE_URL = env.DATABASE_URL;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });

  try {
    const shop = await prisma.barbershop.findUnique({
      where: { publicSlug: options.barbershop },
      select: {
        loyaltyProgram: {
          select: {
            isEnabled: true,
            visitsRequired: true,
            rewardValidityDays: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!shop) fail(`Barbershop slug "${options.barbershop}" was not found.`);

    const apiLog = readFileSync(
      path.join(repoRoot, metadata.services.api.logPath),
      'utf8',
    );
    const deviceResult = collectDeviceReadiness(metadata);
    const checkpoint = readLatestCheckpoint(metadata, action);
    if (deviceResult.ready && !checkpoint) {
      fail(
        `No current checkpoint is armed. Run \`npm run qa:physical:arm -- ${action}\` first.`,
      );
    }
    const persistedEvents = parseNdjsonRecords(
      readFileSync(
        path.join(repoRoot, metadata.runtime.mobileEventsPath),
        'utf8',
      ),
    );
    const boundary = checkpoint ? Date.parse(checkpoint.armedAt) : 0;
    const mobileEvents = persistedEvents.filter(
      (event) =>
        event.eventType === 'mutation_stage'
        && event.action === action
        && Date.parse(event.receivedAt ?? event.timestamp) >= boundary
        && (
          !checkpoint
          || event.appSessionId === checkpoint.appSessionId
        ),
    );
    const apiRequests = parseApiQaRequests(apiLog);
    const result = summarizeMobileActionEvidence({
      action,
      mobileEvents,
      apiRequests,
      loyaltyProgram: shop.loyaltyProgram,
      deviceReadiness: deviceResult,
    });
    const capturedAt = new Date().toISOString();
    const report = {
      version: 2,
      capturedAt,
      classification: result.classification,
      action,
      runtime: {
        fingerprint: metadata.runtime.fingerprint,
        head: metadata.head,
        readyAt: metadata.readyAt,
      },
      device: {
        classification: deviceResult.classification,
        appSession: maskIdentifier(deviceResult.appSessionId),
        appHead: deviceResult.appHead,
        appRuntimeFingerprint: deviceResult.appRuntimeFingerprint,
        lastHeartbeatAt: deviceResult.lastHeartbeatAt,
        heartbeatAgeMs: deviceResult.heartbeatAgeMs,
        lastFocusedScreen: deviceResult.lastFocusedScreen,
        apiTarget: deviceResult.apiTarget,
        handshakeStatus: deviceResult.handshakeStatus,
        traceEnabled: deviceResult.traceEnabled,
      },
      checkpoint: checkpoint
        ? {
            checkpointId: checkpoint.checkpointId,
            armedAt: checkpoint.armedAt,
            beforeSnapshot: checkpoint.beforeSnapshot,
          }
        : null,
      attemptId: result.attemptId,
      mobileStages: result.mobileEvents.map((event) => ({
        timestamp: event.timestamp,
        receivedAt: event.receivedAt,
        stage: event.stage,
        status: event.status,
        safeErrorCategory: event.safeErrorCategory,
        visitsRequired: event.visitsRequired,
      })),
      apiRequest: result.apiRequest,
      authoritativeLoyalty: shop.loyaltyProgram,
      expectedVisitsRequired: result.expectedVisitsRequired,
    };
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
    const outputPath = path.join(
      evidenceDir,
      `${capturedAt.replaceAll(':', '-')}-${action}.json`,
    );
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });

    print(`Physical-QA evidence: ${result.classification}`);
    print(`Action: ${action}`);
    print(`Runtime: ${metadata.branch} @ ${metadata.head.slice(0, 7)} (READY)`);
    print(`Captured: ${capturedAt}`);
    print(`Evidence report: ${path.relative(repoRoot, outputPath)}`);
    print(`Runtime fingerprint: ${metadata.runtime.fingerprint}`);
    print(`Device: ${deviceResult.classification}`);
    print(`App session: ${maskIdentifier(deviceResult.appSessionId) ?? '(none)'}`);
    print(`App HEAD: ${deviceResult.appHead?.slice(0, 7) ?? '(none)'}`);
    print(`Last heartbeat: ${deviceResult.lastHeartbeatAt ?? '(none)'}`);
    print(`Last focused screen: ${deviceResult.lastFocusedScreen ?? '(none)'}`);
    print(
      `Checkpoint: ${checkpoint?.checkpointId ?? '(not armed)'}`,
    );
    print(`Attempt: ${result.attemptId ?? '(none)'}`);
    print(
      `Mobile stages: ${
        result.mobileEvents.length
          ? result.mobileEvents.map((event) => event.stage).join(' -> ')
          : '(none)'
      }`,
    );
    print(
      `API request: ${
        result.apiRequest
          ? `${result.apiRequest.method} ${result.apiRequest.route} -> ${result.apiRequest.status}`
          : '(none)'
      }`,
    );
    print(
      `Authoritative loyalty: threshold ${
        shop.loyaltyProgram?.visitsRequired ?? '(not configured)'
      } | updated ${
        shop.loyaltyProgram?.updatedAt?.toISOString?.()
          ?? shop.loyaltyProgram?.updatedAt
          ?? '(not configured)'
      }`,
    );
    print(
      `Expected traced threshold: ${
        result.expectedVisitsRequired ?? '(none)'
      }`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function usage() {
  print(`Usage: node scripts/physical-qa.mjs <command>

Commands:
  configure              Create the ignored local payment-key file once
  start                  Validate and start API, public web, and Metro
  status                 Prove recorded processes, ports, health, and targets
  device                 Require a recent matching mobile handshake and heartbeat
  ready                  Require both server runtime READY and DEVICE_READY
  arm loyalty-program-save [...]
                         Snapshot and arm one device-verified checkpoint
  stop                   Stop only identity-verified recorded process groups
  snapshot loyalty [...] Capture bounded read-only loyalty evidence
  evidence mobile-action loyalty-program-save [...]
                         Correlate mobile, API, runtime, and database evidence
`);
}

async function main() {
  const [command, domain, ...args] = process.argv.slice(2);
  switch (command) {
    case 'configure':
      configure();
      break;
    case 'start':
      await start();
      break;
    case 'status':
      await status();
      break;
    case 'device':
      await device();
      break;
    case 'ready':
      await ready();
      break;
    case 'arm':
      await arm(domain, args);
      break;
    case 'stop':
      await stop();
      break;
    case 'snapshot':
      if (domain !== 'loyalty') fail('Only `snapshot loyalty` is supported.');
      await snapshot(args);
      break;
    case 'evidence':
      await evidence(domain, args);
      break;
    default:
      usage();
      process.exitCode = command ? 2 : 0;
  }
}

main().catch((error) => {
  process.stderr.write(
    `Physical-QA command failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
