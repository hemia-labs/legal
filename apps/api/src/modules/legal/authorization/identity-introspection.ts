import { ServiceTokenService } from '../../auth/service-token.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export async function introspectIdentity(
  config: ConfigService,
  token: string,
  tokens: ServiceTokenService,
): Promise<Record<string, unknown>> {
  const endpoint = config.get<string>('legalService.introspectionUrl');
  const { clientId, clientSecret: secret } = tokens.credentials();
  let value: Record<string, unknown>;
  try {
    if (!endpoint || !clientId || !secret) throw new Error();
    const url = tokens.endpoint(endpoint);
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        token: token,
      }),
    });
    if (!response.ok) throw new Error();
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error();
    value = data as Record<string, unknown>;
    if (typeof value.active !== 'boolean') throw new Error();
    if (
      value.active &&
      (typeof value.exp !== 'number' ||
        !Number.isFinite(value.exp) ||
        typeof value.client_id !== 'string' ||
        typeof value.scope !== 'string' ||
        typeof value.aud !== 'string')
    )
      throw new Error();
  } catch {
    throw new ServiceUnavailableException('Identity introspection unavailable');
  }
  return value;
}
