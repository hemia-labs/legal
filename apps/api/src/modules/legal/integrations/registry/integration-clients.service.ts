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
    endpoint.pathname = endpoint.pathname.replace(
      /oauth-clients\/?$/,
      'oauth-scopes',
    );
    const response = await fetch(endpoint, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Catálogo de permisos OAuth no disponible.',
      );
    const entries: unknown = await response.json();
    if (
      !Array.isArray(entries) ||
      entries.some(
        (s: unknown) =>
          !s ||
          typeof s !== 'object' ||
          !('code' in s) ||
          !('audience' in s) ||
          !('enabled' in s) ||
          !('resource' in s) ||
          typeof s.code !== 'string' ||
          typeof s.audience !== 'string' ||
          typeof s.enabled !== 'boolean' ||
          (s.resource !== null && typeof s.resource !== 'string'),
      )
    )
      throw new ServiceUnavailableException(
        'Catálogo de permisos OAuth inválido.',
      );
    return entries as import('../../systems/capability-functions').ScopeEntry[];
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
