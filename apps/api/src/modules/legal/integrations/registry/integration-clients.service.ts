import { ServiceTokenService } from '../../../auth/service-token.service';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LegalRequest } from '../../../../common/types/legal-request';
import { grantsFor } from '../../authorization/legal-authorization';

type Client = {
  id?: string;
  clientId: string;
  audience: string;
  name?: string;
  status: string;
  grantTypes: string[];
  scopes: string[];
  serviceDestinations?:
    { resource: string; audience: string; scopes: string[] }[] | null;
};

@Injectable()
export class IntegrationClientsService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
  ) {}

  async list(req: LegalRequest) {
    if (
      !['legal.integrations.create', 'legal.integrations.edit'].some(
        (permission) => {
          try {
            return grantsFor(req.actor.authorization, permission).length > 0;
          } catch (error) {
            if (error instanceof ForbiddenException) return false;
            throw error;
          }
        },
      )
    )
      throw new ForbiddenException(
        'Integration management permission required',
      );
    return this.directory();
  }

  async scopeCatalog(): Promise<
    import('../../systems/capability-functions').ScopeEntry[]
  > {
    const token = await this.tokens.get(
      this.config.getOrThrow<string>('sso.issuer'),
      ['identity.oauth_clients.read'],
    );
    const endpoint = new URL(
      this.config.getOrThrow<string>('legalIntegrations.directoryUrl'),
    );
    const responses = await Promise.all(
      ['oauth-scopes', 'oauth-apis'].map((catalog) => {
        const url = new URL(endpoint);
        url.pathname = url.pathname.replace(/oauth-clients\/?$/, catalog);
        return fetch(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: { authorization: `Bearer ${token}` },
        });
      }),
    );
    if (responses.some((response) => !response.ok))
      throw new ServiceUnavailableException(
        'Catálogo de permisos OAuth no disponible.',
      );
    const [entries, apis]: unknown[] = await Promise.all(
      responses.map(async (response): Promise<unknown> => response.json()),
    );
    if (
      !Array.isArray(entries) ||
      entries.some(
        (s: unknown) =>
          !s ||
          typeof s !== 'object' ||
          !('code' in s) ||
          typeof s.code !== 'string' ||
          !('name' in s) ||
          typeof s.name !== 'string' ||
          !('enabled' in s) ||
          typeof s.enabled !== 'boolean' ||
          !('kind' in s) ||
          !['api', 'protocol'].includes(String(s.kind)),
      ) ||
      !Array.isArray(apis) ||
      apis.some(
        (a: unknown) =>
          !a ||
          typeof a !== 'object' ||
          !('audience' in a) ||
          typeof a.audience !== 'string' ||
          !('resource' in a) ||
          (a.resource !== null && typeof a.resource !== 'string') ||
          !('enabled' in a) ||
          typeof a.enabled !== 'boolean' ||
          !('scopes' in a) ||
          !Array.isArray(a.scopes) ||
          !a.scopes.every((code: unknown) => typeof code === 'string'),
      )
    )
      throw new ServiceUnavailableException(
        'Catálogo de permisos OAuth inválido.',
      );
    const scopes = entries as {
      code: string;
      name: string;
      enabled: boolean;
      kind: string;
    }[];
    const resources = apis as {
      audience: string;
      resource: string | null;
      enabled: boolean;
      scopes: string[];
    }[];
    return resources.flatMap((api) =>
      scopes
        .filter(
          (scope) => scope.kind === 'api' && api.scopes.includes(scope.code),
        )
        .map((scope) => ({
          code: scope.code,
          name: scope.name,
          audience: api.audience,
          resource: api.resource,
          enabled: scope.enabled && api.enabled,
        })),
    );
  }

  async directory() {
    try {
      const token = await this.tokens.get(
        this.config.getOrThrow<string>('sso.issuer'),
        ['identity.oauth_clients.read'],
      );
      const response = await fetch(
        this.config.getOrThrow<string>('legalIntegrations.directoryUrl'),
        {
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error();
      const clients: unknown = await response.json();
      if (
        !Array.isArray(clients) ||
        clients.some(
          (client: Client) =>
            !client ||
            typeof client.clientId !== 'string' ||
            typeof client.status !== 'string' ||
            !Array.isArray(client.grantTypes) ||
            !client.grantTypes.every((grant) => typeof grant === 'string') ||
            (client.serviceDestinations != null &&
              (!Array.isArray(client.serviceDestinations) ||
                client.serviceDestinations.some(
                  (d) =>
                    !d ||
                    typeof d.audience !== 'string' ||
                    !Array.isArray(d.scopes) ||
                    !d.scopes.every((s) => typeof s === 'string'),
                ))) ||
            !Array.isArray(client.scopes) ||
            !client.scopes.every((scope) => typeof scope === 'string'),
        )
      )
        throw new Error();
      const oauthIssuer = this.config.getOrThrow<string>('sso.issuer');
      return (clients as Client[])
        .filter(
          (client) =>
            client.status === 'active' &&
            client.grantTypes.includes('client_credentials'),
        )
        .map((client) => ({
          ...(typeof client.id === 'string' ? { id: client.id } : {}),
          clientId: client.clientId,
          audience: client.audience,
          serviceDestinations: client.serviceDestinations ?? null,
          name: typeof client.name === 'string' ? client.name : client.clientId,
          oauthIssuer,
          scopes: [
            ...new Set([
              ...client.scopes,
              ...(client.serviceDestinations ?? [])
                .filter(
                  (d) =>
                    d.audience === 'legal-api' &&
                    Array.isArray(d.scopes) &&
                    d.scopes.every((s) => typeof s === 'string'),
                )
                .flatMap((d) => d.scopes),
            ]),
          ],
        }));
    } catch {
      throw new ServiceUnavailableException(
        'OAuth client directory unavailable',
      );
    }
  }
}
