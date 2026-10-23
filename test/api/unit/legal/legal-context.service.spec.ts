import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { LegalContextService } from '../../../../apps/api/src/modules/legal/session/legal-context.service';
import { validateLegalContext } from '../../../../apps/api/src/modules/legal/authorization/legal-authorization';
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
const org = randomUUID(),
  member = randomUUID(),
  identity = randomUUID();
const expected = {
  subject: 'ana',
  issuer: 'https://identity.test',
  organizationId: org,
  membershipId: member,
  identityReferenceId: identity,
};
function claims() {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://access.test',
    aud: 'legal-api',
    sub: 'ana',
    identity_issuer: expected.issuer,
    identity_reference_id: identity,
    organization_id: org,
    membership_id: member,
    product_code: 'legal',
    contract_version: 1,
    catalog_version: 1,
    context_version: 2,
    jti: randomUUID(),
    iat: now,
    nbf: now,
    exp: now + 300,
    assignments: [
      {
        assignment_id: randomUUID(),
        assignment_version: 1,
        role_code: 'legal.viewer',
        valid_from: now - 1,
        expires_at: null,
        resource_scope: { type: 'applications', ids: [randomUUID()] },
        consumer_scope: { type: 'not_applicable', organization_ids: [] },
      },
    ],
  };
}
function fixture() {
  const values = new Map<string, unknown>([['sso:session:session', {}]]);
  const store = {
    get: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    set: jest.fn((key: string, value: unknown) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
    withLock: (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  };
  const redis = {
    get: jest.fn().mockResolvedValue(
      JSON.stringify({
        legalContext: {
          organizationId: org,
        },
      }),
    ),
    eval: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
    mget: jest.fn(),
    del: jest.fn(),
  };
  const client = {
    exchangeUserToken: jest.fn().mockResolvedValue('exchange'),
    resolveSystemContext: jest
      .fn()
      .mockImplementation(() => Promise.resolve(claims())),
  };
  const tenants = {
    findOneBy: jest.fn().mockResolvedValue({
      id: 'tenant',
      organizationId: org,
      externalTenantId: 'ext',
      status: 'active',
    }),
  };
  const service = new LegalContextService(
    redis as never,
    client as never,
    { getOrThrow: () => expected.issuer } as never,
    store as never,
  );
  const request = {
    method: 'GET',
    user: { sub: 'ana', iss: expected.issuer },
    ssoAuth: { cookie: 'session', accessToken: 'identity-token' },
    accessContext: {
      identity: { issuer: expected.issuer, identity_reference_id: identity },
      organizations: [
        {
          organization_id: org,
          membership_id: member,
          organization_status: 'active',
          membership_status: 'active',
          roles: ['organization_owner'],
          product: {
            code: 'legal',
            status: 'enabled',
            provisioning_status: 'ready',
            external_tenant_id: 'ext',
          },
        },
      ],
    },
  };
  return { service, request, client, redis, tenants };
}
describe('Explicit Legal context', () => {
  afterEach(() => jest.useRealTimers());
  it('uses explicit roles, stores selection only and never maps organization_owner', async () => {
    const f = fixture();
    const context = await f.service.select(f.request as never, org);
    expect(context.permissions).toContain('legal.documents.view');
    expect(context.permissions).not.toContain('legal.issuers.create');
    expect(
      JSON.parse((f.redis.eval.mock.calls as unknown[][])[0][3] as string),
    ).toEqual({
      organizationId: org,
    });
  });
  it('reuses reads for 60 seconds, refreshes writes and fails closed on unavailable Access', async () => {
    jest.useFakeTimers();
    const f = fixture();
    await f.service.require(f.request as never);
    await f.service.require(f.request as never);
    expect(f.client.resolveSystemContext).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(61000);
    await f.service.require(f.request as never);
    expect(f.client.resolveSystemContext).toHaveBeenCalledTimes(2);
    f.request.method = 'POST';
    await f.service.require(f.request as never);
    expect(f.client.resolveSystemContext).toHaveBeenCalledTimes(3);
    f.client.resolveSystemContext.mockRejectedValue(new Error('down'));
    await expect(f.service.require(f.request as never)).rejects.toMatchObject({
      status: 503,
    });
  });
  it('has no viewer fallback, even for an organization owner', async () => {
    const f = fixture();
    f.client.resolveSystemContext.mockResolvedValue({
      ...claims(),
      assignments: [],
    });
    await expect(
      f.service.select(f.request as never, org),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.redis.eval).not.toHaveBeenCalled();
  });
  it('invalidates tenant sessions without relying on local membership rows', async () => {
    const f = fixture();
    f.redis.scan.mockResolvedValue(['0', ['sso:session:a', 'sso:session:b']]);
    f.redis.mget.mockResolvedValue([
      JSON.stringify({ legalContext: { organizationId: org } }),
      JSON.stringify({ legalContext: { organizationId: 'other' } }),
    ]);
    await f.service.invalidateOrganization(org);
    expect(f.redis.del).toHaveBeenCalledTimes(1);
    expect(f.redis.del).toHaveBeenCalledWith('sso:session:a');
  });
  it.each([
    'sub',
    'aud',
    'product_code',
    'membership_id',
    'identity_issuer',
    'organization_id',
  ])('rejects wrong %s binding', (key) => {
    expect(() =>
      validateLegalContext({ ...claims(), [key]: 'wrong' }, expected),
    ).toThrow();
  });
  it('enforces aggregate reference and assignment limits without truncation', () => {
    const c = claims();
    c.assignments[0].resource_scope.ids = Array.from({ length: 1000 }, () =>
      randomUUID(),
    );
    expect(validateLegalContext(c, expected).assignments).toHaveLength(1);
    c.assignments[0].resource_scope.ids.push(randomUUID());
    expect(() => validateLegalContext(c, expected)).toThrow();
    const d = claims();
    d.assignments = Array.from({ length: 64 }, () => ({
      ...claims().assignments[0],
    }));
    expect(validateLegalContext(d, expected).assignments).toHaveLength(64);
    d.assignments.push(claims().assignments[0]);
    expect(() => validateLegalContext(d, expected)).toThrow();
  });
  it('rejects duplicate references and assignments', () => {
    const c = claims();
    c.assignments[0].resource_scope.ids.push(
      c.assignments[0].resource_scope.ids[0],
    );
    expect(() => validateLegalContext(c, expected)).toThrow();
    const d = claims();
    d.assignments.push(d.assignments[0]);
    expect(() => validateLegalContext(d, expected)).toThrow();
  });
  it('rejects old claims, unknown roles, missing scopes and expired assignments', () => {
    for (const patch of [
      { global_roles: ['organization_owner'] },
      { assignments: [] },
      { exp: 1 },
    ])
      expect(() =>
        validateLegalContext({ ...claims(), ...patch }, expected),
      ).toThrow();
    for (const patch of [
      { role_code: 'legal.admin' },
      { resource_scope: undefined },
      { expires_at: 1 },
      {
        consumer_scope: {
          type: 'organizations',
          organization_ids: [randomUUID()],
        },
      },
    ]) {
      const c = claims();
      Object.assign(c.assignments[0], patch);
      expect(() => validateLegalContext(c, expected)).toThrow();
    }
  });
});

describe('Legal integration manager versioned scopes', () => {
  it('requires catalog v2 and restricts the integration manager to issuer/application resources', () => {
    const c = claims();
    c.catalog_version = 2;
    c.assignments[0].role_code = 'legal.integration_manager';
    c.assignments[0].consumer_scope = {
      type: 'not_applicable',
      organization_ids: [],
    };
    expect(validateLegalContext(c, expected).assignments[0].role_code).toBe(
      'legal.integration_manager',
    );
    expect(() =>
      validateLegalContext({ ...c, catalog_version: 1 }, expected),
    ).toThrow();
    c.assignments[0].resource_scope = { type: 'legal_global', ids: [] };
    expect(() => validateLegalContext(c, expected)).toThrow();
  });
});
