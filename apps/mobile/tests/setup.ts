// Test setup file for Mobile
// This runs before each test file

import { vi } from 'vitest';

// Mock environment variables
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000/api/v1';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';

// Global test timeout
vi.setConfig({
  testTimeout: 10000,
  hookTimeout: 10000
});
