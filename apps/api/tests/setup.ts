// Test setup file for API
// This runs before each test file

import { vi } from 'vitest';

// Use test database on port 5433
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/barberapp_test';
process.env.DATABASE_URL_TEST = 'postgresql://postgres:postgres@localhost:5433/barberapp_test';
process.env.CLERK_SECRET_KEY = 'sk_test_mock';
process.env.CLERK_WEBHOOK_SECRET = 'whsec_zAGFhc4cWAj7K1SEE8cBGD9BYq/1DDyI8aFNVnifLGU=';
process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.MERCADO_PAGO_CLIENT_ID = 'test-client-id';
process.env.MERCADO_PAGO_CLIENT_SECRET = 'test-client-secret';
process.env.MERCADO_PAGO_REDIRECT_URI = 'http://localhost:3000/api/v1/payments/mercado-pago/oauth/callback';
process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PUBLIC_WEB_BASE_URL = 'http://localhost:3001';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_ENABLED = 'false';

// Global test timeout
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 30000
});
