import { execFile, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const apiRoot = path.join(repoRoot, 'apps', 'api');
const publicWebRoot = path.join(repoRoot, 'apps', 'public-web');
const logDir = path.join(
  repoRoot,
  'apps',
  'public-web',
  'test-results',
  'public-booking-production-parity'
);
const apiLogPath = path.join(logDir, 'api-server.log');
const nextLogPath = path.join(logDir, 'next-server.log');
const fixtureKey = 'production-parity';
const testDatabaseUrl =
  'postgresql://postgres:postgres@localhost:5433/barberapp_test';

const baseEnv = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  DATABASE_URL_TEST: testDatabaseUrl,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_mock',
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock',
};

const apiEnv = {
  ...baseEnv,
  NODE_ENV: 'production',
  PORT: '3000',
};

const nextEnv = {
  ...baseEnv,
  NODE_ENV: 'production',
  PORT: '3001',
  PUBLIC_WEB_API_URL: 'http://127.0.0.1:3000/api/v1',
};

let startedPostgresTest = false;
let apiServer = null;
let nextServer = null;

function ensureLogDir() {
  mkdirSync(logDir, { recursive: true });
}

async function runPhase(name, command, args, env = baseEnv) {
  console.log(`\n>>> ${name}`);

  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: repoRoot,
    env,
  });

  if (stdout.trim()) {
    console.log(stdout.trim());
  }

  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port,
    });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => resolve(false));
  });
}

async function ensurePortFree(port, label) {
  if (await isPortListening(port)) {
    throw new Error(`Port ${port} is already in use, so ${label} cannot start safely.`);
  }
}

async function readDockerComposeService() {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['compose', 'ps', '--format', 'json', 'postgres_test'],
      {
        cwd: repoRoot,
        env: baseEnv,
      }
    );

    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    return JSON.parse(lines[0]);
  } catch {
    return null;
  }
}

async function ensureExisting5433IsRepoTestDb() {
  const service = await readDockerComposeService();

  if (
    service?.Service === 'postgres_test' &&
    service.State === 'running' &&
    service.Publishers?.some((publisher) => publisher.PublishedPort === 5433)
  ) {
    return;
  }

  throw new Error(
    'Port 5433 is already in use, but it is not the repository postgres_test service.'
  );
}

async function waitForPort(port, label, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortListening(port)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${label} on port ${port}.`);
}

async function waitForHttp(url, label, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
        },
      });

      if (response.status < 500) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

function readLogTail(filePath, lines = 40) {
  try {
    const content = readFileSync(filePath, 'utf8').trimEnd();
    if (!content) {
      return '(empty log)';
    }

    return content.split('\n').slice(-lines).join('\n');
  } catch {
    return '(log unavailable)';
  }
}

function spawnLoggedProcess(name, command, args, cwd, env, logPath) {
  ensureLogDir();
  rmSync(logPath, { force: true });
  const outputFd = openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', outputFd, outputFd],
  });

  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`${name} exited with code ${code}. See ${logPath}`);
    } else if (signal) {
      console.error(`${name} exited from signal ${signal}. See ${logPath}`);
    }
  });

  return child;
}

async function requestText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
    },
  });
  const body = await response.text();

  return {
    status: response.status,
    body,
    headers: response.headers,
  };
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  const body = await response.text();

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(
      `Expected JSON from ${url}, received status ${response.status} with body: ${body.slice(0, 400)}`
    );
  }

  return {
    status: response.status,
    payload,
  };
}

async function ensureTestDatabaseReady() {
  if (await isPortListening(5433)) {
    await ensureExisting5433IsRepoTestDb();
  } else {
    await runPhase(
      'Start isolated PostgreSQL test database',
      'docker',
      ['compose', 'up', '-d', 'postgres_test']
    );
    startedPostgresTest = true;
  }

  await waitForPort(5433, 'isolated PostgreSQL test database', 30_000);
}

async function stopPostgresTestIfStarted() {
  if (!startedPostgresTest) {
    return;
  }

  await runPhase(
    'Stop isolated PostgreSQL test database',
    'docker',
    ['compose', 'stop', 'postgres_test']
  );
}

async function cleanupFixture() {
  try {
    await runPhase(
      'Cleanup deterministic fixture',
      'npm',
      [
        'run',
        'fixture:public-booking:e2e',
        '--workspace',
        '@barberapp/api',
        '--',
        'cleanup',
        fixtureKey,
      ],
      baseEnv
    );
  } catch (error) {
    console.warn(`Fixture cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function provisionFixture() {
  const { stdout } = await execFileAsync(
    'npm',
    [
      'run',
      'fixture:public-booking:e2e',
      '--workspace',
      '@barberapp/api',
      '--',
      'setup',
      fixtureKey,
    ],
    {
      cwd: repoRoot,
      env: baseEnv,
    }
  );

  console.log(`\n>>> Provision deterministic fixture`);
  console.log(stdout.trim());

  return JSON.parse(stdout.trim().split('\n').at(-1));
}

async function startServers() {
  await ensurePortFree(3000, 'compiled API');
  await ensurePortFree(3001, 'Next production server');

  apiServer = spawnLoggedProcess(
    'compiled API',
    'npm',
    ['run', 'start', '--workspace', '@barberapp/api'],
    repoRoot,
    apiEnv,
    apiLogPath
  );
  await waitForHttp('http://127.0.0.1:3000/health', 'compiled API health check');

  nextServer = spawnLoggedProcess(
    'Next production server',
    'npm',
    ['run', 'start', '--workspace', '@barberapp/public-web'],
    repoRoot,
    nextEnv,
    nextLogPath
  );
  await waitForHttp('http://127.0.0.1:3001/', 'Next production server');
}

async function stopServer(child, name) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGINT');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5_000);
  });

  console.log(`Stopped ${name}.`);
}

function reportLogTails() {
  console.error('\n--- API log tail ---');
  console.error(readLogTail(apiLogPath));
  console.error('\n--- Next log tail ---');
  console.error(readLogTail(nextLogPath));
}

async function main() {
  await ensureTestDatabaseReady();
  await cleanupFixture();

  await runPhase('Apply isolated test migrations', 'npm', [
    'run',
    'db:migrate:test',
    '--workspace',
    '@barberapp/api',
  ]);
  const fixture = await provisionFixture();
  await runPhase('Prisma generate', 'npm', [
    'run',
    'db:generate',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('Clean API build output', 'npm', [
    'run',
    'clean',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('Clean public-web build output', 'bash', [
    '-lc',
    'rm -rf apps/public-web/.next',
  ]);
  await runPhase('Build compiled API', 'npm', [
    'run',
    'build',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase(
    'Build public web production bundle',
    'npm',
    ['run', 'build', '--workspace', '@barberapp/public-web'],
    nextEnv
  );

  await startServers();

  const bookingConfigResponse = await requestJson(
    `http://127.0.0.1:3001/api/public-booking/shops/${fixture.slug}/booking-config`
  );

  if (
    bookingConfigResponse.status !== 200 ||
    bookingConfigResponse.payload?.success !== true
  ) {
    throw new Error(
      `Expected booking-config BFF route to return 200 success, received ${bookingConfigResponse.status} ${JSON.stringify(
        bookingConfigResponse.payload
      )}`
    );
  }

  const pageResponse = await requestText(
    `http://127.0.0.1:3001/barberias/${fixture.slug}`
  );

  if (pageResponse.status !== 200) {
    throw new Error(
      `Expected public booking page to return 200, received ${pageResponse.status}.`
    );
  }

  if (pageResponse.body.includes('No pudimos cargar la agenda')) {
    throw new Error(
      'Public booking page rendered the safe fallback instead of the real booking shell.'
    );
  }

  if (
    !pageResponse.body.includes(fixture.shopName) ||
    !pageResponse.body.includes(fixture.expectedServiceName)
  ) {
    throw new Error(
      `Public booking page did not render expected fixture content for slug ${fixture.slug}.`
    );
  }

  console.log('\nProduction parity smoke passed.');
  console.log(`Fixture slug: ${fixture.slug}`);
  console.log(`Logs: ${logDir}`);
}

try {
  await main();
} catch (error) {
  reportLogTails();
  throw error;
} finally {
  await stopServer(nextServer, 'Next production server');
  await stopServer(apiServer, 'compiled API');
  await cleanupFixture();
  await stopPostgresTestIfStarted();
}
