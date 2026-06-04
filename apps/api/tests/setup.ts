// Test setup file for API
// This runs before each test file

import { vi } from 'vitest';

// Use test database on port 5433
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/barberapp_test';
process.env.DATABASE_URL_TEST = 'postgresql://postgres:postgres@localhost:5433/barberapp_test';
process.env.CLERK_SECRET_KEY = 'sk_test_mock';
process.env.NODE_ENV = 'test';

// Global test timeout
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 30000
});
