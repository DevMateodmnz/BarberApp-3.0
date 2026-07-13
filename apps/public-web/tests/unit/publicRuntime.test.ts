import {
  PublicWebRuntimeError,
  normalizeApiBaseUrl,
  readPublicWebRuntime,
} from '@/lib/config/publicRuntime';

describe('public web runtime', () => {
  it('uses the local API default in development when PUBLIC_WEB_API_URL is absent', () => {
    expect(readPublicWebRuntime({ NODE_ENV: 'development' }).apiBaseUrl).toBe(
      'http://localhost:3000/api/v1'
    );
  });

  it('requires PUBLIC_WEB_API_URL in production', () => {
    expect(() => readPublicWebRuntime({ NODE_ENV: 'production' })).toThrow(
      PublicWebRuntimeError
    );
  });

  it('normalizes a valid API base URL', () => {
    expect(
      normalizeApiBaseUrl(' https://api.example.com/api/v1/// ', 'production')
    ).toBe('https://api.example.com/api/v1');
  });

  it('rejects URLs that do not target /api/v1 exactly', () => {
    expect(() =>
      normalizeApiBaseUrl('https://api.example.com/public', 'production')
    ).toThrow(/\/api\/v1/);
  });
});
