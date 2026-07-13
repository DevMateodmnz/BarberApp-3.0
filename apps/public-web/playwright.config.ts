import { defineConfig } from '@playwright/test';
import path from 'node:path';
import {
  getApiServerCommand,
  getNextServerCommand,
  PUBLIC_WEB_ROOT,
} from './e2e/support/orchestration';

const runtimeEnv = process.env as NodeJS.ProcessEnv;

runtimeEnv.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/barberapp_test';
runtimeEnv.DATABASE_URL_TEST =
  'postgresql://postgres:postgres@localhost:5433/barberapp_test';
runtimeEnv.CLERK_SECRET_KEY = runtimeEnv.CLERK_SECRET_KEY ?? 'sk_test_mock';
runtimeEnv.CLERK_WEBHOOK_SECRET =
  runtimeEnv.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock';
Object.assign(runtimeEnv, {
  NODE_ENV: 'test',
  RATE_LIMIT_ENABLED: 'true',
  PUBLIC_WEB_API_URL: 'http://127.0.0.1:3000/api/v1',
});

export default defineConfig({
  testDir: path.join(PUBLIC_WEB_ROOT, 'e2e'),
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  globalSetup: path.join(PUBLIC_WEB_ROOT, 'e2e', 'globalSetup.ts'),
  globalTeardown: path.join(PUBLIC_WEB_ROOT, 'e2e', 'globalTeardown.ts'),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: {
          width: 390,
          height: 844,
        },
      },
    },
  ],
  webServer: [
    {
      command: getApiServerCommand(),
      port: 3000,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: getNextServerCommand(),
      url: 'http://127.0.0.1:3001/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
