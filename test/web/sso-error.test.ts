import { expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { proxy } from '../../apps/web/src/proxy';

test('callback errors end on a public page; protected routes still require login', () => {
  const response = proxy(new NextRequest('http://localhost:5180/?error=access_unavailable'));
  expect(response.headers.get('location')).toBe('http://localhost:5180/auth/error?error=access_unavailable');
  const terminal = proxy(new NextRequest(response.headers.get('location')!));
  expect(terminal.headers.get('location')).toBeNull();
  expect(terminal.headers.get('x-middleware-next')).toBe('1');
  expect(proxy(new NextRequest('http://localhost:5180/documents')).headers.get('location')).toContain('/auth/login?returnTo=');
  expect(proxy(new NextRequest('http://localhost:5180/?error=secret')).headers.get('location')).toEndWith('error=auth_failed');
});
