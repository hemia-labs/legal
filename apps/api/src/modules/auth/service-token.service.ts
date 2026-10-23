import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceTokenService {
  private readonly cache = new Map<
    string,
    { token: string; refreshAt: number }
  >();
  private readonly pending = new Map<string, Promise<string>>();
  constructor(private readonly config: ConfigService) {}

  credentials() {
    const clientId = this.config.get<string>('legalService.clientId');
    const clientSecret = this.config.get<string>('legalService.clientSecret');
    if (!clientId || !clientSecret)
      throw new ServiceUnavailableException(
        'Legal service client is not configured',
      );
    return { clientId, clientSecret };
  }

  async get(
    resource: string,
    scopes: string[],
    audience?: string,
  ): Promise<string> {
    if (audience !== undefined && !/^\S{1,160}$/.test(audience))
      throw new ServiceUnavailableException('Invalid service audience');
    const normalizedScopes = [...new Set(scopes)].sort();
    if (
      !normalizedScopes.length ||
      normalizedScopes.some(
        (scope) => !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(scope),
      )
    )
      throw new ServiceUnavailableException('Invalid service scopes');
    const { clientId, clientSecret } = this.credentials();
    const tokenUrl = this.endpoint(
      this.config.getOrThrow<string>('sso.tokenUrl'),
    );
    this.endpoint(resource);
    const key = JSON.stringify([
      tokenUrl.href,
      clientId,
      resource,
      audience,
      normalizedScopes,
    ]);
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.refreshAt) return cached.token;
    this.cache.delete(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const issued = this.issue(
      tokenUrl,
      resource,
      normalizedScopes,
      clientId,
      clientSecret,
      audience,
    )
      .then((value) => {
        // Cache only until 30 seconds before expiry; never cache responses shorter than that.
        const refreshAt =
          Date.now() + Math.max(0, value.expires_in - 30) * 1000;
        for (const [oldKey, oldValue] of this.cache)
          if (oldValue.refreshAt <= Date.now()) this.cache.delete(oldKey);
        if (refreshAt > Date.now())
          this.cache.set(key, { token: value.access_token, refreshAt });
        return value.access_token;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, issued);
    return issued;
  }

  private async issue(
    url: URL,
    resource: string,
    scopes: string[],
    clientId: string,
    clientSecret: string,
    audience?: string,
  ) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          resource,
          ...(audience ? { audience } : {}),
          scope: scopes.join(' '),
        }),
      });
      if (!response.ok) throw new Error();
      const value = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
      };
      if (
        !value ||
        typeof value.access_token !== 'string' ||
        !/^[A-Za-z0-9._~-]+$/.test(value.access_token) ||
        value.token_type !== 'Bearer' ||
        !Number.isFinite(value.expires_in) ||
        value.expires_in <= 0 ||
        typeof value.scope !== 'string' ||
        JSON.stringify(
          [...new Set(value.scope.split(/\s+/).filter(Boolean))].sort(),
        ) !== JSON.stringify(scopes)
      )
        throw new Error();
      return value;
    } catch {
      throw new ServiceUnavailableException('Legal service token unavailable');
    }
  }

  endpoint(value: string) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
          !this.config.get<boolean>('legalService.production')
        ))
    )
      throw new ServiceUnavailableException('Invalid service endpoint');
    return url;
  }
}
