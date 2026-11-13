import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import authorizationConfig, {
  platformOperatorBindings,
  type PlatformOperatorBinding,
} from '../../../../apps/api/src/config/authorization.config';
import type {
  LegalActor,
  LegalRequest,
} from '../../../../apps/api/src/common/types/legal-request';
import { isScopedPlatformOperator } from '../../../../apps/api/src/modules/legal/authorization/legal-authorization';
import { IntegrationRegistryService } from '../../../../apps/api/src/modules/legal/integrations/registry/integration-registry.service';
import { DocumentSetsService } from '../../../../apps/api/src/modules/legal/integrations/document-sets/document-sets.service';
import type { SaveDocumentSetDto } from '../../../../apps/api/src/modules/legal/integrations/document-sets/document-sets.dto';

const organizationId = randomUUID();
const applicationId = randomUUID();
const foreignApplicationId = randomUUID();
const issuerId = randomUUID();
const sourceId = randomUUID();
const documentId = randomUUID();
const binding: PlatformOperatorBinding = {
  identityIssuer: 'https://identity.example',
  subjectId: 'selected-administrator',
  organizationId,
  applicationIds: [applicationId],
};

function actor(patch: Partial<LegalActor> = {}): LegalActor {
  return {
    identityIssuer: binding.identityIssuer,
    subjectId: binding.subjectId,
    actorType: 'user',
    permissions: [],
    traceId: randomUUID(),
    authorization: {
      assignments: [],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      authenticatedOrganizationId: organizationId,
    },
    ...patch,
  };
}

function config(bindings: PlatformOperatorBinding[] = [binding]) {
  return new ConfigService({
    authorization: {
      mode: 'authenticated',
      platformOrganizationIds: [],
      platformOperatorBindings: bindings,
    },
  });
}

describe('Selective platform operator configuration', () => {
  it('defaults to no selective grants and normalizes UUIDs without changing identity', () => {
    expect(platformOperatorBindings(undefined)).toEqual([]);
    expect(platformOperatorBindings('')).toEqual([]);
    expect(platformOperatorBindings('[]')).toEqual([]);
    expect(
      platformOperatorBindings(
        JSON.stringify([
          {
            ...binding,
            organizationId: organizationId.toUpperCase(),
            applicationIds: [applicationId.toUpperCase()],
          },
        ]),
      ),
    ).toEqual([binding]);
  });

  it.each([
    ['invalid JSON', '{'],
    ['object instead of array', JSON.stringify(binding)],
    ['null entry', '[null]'],
    ['unknown field', JSON.stringify([{ ...binding, role: 'admin' }])],
    ['missing subject', JSON.stringify([{ ...binding, subjectId: undefined }])],
    ['blank issuer', JSON.stringify([{ ...binding, identityIssuer: '' }])],
    [
      'padded issuer',
      JSON.stringify([
        { ...binding, identityIssuer: ' https://identity.example' },
      ]),
    ],
    [
      'padded subject',
      JSON.stringify([{ ...binding, subjectId: 'selected-administrator ' }]),
    ],
    [
      'control in subject',
      JSON.stringify([{ ...binding, subjectId: 'selected\nadministrator' }]),
    ],
    [
      'invalid organization',
      JSON.stringify([{ ...binding, organizationId: 'other' }]),
    ],
    ['no applications', JSON.stringify([{ ...binding, applicationIds: [] }])],
    [
      'wildcard application',
      JSON.stringify([{ ...binding, applicationIds: ['*'] }]),
    ],
    [
      'application string',
      JSON.stringify([{ ...binding, applicationIds: applicationId }]),
    ],
    [
      'duplicate application',
      JSON.stringify([
        {
          ...binding,
          applicationIds: [applicationId, applicationId.toUpperCase()],
        },
      ]),
    ],
    ['duplicate binding', JSON.stringify([binding, binding])],
  ])('rejects %s without creating a broader grant', (_name, value) => {
    expect(() => platformOperatorBindings(value)).toThrow(
      'LEGAL_PLATFORM_OPERATOR_BINDINGS',
    );
  });

  it('rejects overlap with the organization-wide allowlist at startup', () => {
    expect(() =>
      platformOperatorBindings(JSON.stringify([binding]), [organizationId]),
    ).toThrow();
    const keys = [
      'HEMIA_AUTHORIZATION_MODE',
      'LEGAL_PLATFORM_ORGANIZATION_IDS',
      'LEGAL_PLATFORM_OPERATOR_BINDINGS',
    ];
    const previous = keys.map((key) => process.env[key]);
    try {
      process.env.HEMIA_AUTHORIZATION_MODE = 'authenticated';
      process.env.LEGAL_PLATFORM_ORGANIZATION_IDS = '';
      process.env.LEGAL_PLATFORM_OPERATOR_BINDINGS = JSON.stringify([binding]);
      expect(authorizationConfig().platformOperatorBindings).toEqual([binding]);
      process.env.LEGAL_PLATFORM_ORGANIZATION_IDS =
        organizationId.toUpperCase();
      expect(() => authorizationConfig()).toThrow();
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });
});

describe('Selective platform operator identity and application binding', () => {
  it('authorizes only the configured identity in its selected organization and application', () => {
    expect(isScopedPlatformOperator(actor(), applicationId, [binding])).toBe(
      true,
    );
    expect(
      isScopedPlatformOperator(actor(), foreignApplicationId, [binding]),
    ).toBe(false);
    expect(isScopedPlatformOperator(actor(), applicationId, [])).toBe(false);
  });

  it.each([
    [
      'another member of the same organization',
      { subjectId: 'other-administrator' },
    ],
    [
      'same subject at another issuer',
      { identityIssuer: 'https://foreign.example' },
    ],
    [
      'issuer spelling with a trailing slash',
      { identityIssuer: binding.identityIssuer + '/' },
    ],
    ['service actor', { actorType: 'service' as const }],
    ['missing authorization', { authorization: undefined }],
    [
      'another selected organization',
      {
        authorization: {
          assignments: [],
          expiresAt: Date.now() / 1000 + 60,
          authenticatedOrganizationId: randomUUID(),
        },
      },
    ],
    [
      'expired context',
      {
        authorization: {
          assignments: [],
          expiresAt: 1,
          authenticatedOrganizationId: organizationId,
        },
      },
    ],
    ...[NaN, Infinity].map(
      (expiresAt) =>
        [
          'non-finite expiration ' + String(expiresAt),
          {
            authorization: {
              assignments: [],
              expiresAt,
              authenticatedOrganizationId: organizationId,
            },
          },
        ] as const,
    ),
    [
      'missing selected organization',
      { authorization: { assignments: [], expiresAt: Date.now() / 1000 + 60 } },
    ],
  ])('denies %s', (_name, patch) => {
    expect(
      isScopedPlatformOperator(actor(patch), applicationId, [binding]),
    ).toBe(false);
  });
});

describe('Selective grants at integration and document-set consumers', () => {
  function registryFixture() {
    const sources = [applicationId, foreignApplicationId].map((id) => ({
      id: randomUUID(),
      system_id: randomUUID(),
      issuer_id: issuerId,
      application_id: id,
      enabled: true,
      code: id,
      name: id,
    }));
    const query = jest.fn((sql: string) => {
      if (sql.startsWith('SELECT s.*,sy.enabled')) return sources;
      // Both integration policies are shared across organizations.
      return [];
    });
    const settings = config();
    const registry = new IntegrationRegistryService(
      { query } as unknown as DataSource,
      settings,
      {} as never,
    );
    return { registry, query, sources, settings };
  }

  it('lists a shared integration only for the selected user and bound application', async () => {
    const { registry, sources } = registryFixture();
    await expect(
      registry.list({ actor: actor() } as LegalRequest),
    ).resolves.toEqual([
      expect.objectContaining({ id: sources[0].id, applicationId }),
    ]);
    await expect(
      registry.list({
        actor: actor({ subjectId: 'same-organization-colleague' }),
      } as LegalRequest),
    ).resolves.toEqual([]);
    await expect(
      registry.list({ actor: actor({ actorType: 'service' }) } as LegalRequest),
    ).resolves.toEqual([]);
  });

  it('revokes a selective grant without requiring the existing context to expire', async () => {
    const { registry, settings } = registryFixture();
    const request = { actor: actor() } as LegalRequest;
    await expect(registry.list(request)).resolves.toHaveLength(1);
    settings.set('authorization.platformOperatorBindings', []);
    await expect(registry.list(request)).resolves.toEqual([]);
  });

  it('denies moving a shared integration from a bound application to an unbound one before writes', async () => {
    const systemId = randomUUID();
    const source = {
      id: sourceId,
      system_id: systemId,
      issuer_id: issuerId,
      application_id: applicationId,
      enabled: true,
    };
    const query = jest.fn((sql: string) => {
      if (sql.startsWith('SELECT a.id,a.issuer_id'))
        return [
          {
            id: foreignApplicationId,
            issuer_id: issuerId,
            name: 'Foreign application',
          },
        ];
      if (sql.startsWith('SELECT * FROM external_identity_sources'))
        return [source];
      if (sql.startsWith('SELECT d.id')) return [{ id: documentId }];
      return [];
    });
    const db = {
      transaction: (work: (manager: unknown) => unknown) => work({ query }),
    } as unknown as DataSource;
    const systems = {
      get: jest.fn().mockResolvedValue({
        id: systemId,
        enabled: true,
        services: [],
        configuration: {
          legalAcceptances: {
            identityIssuer: 'urn:hemia:medsync',
            productCode: 'medsync',
          },
        },
      }),
      clients: jest.fn().mockResolvedValue([
        {
          capabilityCode: 'legalAcceptances',
          roles: ['collector'],
          enabled: true,
        },
      ]),
    };
    const registry = new IntegrationRegistryService(
      db,
      config(),
      systems as never,
    );
    await expect(
      registry.save(
        { actor: actor() } as LegalRequest,
        {
          systemId,
          applicationId: foreignApplicationId,
          documentIds: [documentId],
        },
        sourceId,
      ),
    ).rejects.toThrow('scope');
    expect(
      query.mock.calls.some(([sql]) =>
        /^(WITH updated|UPDATE|INSERT|DELETE)/.test(sql),
      ),
    ).toBe(false);
  });

  function documentSetsFixture(
    options: {
      targetOrganizations?: string[];
      oldOrganizations?: string[];
      oldSourceId?: string;
    } = {},
  ) {
    const revision = randomUUID();
    const set = {
      id: randomUUID(),
      source_id: options.oldSourceId ?? sourceId,
      application_id: applicationId,
      key: 'account_contracts',
      name: 'Account contracts',
      revision,
      configuration: {},
      effective_from: new Date(),
    };
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      if (sql.startsWith('SELECT organization_id FROM')) {
        const ids =
          params[0] === options.oldSourceId
            ? options.oldOrganizations
            : options.targetOrganizations;
        return (ids ?? []).map((organization_id) => ({ organization_id }));
      }
      if (sql.includes('FROM external_identity_sources'))
        return [
          {
            id: params[0],
            issuer_id: issuerId,
            application_id: applicationId,
            enabled: true,
          },
        ];
      if (sql.startsWith('SELECT d.id,d.document_type'))
        return [{ id: documentId, document_type: 'saas_contract' }];
      if (sql.startsWith('SELECT * FROM legal_document_sets'))
        return sql.includes('FOR UPDATE') && !options.oldSourceId ? [] : [set];
      if (sql.startsWith('INSERT INTO legal_document_sets')) return [set];
      return [];
    });
    const builder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: applicationId }),
    };
    const transaction = jest.fn(
      async (work: (manager: unknown) => Promise<unknown>) => work({ query }),
    );
    const db = {
      query,
      transaction,
      createQueryBuilder: () => builder,
    } as unknown as DataSource;
    const registry = new IntegrationRegistryService(db, config(), {} as never);
    const service = new DocumentSetsService(
      db,
      {} as never,
      registry,
      {} as never,
    );
    const draft: SaveDocumentSetDto = {
      sourceId,
      name: 'Account contracts',
      enabled: true,
      verification: 'collector_attested',
      requiresOrganization: false,
      requiresMfa: false,
      usage: 'account',
      evidenceScope: 'individual',
      documents: [
        {
          documentId,
          requiredAction: 'accept',
          blocking: true,
          requireReacceptance: true,
        },
      ],
      effectiveFrom: new Date().toISOString(),
      ...(options.oldSourceId ? { expectedRevision: revision } : {}),
    };
    return { service, query, transaction, builder, draft, revision };
  }

  it('allows listing and saving a set for the selected user, with a traceable signer', async () => {
    const { service, query, draft, revision } = documentSetsFixture();
    const selectedActor = actor();
    await expect(service.list(applicationId, selectedActor)).resolves.toEqual([
      expect.objectContaining({ applicationId, key: 'account_contracts' }),
    ]);
    await expect(
      service.save(applicationId, 'account_contracts', draft, selectedActor),
    ).resolves.toEqual({
      applicationId,
      key: 'account_contracts',
      revision,
    });
    const audit = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO audit_events'),
    );
    expect(audit?.[1].slice(0, 6)).toEqual([
      issuerId,
      applicationId,
      selectedActor.traceId,
      selectedActor.identityIssuer,
      selectedActor.subjectId,
      'user',
    ]);
  });

  it('does not list or create policies for a foreign organization source in the same application', async () => {
    const { service, query, draft } = documentSetsFixture({
      targetOrganizations: [randomUUID()],
    });
    await expect(service.list(applicationId, actor())).resolves.toEqual([]);
    await expect(
      service.save(applicationId, 'account_contracts', draft, actor()),
    ).rejects.toThrow();
    expect(
      query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql)),
    ).toBe(false);
  });

  it.each(['old', 'target'])(
    'does not reassign a set when the %s source belongs to another organization',
    async (restricted) => {
      const foreignOrganization = randomUUID();
      const { service, query, draft } = documentSetsFixture({
        oldSourceId: randomUUID(),
        oldOrganizations: restricted === 'old' ? [foreignOrganization] : [],
        targetOrganizations:
          restricted === 'target' ? [foreignOrganization] : [],
      });
      await expect(
        service.save(applicationId, 'account_contracts', draft, actor()),
      ).rejects.toThrow();
      expect(
        query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql)),
      ).toBe(false);
    },
  );

  it.each([
    [
      'another member',
      () => actor({ subjectId: 'same-organization-colleague' }),
      applicationId,
    ],
    [
      'another issuer',
      () => actor({ identityIssuer: 'https://foreign.example' }),
      applicationId,
    ],
    ['a service actor', () => actor({ actorType: 'service' }), applicationId],
    ['another application', () => actor(), foreignApplicationId],
    [
      'an expired context',
      () =>
        actor({
          authorization: {
            assignments: [],
            authenticatedOrganizationId: organizationId,
            expiresAt: 1,
          },
        }),
      applicationId,
    ],
  ])(
    'denies both listing and mutation for %s before touching a set',
    async (_name, currentActor, target) => {
      const { service, query, transaction, draft } = documentSetsFixture();
      await expect(service.list(target, currentActor())).rejects.toThrow();
      await expect(
        service.save(target, 'account_contracts', draft, currentActor()),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
