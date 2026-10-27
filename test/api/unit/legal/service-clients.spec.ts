import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ServiceClientsService } from '../../../../apps/api/src/modules/legal/service-clients/service-clients.service';
import { parseServicePolicy } from '../../../../apps/api/src/modules/legal/service-clients/service-client.dto';
const issuerId = '12070747-0a73-4256-9556-19b0a56c9340';
const applicationId = '403b298c-4c80-4d5e-afb2-6f703238963d';
const organizationId = 'fd314e96-8274-4e48-a2d4-fb0ae4b719f3';
const grant = {
  operation: 'legal.pending.evaluate',
  issuerId,
  applicationId,
  organizationIds: [organizationId],
};
describe('service client policies', () => {
  it('rejects empty, unknown and malformed policies', () => {
    for (const value of [
      null,
      {},
      { grants: [] },
      { grants: [{ ...grant, operation: '*' }] },
      { grants: [{ ...grant, organizationIds: ['*'] }] },
      { grants: [grant], extra: true },
    ])
      expect(() => parseServicePolicy(value)).toThrow();
    expect(parseServicePolicy({ grants: [grant] }).grants).toHaveLength(1);
  });
  it('accepts omitted or empty organization restrictions but keeps operation and application boundaries', async () => {
    const dynamicGrant = {
      operation: grant.operation,
      issuerId,
      applicationId,
    };
    const policy = parseServicePolicy({ grants: [dynamicGrant] });
    expect(policy.grants[0].organizationIds).toEqual([]);
    expect(() =>
      parseServicePolicy({ grants: [{ ...grant, organizationIds: null }] }),
    ).toThrow();
    const db = {
      getRepository: () => ({
        findOneBy: jest.fn().mockResolvedValue({ policy }),
      }),
    } as unknown as DataSource;
    const service = new ServiceClientsService(db, new ConfigService());
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        applicationId,
        organizationId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.authorize(
        'issuer',
        'client',
        'legal.acceptances.validate',
        issuerId,
        applicationId,
        organizationId,
      ),
    ).rejects.toThrow();
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        organizationId,
        organizationId,
      ),
    ).rejects.toThrow();
  });
  it('reads fresh policy and never cross-joins destinations or operations', async () => {
    const findOneBy = jest.fn().mockResolvedValue({
      policy: {
        grants: [
          grant,
          {
            ...grant,
            operation: 'legal.acceptances.validate',
            organizationIds: [applicationId],
          },
        ],
      },
    });
    const db = {
      getRepository: () => ({ findOneBy }),
    } as unknown as DataSource;
    const service = new ServiceClientsService(db, new ConfigService());
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        applicationId,
        organizationId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.authorize(
        'issuer',
        'client',
        'legal.acceptances.validate',
        issuerId,
        applicationId,
        organizationId,
      ),
    ).rejects.toThrow();
    findOneBy.mockResolvedValue(null);
    await expect(
      service.authorize(
        'issuer',
        'client',
        grant.operation,
        issuerId,
        applicationId,
        organizationId,
      ),
    ).rejects.toThrow();
    expect(findOneBy).toHaveBeenLastCalledWith({
      oauthIssuer: 'issuer',
      clientId: 'client',
      enabled: true,
    });
  });
});

describe('authenticated human service policy scope', () => {
  const request = {
    actor: {
      authorization: {
        assignments: [],
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        authenticatedOrganizationId: organizationId,
      },
      traceId: 'test',
      identityIssuer: 'https://identity.test',
      subjectId: 'human',
      actorType: 'user',
    },
  } as unknown as import('../../../../apps/api/src/common/types/legal-request').LegalRequest;
  const foreign = '41667bdd-511e-46ca-bcbc-ce7e7dd7a154';
  const policy = (ids: string[]) => ({
    grants: [{ ...grant, organizationIds: ids }],
  });
  function fixture(oldIds?: string[]) {
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          oldIds === undefined ? null : { policy: policy(oldIds) },
        ),
      create: jest.fn((v: Record<string, unknown>) => v),
      save: jest.fn((v: Record<string, unknown>) =>
        Promise.resolve({ ...v, id: applicationId }),
      ),
    };
    const query = jest.fn((sql: string) =>
      sql.startsWith('SELECT a.id') ? [{ id: applicationId }] : [],
    );
    const db = {
      transaction: (work: (m: unknown) => unknown) =>
        work({ query, getRepository: () => repository }),
    } as unknown as DataSource;
    return {
      repository,
      service: new ServiceClientsService(
        db,
        new ConfigService({ sso: { issuer: 'https://identity.test' } }),
      ),
    };
  }
  it.each([
    { ids: [] },
    { ids: [foreign] },
    { ids: [organizationId, foreign] },
  ])('rejects new global or foreign policy %j', async ({ ids }) => {
    const f = fixture();
    await expect(
      f.service.save(request, {
        oauthIssuer: 'https://identity.test',
        clientId: 'client',
        enabled: true,
        policy: policy(ids),
      }),
    ).rejects.toThrow();
    expect(f.repository.save).not.toHaveBeenCalled();
  });
  it.each([
    { ids: [] },
    { ids: [foreign] },
    { ids: [organizationId, foreign] },
  ])(
    'does not take over or enable existing broader clients %j',
    async ({ ids }) => {
      const f = fixture(ids);
      await expect(
        f.service.save(request, {
          oauthIssuer: 'https://identity.test',
          clientId: 'client',
          enabled: true,
          policy: policy([organizationId]),
        }),
      ).rejects.toThrow();
      expect(f.repository.save).not.toHaveBeenCalled();
    },
  );
  it('saves only selected organization policies while locking existing policy', async () => {
    const f = fixture([organizationId]);
    await expect(
      f.service.save(request, {
        oauthIssuer: 'https://identity.test',
        clientId: 'client',
        enabled: true,
        policy: policy([organizationId]),
      }),
    ).resolves.toMatchObject({ enabled: true });
    expect(f.repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
  it('filters global, foreign and mixed clients from listing', async () => {
    const rows = [
      [],
      [foreign],
      [organizationId, foreign],
      [organizationId],
    ].map((ids, i) => ({ id: String(i), policy: policy(ids) }));
    const service = new ServiceClientsService(
      {
        getRepository: () => ({ find: jest.fn().mockResolvedValue(rows) }),
      } as unknown as DataSource,
      new ConfigService(),
    );
    await expect(service.list(request)).resolves.toEqual([
      expect.objectContaining({ id: '3' }),
    ]);
  });
});
