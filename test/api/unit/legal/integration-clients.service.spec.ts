import { ServiceTokenService } from '../../../../apps/api/src/modules/auth/service-token.service';
import { ConfigService } from '@nestjs/config';
import { IntegrationClientsService } from '../../../../apps/api/src/modules/legal/integrations/registry/integration-clients.service';
import type { LegalRequest } from '../../../../apps/api/src/common/types/legal-request';

const req = {
  actor: {
    authorization: {
      assignments: [
        {
          role_code: 'legal.integration_manager',
          valid_from: 0,
          expires_at: null,
          resource_scope: { type: 'issuers', ids: ['issuer'] },
          consumer_scope: { type: 'not_applicable', organization_ids: [] },
        },
      ],
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    },
  },
} as unknown as LegalRequest;
const config = {
  get: (key: string) => (key.endsWith('ClientId') ? 'directory' : 'secret'),
  getOrThrow: (key: string) =>
    key === 'sso.issuer'
      ? 'https://identity.test'
      : key === 'sso.tokenUrl'
        ? 'https://identity.test/oauth/token'
        : 'https://identity.test/oauth-clients',
} as unknown as ConfigService;

const tokens = {
  get: jest.fn().mockResolvedValue('private-token'),
} as unknown as ServiceTokenService;

describe('IntegrationClientsService', () => {
  afterEach(() => jest.restoreAllMocks());
  it('rejects callers without integration authority before calling Identity', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    await expect(
      new IntegrationClientsService(config, tokens).list({
        actor: {},
      } as LegalRequest),
    ).rejects.toThrow('Integration management permission required');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns active service clients without secrets and browser tokens', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            clientId: 'collector',
            audience: 'legal-api',
            name: 'Collector',
            status: 'active',
            grantTypes: ['client_credentials'],
            scopes: ['legal.acceptances.write'],
            clientSecret: 'never-return',
          },
          {
            clientId: 'browser',
            status: 'active',
            grantTypes: ['authorization_code'],
            scopes: [],
          },
          {
            clientId: 'disabled',
            status: 'inactive',
            grantTypes: ['client_credentials'],
            scopes: [],
          },
        ]),
      ),
    );
    await expect(
      new IntegrationClientsService(config, tokens).list(req),
    ).resolves.toEqual([
      {
        clientId: 'collector',
        name: 'Collector',
        oauthIssuer: 'https://identity.test',
        audience: 'legal-api',
        serviceDestinations: null,
        scopes: ['legal.acceptances.write'],
      },
    ]);
  });
  it('handles an upstream failure without leaking its response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('secret upstream error', { status: 403 }),
      );
    await expect(
      new IntegrationClientsService(config, tokens).list(req),
    ).rejects.toThrow('OAuth client directory unavailable');
  });
});
