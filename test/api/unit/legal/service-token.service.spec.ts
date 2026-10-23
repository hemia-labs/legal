import { ConfigService } from '@nestjs/config';
import { ServiceTokenService } from '../../../../apps/api/src/modules/auth/service-token.service';
const config = new ConfigService({
  sso: { tokenUrl: 'https://identity.test/oauth/token' },
  legalService: {
    clientId: 'legal-service-dev',
    clientSecret: 'secret',
    production: true,
  },
});
const issued = (scope = 'a.read b.read', expires_in = 600) =>
  new Response(
    JSON.stringify({
      access_token: 'service-token',
      token_type: 'Bearer',
      expires_in,
      scope,
    }),
  );
describe('ServiceTokenService', () => {
  afterEach(() => jest.restoreAllMocks());
  it('shares concurrent requests and caches by normalized scopes', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(issued()));
    const tokens = new ServiceTokenService(config);
    await Promise.all([
      tokens.get('https://access.test', ['b.read', 'a.read']),
      tokens.get('https://access.test', ['a.read', 'b.read', 'a.read']),
    ]);
    await tokens.get('https://access.test', ['b.read', 'a.read']);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = fetch.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('client_id')).toBe('legal-service-dev');
    expect(body.get('resource')).toBe('https://access.test');
    expect(body.get('scope')).toBe('a.read b.read');
  });
  it('separates destinations and scopes', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation((_url, init) =>
        Promise.resolve(issued((init?.body as URLSearchParams).get('scope')!)),
      );
    const tokens = new ServiceTokenService(config);
    await tokens.get('https://identity.test', ['a.read']);
    await tokens.get('https://access.test', ['a.read']);
    await tokens.get('https://access.test', ['b.read']);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('refreshes 30 seconds before expiry', async () => {
    let now = 1000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(issued('a.read')));
    const tokens = new ServiceTokenService(config);
    await tokens.get('https://access.test', ['a.read']);
    now += 569000;
    await tokens.get('https://access.test', ['a.read']);
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 1000;
    await tokens.get('https://access.test', ['a.read']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not cache failures or broadened scope responses', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(issued('a.read admin.write'))
      .mockResolvedValueOnce(issued('a.read'));
    const tokens = new ServiceTokenService(config);
    await expect(tokens.get('https://access.test', ['a.read'])).rejects.toThrow(
      'Legal service token unavailable',
    );
    await expect(tokens.get('https://access.test', ['a.read'])).resolves.toBe(
      'service-token',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects missing credentials and insecure endpoints', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    await expect(
      new ServiceTokenService(new ConfigService()).get('https://access.test', [
        'a.read',
      ]),
    ).rejects.toThrow();
    await expect(
      new ServiceTokenService(config).get('http://access.test', ['a.read']),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
