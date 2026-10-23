import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SystemCatalogGuard } from '../../../../apps/api/src/modules/legal/systems/system-catalog.guard';
const original = global.fetch;
afterEach(() => {
  global.fetch = original;
});
function fixture(patch: Record<string, unknown> = {}, method = 'GET') {
  const headers = {
    authorization: 'Bearer service-token',
    'x-console-actor-subject': randomUUID(),
    'x-console-actor-issuer': 'http://localhost:4000',
  };
  const req = {
    method,
    headers,
    header: (name: keyof typeof headers) => headers[name],
    actor: undefined,
  };
  const value = {
    active: true,
    exp: Date.now() / 1000 + 300,
    client_id: 'console-identity-admin',
    aud: 'legal-api',
    scope: 'legal.systems.read legal.systems.write',
    ...patch,
  };
  global.fetch = jest.fn().mockResolvedValue(Response.json(value));
  const guard = new SystemCatalogGuard(
    new ConfigService({
      sso: { issuer: 'http://localhost:4000' },
      legalService: {
        introspectionUrl: 'http://localhost:4000/oauth/introspect',
      },
    }),
    {
      credentials: () => ({ clientId: 'legal', clientSecret: 'secret' }),
      endpoint: (url: string) => new URL(url),
    } as never,
  );
  return {
    req,
    run: () =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext),
  };
}
it('authorizes the dedicated service and binds its verified Console actor', async () => {
  const f = fixture();
  await expect(f.run()).resolves.toBe(true);
  expect(f.req.actor).toMatchObject({
    subjectId: f.req.headers['x-console-actor-subject'],
    actorType: 'user',
    permissions: ['legal.systems.read'],
  });
});
it.each([
  { client_id: 'other' },
  { aud: 'console-api' },
  { scope: 'legal.systems.read' },
  { sub: randomUUID() },
  { session_id: 'session' },
  { exp: 0 },
  { active: false },
])('rejects an invalid caller for writes: %j', async (patch) => {
  await expect(fixture(patch, 'POST').run()).rejects.toThrow();
});
it('does not trust an arbitrary actor issuer', async () => {
  const f = fixture();
  f.req.headers['x-console-actor-issuer'] = 'https://forged.example';
  await expect(f.run()).rejects.toThrow();
});
