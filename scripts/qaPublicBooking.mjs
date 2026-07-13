import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const testDatabaseUrl =
  'postgresql://postgres:postgres@localhost:5433/barberapp_test';

const sharedEnv = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  DATABASE_URL_TEST: testDatabaseUrl,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_mock',
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock',
  NODE_ENV: 'test',
  PUBLIC_WEB_API_URL: 'http://127.0.0.1:3000/api/v1',
  RATE_LIMIT_ENABLED: 'true',
};

let startedPostgresTest = false;

async function runPhase(name, command, args, options = {}) {
  console.log(`\n>>> ${name}`);

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: sharedEnv,
      stdio: 'inherit',
      ...options,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${name} exited from signal ${signal}`
            : `${name} exited with code ${code ?? 'unknown'}`
        )
      );
    });
  });
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

async function readDockerComposeService() {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['compose', 'ps', '--format', 'json', 'postgres_test'],
      {
        cwd: repoRoot,
        env: sharedEnv,
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

async function waitFor5433Ready() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isPortListening(5433)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Timed out waiting for the isolated PostgreSQL test database on port 5433.');
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

  await waitFor5433Ready();
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

async function main() {
  await ensureTestDatabaseReady();

  await runPhase('Prisma format', 'npx', [
    'prisma',
    'format',
    '--schema=apps/api/prisma/schema.prisma',
  ]);
  await runPhase('Prisma validate', 'npx', [
    'prisma',
    'validate',
    '--schema=apps/api/prisma/schema.prisma',
  ]);
  await runPhase('Prisma generate', 'npm', [
    'run',
    'db:generate',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('Apply isolated test migrations', 'npm', [
    'run',
    'db:migrate:test',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('API typecheck', 'npm', [
    'run',
    'typecheck',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('API lint', 'npm', [
    'run',
    'lint',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('API unit tests', 'npm', [
    'run',
    'test:unit',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('API integration tests', 'npm', [
    'run',
    'test:integration',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('API database tests', 'npm', [
    'run',
    'test:db',
    '--workspace',
    '@barberapp/api',
  ]);
  await runPhase('Public web typecheck', 'npm', [
    'run',
    'typecheck',
    '--workspace',
    '@barberapp/public-web',
  ]);
  await runPhase('Public web lint', 'npm', [
    'run',
    'lint',
    '--workspace',
    '@barberapp/public-web',
  ]);
  await runPhase('Public web unit tests', 'npm', [
    'run',
    'test',
    '--workspace',
    '@barberapp/public-web',
  ]);
  await runPhase('Public web production build', 'npm', [
    'run',
    'build',
    '--workspace',
    '@barberapp/public-web',
  ]);
  await runPhase('Public booking Playwright E2E', 'npm', [
    'run',
    'test:e2e',
    '--workspace',
    '@barberapp/public-web',
  ]);
  await runPhase('Shared validation', 'npm', [
    'run',
    'typecheck',
    '--workspace',
    '@barberapp/shared',
  ]);
  await runPhase('Shared tests', 'npm', [
    'run',
    'test',
    '--workspace',
    '@barberapp/shared',
  ]);
  await runPhase('Mobile typecheck', 'npm', [
    'run',
    'typecheck',
    '--workspace',
    '@barberapp/mobile',
  ]);
  await runPhase('Mobile lint', 'npm', [
    'run',
    'lint',
    '--workspace',
    '@barberapp/mobile',
  ]);
  await runPhase('Mobile tests', 'npm', [
    'run',
    'test',
    '--workspace',
    '@barberapp/mobile',
  ]);
  await runPhase('Git diff hygiene', 'git', ['diff', '--check']);
}

try {
  await main();
} finally {
  await stopPostgresTestIfStarted();
}
