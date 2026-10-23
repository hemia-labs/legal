import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  publicAddress,
  verificationAddress,
  postVerificationContext,
} from '../../../../apps/api/src/modules/legal/integrations/acceptance/verification-http';

test.each([
  '10.0.0.1',
  '127.0.0.1',
  '169.254.169.254',
  '100.64.0.1',
  '172.16.0.1',
  '192.168.1.1',
  '198.18.0.1',
  '224.0.0.1',
  '0.0.0.0',
  '::1',
  'fc00::1',
  'fe80::1',
  '::ffff:127.0.0.1',
  '2002:7f00::1',
  '2001:db8::1',
  '3fff::1',
])('blocks internal or reserved address %s', (address) =>
  expect(publicAddress(address)).toBe(false),
);
test.each([
  '8.8.8.8',
  '1.1.1.1',
  '2606:4700:4700::1111',
  '2001:4860:4860::8888',
])('accepts public address %s', (address) =>
  expect(publicAddress(address)).toBe(true),
);
test('rejects DNS answers containing private addresses, even with a public answer', async () => {
  const resolve = jest.fn().mockResolvedValue([
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(
    verificationAddress(
      new URL('https://public.example/check'),
      false,
      resolve,
    ),
  ).rejects.toThrow('public addresses');
  expect(resolve).toHaveBeenCalledTimes(1);
  await expect(
    verificationAddress(new URL('http://127.0.0.1/check'), true),
  ).rejects.toThrow('HTTPS');
});
test('posts only to the validated IP, preserves the endpoint and never follows redirects', async () => {
  const received: string[] = [];
  const server = createServer((req, res) => {
    received.push(req.url ?? '');
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/unexpected' });
      res.end();
      return;
    }
    if (req.url === '/large') {
      res.end('x'.repeat(65537));
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, host: req.headers.host }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await expect(
      postVerificationContext(new URL(base + '/check'), false, 'test', '{}'),
    ).resolves.toEqual({ ok: true, host: new URL(base).host });
    await expect(
      postVerificationContext(new URL(base + '/redirect'), false, 'test', '{}'),
    ).rejects.toThrow('refused');
    await expect(
      postVerificationContext(new URL(base + '/large'), false, 'test', '{}'),
    ).rejects.toThrow('too large');
    expect(received).toEqual(['/check', '/redirect', '/large']);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('pins one validated address and supports IPv4-only development listeners', async () => {
  const resolve = jest.fn().mockResolvedValue([
    { address: '::1', family: 6 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(
    verificationAddress(new URL('http://localhost/check'), false, resolve),
  ).resolves.toEqual({ address: '127.0.0.1', family: 4 });
  expect(resolve).toHaveBeenCalledTimes(1);
});
