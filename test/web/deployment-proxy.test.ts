import { afterEach, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { proxy } from '../../apps/web/src/proxy';
const original = process.env.LEGAL_API_URL;
afterEach(() => {
  if (original === undefined) delete process.env.LEGAL_API_URL;
  else process.env.LEGAL_API_URL = original;
});
test('API, auth callbacks and health use the runtime backend without a login redirect', () => {
  process.env.LEGAL_API_URL = 'http://production-api:3017';
  for (const path of ['/v1/legal/documents/file.pdf?download=1', '/auth/callback?code=abc', '/health/ready']) {
    const response = proxy(new NextRequest('https://legal.example.test' + path));
    expect(response.headers.get('x-middleware-rewrite')).toBe('http://production-api:3017' + path);
    expect(response.headers.get('location')).toBeNull();
  }
});
test('private pages log in through the public origin and the error page stays local', () => {
  const login = proxy(new NextRequest('https://legal.example.test/documents?tab=all'));
  expect(login.headers.get('location')).toBe('https://legal.example.test/auth/login?returnTo=%2Fdocuments%3Ftab%3Dall');
  const error = proxy(new NextRequest('https://legal.example.test/auth/error'));
  expect(error.headers.get('x-middleware-rewrite')).toBeNull();
  expect(error.headers.get('x-middleware-next')).toBe('1');
});
