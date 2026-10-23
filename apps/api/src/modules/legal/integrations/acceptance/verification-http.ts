import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { checkServerIdentity } from 'node:tls';

// Only public HTTPS destinations; loopback HTTP is restricted to development.
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const [first, second] = address.toLowerCase().split(':');
    const prefix = parseInt(first, 16),
      subnet = parseInt(second || '0', 16);
    return (
      prefix >= 0x2000 &&
      prefix < 0x3fff &&
      prefix !== 0x2002 &&
      !(prefix === 0x2001 && (subnet < 0x200 || subnet === 0xdb8))
    );
  }
  return false;
}
export async function verificationAddress(
  url: URL,
  production: boolean,
  resolve = lookup,
) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const local =
    !production &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(host);
  if (url.protocol !== 'https:' && !local) throw new Error('HTTPS required');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolve(host, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) =>
      local
        ? !(address === '::1' || /^127\./.test(address))
        : !publicAddress(address),
    )
  )
    throw new Error(
      'Verification destination must resolve to public addresses',
    );
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}
export async function postVerificationContext(
  url: URL,
  production: boolean,
  token: string,
  body: string,
): Promise<unknown> {
  const signal = AbortSignal.timeout(3000);
  const { address, family } = await Promise.race([
    verificationAddress(url, production),
    new Promise<never>((_resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => reject(new Error('Verification timeout')),
        { once: true },
      ),
    ),
  ]);
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address,
        family,
        port: url.port || undefined,
        servername: isIP(hostname) ? undefined : hostname,
        checkServerIdentity: (_host, certificate) =>
          checkServerIdentity(hostname, certificate),
        method: 'POST',
        path: url.pathname,
        signal,
        maxHeaderSize: 16384,
        headers: {
          host: url.host,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          authorization: 'Bearer ' + token,
        },
      },
      (response) => {
        if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          response.destroy();
          reject(new Error('Verification endpoint refused request'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 65536) {
            response.destroy(new Error('Verification response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()) as unknown);
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error('Invalid verification response'),
            );
          }
        });
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}
