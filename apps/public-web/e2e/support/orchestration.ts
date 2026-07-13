import { execFile, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { cleanupAllPublicBookingE2eFixtures } from '../../../api/tests/support/publicBookingE2eFixture';

const execFileAsync = promisify(execFile);

export const REPO_ROOT = path.resolve(__dirname, '../../../..');
export const API_ROOT = path.join(REPO_ROOT, 'apps', 'api');
export const PUBLIC_WEB_ROOT = path.join(REPO_ROOT, 'apps', 'public-web');
export const E2E_LOG_DIR = path.join(PUBLIC_WEB_ROOT, 'test-results', 'public-booking-e2e');
export const E2E_STATE_PATH = path.join(E2E_LOG_DIR, 'runtime-state.json');

export const TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/barberapp_test';

interface E2eRuntimeState {
  startedPostgresTest: boolean;
}

function ensureLogDir() {
  mkdirSync(E2E_LOG_DIR, { recursive: true });
}

function writeState(state: E2eRuntimeState) {
  ensureLogDir();
  writeFileSync(E2E_STATE_PATH, JSON.stringify(state), 'utf8');
}

export function readState(): E2eRuntimeState | null {
  try {
    return JSON.parse(readFileSync(E2E_STATE_PATH, 'utf8')) as E2eRuntimeState;
  } catch {
    return null;
  }
}

export function clearState() {
  rmSync(E2E_STATE_PATH, { force: true });
}

async function execRepoCommand(args: string[]) {
  return execFileAsync(args[0]!, args.slice(1), {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_TEST: TEST_DATABASE_URL,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_mock',
      CLERK_WEBHOOK_SECRET:
        process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock',
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: 'true',
    },
  });
}

export async function isPortListening(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({
      port,
      host: '127.0.0.1',
    });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });
  });
}

export async function assertPortFree(port: number, label: string) {
  if (await isPortListening(port)) {
    throw new Error(
      `Port ${port} is already in use, so ${label} cannot start safely.`
    );
  }
}

async function readDockerComposeService() {
  try {
    const { stdout } = await execRepoCommand([
      'docker',
      'compose',
      'ps',
      '--format',
      'json',
      'postgres_test',
    ]);

    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    return JSON.parse(lines[0]!) as {
      Service?: string;
      State?: string;
      Status?: string;
      Publishers?: Array<{ PublishedPort?: number }>;
    };
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
    'Port 5433 is already occupied, but it is not the repository postgres_test service.'
  );
}

async function waitFor5433Ready() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isPortListening(5433)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Timed out waiting for the isolated PostgreSQL test database on port 5433.');
}

export async function ensureTestDatabaseReady() {
  let startedPostgresTest = false;

  if (await isPortListening(5433)) {
    await ensureExisting5433IsRepoTestDb();
  } else {
    await execRepoCommand(['docker', 'compose', 'up', '-d', 'postgres_test']);
    startedPostgresTest = true;
  }

  await waitFor5433Ready();
  await applyTestMigrations();
  await cleanupAllPublicBookingE2eFixtures();

  writeState({ startedPostgresTest });
}

export async function applyTestMigrations() {
  await execRepoCommand([
    'npm',
    'run',
    'db:migrate:test',
    '--workspace',
    '@barberapp/api',
  ]);
}

export async function stopPostgresTestIfStarted() {
  const state = readState();

  if (!state?.startedPostgresTest) {
    return;
  }

  await execRepoCommand(['docker', 'compose', 'stop', 'postgres_test']);
}

export function getApiServerCommand() {
  ensureLogDir();
  const logPath = path.join(E2E_LOG_DIR, 'api-server.log');
  return `bash -lc "mkdir -p '${E2E_LOG_DIR}' && cd '${API_ROOT}' && DATABASE_URL='${TEST_DATABASE_URL}' DATABASE_URL_TEST='${TEST_DATABASE_URL}' CLERK_SECRET_KEY='${process.env.CLERK_SECRET_KEY ?? 'sk_test_mock'}' CLERK_WEBHOOK_SECRET='${process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock'}' NODE_ENV=test RATE_LIMIT_ENABLED=true PORT=3000 exec npx tsx src/index.ts > '${logPath}' 2>&1"`;
}

export function getNextServerCommand() {
  ensureLogDir();
  const logPath = path.join(E2E_LOG_DIR, 'next-server.log');
  return `bash -lc "mkdir -p '${E2E_LOG_DIR}' && cd '${PUBLIC_WEB_ROOT}' && export NODE_ENV=production PUBLIC_WEB_API_URL='http://127.0.0.1:3000/api/v1' PORT=3001 && (npm run build && exec npm run start) > '${logPath}' 2>&1"`;
}

export async function runPlaywrightCli(args: string[]) {
  const child = spawn('npx', ['playwright', 'test', ...args], {
    cwd: PUBLIC_WEB_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_TEST: TEST_DATABASE_URL,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_mock',
      CLERK_WEBHOOK_SECRET:
        process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock',
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: 'true',
      PUBLIC_WEB_API_URL: 'http://127.0.0.1:3000/api/v1',
    },
  });

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Playwright exited with code ${code ?? 'unknown'}.`));
    });
  });
}
