import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  parseSchema,
  validateConfiguration,
  legalAcceptanceSchema,
  legalAcceptanceConfiguration,
} from '../../../../apps/api/src/modules/legal/systems/capability-schema';
import {
  SaveSystemDto,
  ServiceDestinationDto,
} from '../../../../apps/api/src/modules/legal/systems/systems.dto';
import {
  validateServices,
  resolveVerificationService,
} from '../../../../apps/api/src/modules/legal/systems/system-services';
import { SystemsService } from '../../../../apps/api/src/modules/legal/systems/systems.service';
import { IntegrationRegistryService } from '../../../../apps/api/src/modules/legal/integrations/registry/integration-registry.service';
import type {
  LegalActor,
  LegalRequest,
} from '../../../../apps/api/src/common/types/legal-request';
const systemId = randomUUID(),
  appId = randomUUID(),
  issuerId = randomUUID(),
  docId = randomUUID();
const settings = {
  identityIssuer: 'urn:hemia:balanz',
  productCode: 'balanz_cfdi',
  contextService: 'legal-context',
};
const services = [
  {
    code: 'legal-context',
    name: 'Verificación',
    url: 'http://localhost:3021/api/v1/internal/legal/consumer-context',
    audience: 'balanz-api',
    resource: 'http://localhost:3021',
    enabled: true,
  },
];
const introspectionScope = {
  code: 'identity.tokens.introspect',
  audience: 'identity-api',
  resource: 'http://localhost:4000',
  enabled: true,
  name: 'Introspección',
};
const functionScopes = [
  'legal.integration.acceptances.prepare',
  'legal.integration.acceptances.create',
  'legal.integration.acceptances.validate',
]
  .map((code) => ({
    code,
    audience: 'legal-api',
    resource: 'https://legal.example',
    enabled: true,
    name: code,
  }))
  .concat([introspectionScope]);
const functions = [
  {
    code: 'collector',
    name: 'Registrar aceptaciones',
    scopes: [...functionScopes.slice(0, 2), introspectionScope].map(
      ({ code, audience }) => ({ code, audience }),
    ),
  },
  {
    code: 'validator',
    name: 'Validar evidencia',
    scopes: functionScopes
      .slice(2, 3)
      .map(({ code, audience }) => ({ code, audience })),
  },
];
const capability = {
  functions,
  code: 'legalAcceptances',
  name: 'Aceptaciones legales',
  schema: legalAcceptanceSchema,
};
const actor = {
  identityIssuer: 'http://localhost:4000',
  subjectId: randomUUID(),
  actorType: 'user',
  permissions: [],
  traceId: randomUUID(),
  authorization: {
    expiresAt: 9999999999,
    assignments: [
      {
        assignment_id: randomUUID(),
        assignment_version: 1,
        role_code: 'legal.integration_manager',
        valid_from: 1,
        expires_at: null,
        resource_scope: { type: 'legal_global', ids: [] },
        consumer_scope: { type: 'not_applicable', organization_ids: [] },
      },
    ],
  },
} as LegalActor;
const client = {
  oauthIssuer: actor.identityIssuer,
  clientId: 'balanz-service',
  capabilityCode: 'legalAcceptances',
  roles: ['collector'],
  enabled: true,
};
const draft = {
  code: 'balanz',
  name: 'Balanz',
  enabled: true,
  configuration: { legalAcceptances: settings },
  services,
  clients: [client],
};
const config = new ConfigService({
  sso: { issuer: actor.identityIssuer },
  legalIntegrations: {
    production: false,
  },
});
function fixture(existing = false, settingsConfig = config) {
  const row = { id: systemId, ...draft };
  const respond = (sql: string, args: unknown[] = []): unknown[] => {
    if (sql.includes('FROM system_capabilities')) return [capability];
    if (sql === 'SELECT * FROM systems') return existing ? [row] : [];
    if (sql.includes('FROM system_clients WHERE system_id='))
      return row.clients;
    if (sql.startsWith('SELECT * FROM systems WHERE')) return [row];
    if (sql.startsWith('SELECT id FROM external_identity_sources'))
      return existing ? [{ id: randomUUID() }] : [];
    if (sql.startsWith('INSERT INTO systems'))
      return [
        {
          id: systemId,
          code: args[0],
          name: args[1],
          enabled: args[2],
          configuration: JSON.parse(args[3] as string) as unknown,
          services: JSON.parse(args[4] as string) as unknown,
        },
      ];
    if (sql.startsWith('WITH updated AS (UPDATE systems SET'))
      return [
        {
          ...row,
          name: args[0],
          enabled: args[1],
          configuration: JSON.parse(args[2] as string) as unknown,
          services: JSON.parse(args[4] as string) as unknown,
        },
      ];
    if (sql.startsWith('INSERT INTO system_capabilities'))
      return [
        {
          code: args[0],
          name: args[1],
          schema: JSON.parse(args[2] as string) as unknown,
        },
      ];
    return [];
  };
  const query = jest.fn((sql: string, args: unknown[] = []) =>
    Promise.resolve(respond(sql, args)),
  );

  const m = { query };
  const db = {
    query,
    transaction: (work: (manager: unknown) => unknown) => work(m),
  } as unknown as DataSource;
  const directory = {
    scopeCatalog: jest.fn().mockResolvedValue(functionScopes),
    directory: jest.fn().mockResolvedValue([
      {
        ...client,
        name: 'Balanz',
        serviceDestinations: [
          {
            audience: 'legal-api',
            resource: 'https://legal.example',
            scopes: functionScopes.slice(0, 2).map((s) => s.code),
          },
          {
            audience: introspectionScope.audience,
            resource: introspectionScope.resource,
            scopes: [introspectionScope.code],
          },
        ],
        scopes: [
          'legal.integration.acceptances.prepare',
          'legal.integration.acceptances.create',
        ],
      },
    ]),
  };
  return {
    service: new SystemsService(db, settingsConfig, directory as never),
    query,
    row,
    directory,
  };
}
it('validates dynamic types, selection options and bounds without coercing data', () => {
  const schema = parseSchema({
    fields: [
      {
        key: 'mode',
        label: 'Modo',
        type: 'string',
        required: true,
        options: ['test', 'production'],
      },
      { key: 'retries', label: 'Reintentos', type: 'integer', min: 0, max: 10 },
      { key: 'active', label: 'Activo', type: 'boolean', required: true },
    ],
  });
  const caps = [{ code: 'delivery', name: 'Entrega', schema }];
  expect(
    validateConfiguration(
      { delivery: { mode: 'test', retries: 0, active: false } },
      caps,
    ),
  ).toEqual({ delivery: { mode: 'test', retries: 0, active: false } });
  for (const v of [
    { mode: 'unknown', active: true },
    { mode: 'test', active: 'true' },
    { mode: 'test', active: true, retries: 11 },
    { mode: 'test', active: true, extra: 1 },
    { active: true },
  ])
    expect(() => validateConfiguration({ delivery: v }, caps)).toThrow();
  expect(() => validateConfiguration({ unknown: {} }, caps)).toThrow();
});
it('rejects unsafe or unsupported schema fields', () => {
  for (const fields of [
    [{ key: 'constructor', label: 'Bad', type: 'string' }],
    [{ key: 'field', label: 'Bad', type: 'object' }],
    [{ key: 'field', label: 'Bad', type: 'string', format: {} }],
    [{ key: 'field', label: 'Bad', type: 'string', pattern: 'unsafe' }],
    [
      { key: 'field', label: 'A', type: 'string' },
      { key: 'field', label: 'B', type: 'string' },
    ],
  ])
    expect(() => parseSchema({ fields })).toThrow();
});
it('keeps operational validation while permitting new capability metadata', () => {
  expect(
    legalAcceptanceConfiguration({ ...settings, extra: 'metadata' }, services),
  ).toEqual({
    identityIssuer: settings.identityIssuer,
    productCode: settings.productCode,
    contextUrl: services[0].url,
  });
  expect(() =>
    legalAcceptanceConfiguration(
      { ...settings, identityIssuer: 'invalid' },
      services,
    ),
  ).toThrow();
  const dto = plainToInstance(SaveSystemDto, { ...draft, configuration: [] });
  expect(validateSync(dto)).not.toHaveLength(0);
});
it('saves a system, its OAuth references and audit without changing historical client IDs', async () => {
  const f = fixture();
  await expect(f.service.save(draft, actor)).resolves.toMatchObject({
    id: systemId,
    configuration: draft.configuration,
    clients: [client],
  });
  expect(
    f.query.mock.calls.some(([sql]) => sql.includes('pg_advisory_xact_lock')),
  ).toBe(true);
  expect(
    f.query.mock.calls.some(([sql]) =>
      sql.includes('ON CONFLICT(source_id,oauth_issuer,client_id)'),
    ),
  ).toBe(true);
  expect(
    f.query.mock.calls.some(([sql]) =>
      sql.startsWith('DELETE FROM external_identity_source_clients'),
    ),
  ).toBe(false);
  expect(
    f.query.mock.calls.some(([sql]) =>
      sql.startsWith('INSERT INTO audit_events'),
    ),
  ).toBe(true);
});
it('rejects unauthorized callback URLs and clients without the right scopes', async () => {
  const f = fixture();
  await expect(
    f.service.save(
      {
        ...draft,
        services: [
          {
            ...services[0],
            url: 'https://127.0.0.1/check',
            resource: 'https://127.0.0.1',
          },
        ],
      },
      actor,
    ),
  ).rejects.toThrow('direcciones públicas');
  await expect(
    f.service.save(
      { ...draft, clients: [{ ...client, roles: ['validator'] }] },
      actor,
    ),
  ).rejects.toThrow('permisos');
});
it('does not change identity or product of a system with existing integrations', async () => {
  const f = fixture(true);
  await expect(
    f.service.save(
      {
        ...draft,
        configuration: {
          legalAcceptances: { ...settings, productCode: 'other' },
        },
      },
      actor,
      systemId,
    ),
  ).rejects.toThrow('no pueden cambiar');
});
it('validates existing systems before accepting a capability schema change', async () => {
  const f = fixture(true);
  await expect(
    f.service.saveCapability(
      {
        ...capability,
        schema: {
          fields: [
            ...legalAcceptanceSchema.fields,
            { key: 'newField', label: 'Nuevo', type: 'string', required: true },
          ],
        },
      },
      actor,
    ),
  ).rejects.toThrow('obligatorio');
  expect(
    f.query.mock.calls.some(([sql]) =>
      sql.startsWith('INSERT INTO system_capabilities'),
    ),
  ).toBe(false);
});
it('creates the integration using only selected IDs and resolves everything else on the server', async () => {
  const f = fixture();
  const respond = (sql: string): unknown[] => {
    if (sql.startsWith('SELECT a.id,a.issuer_id'))
      return [{ id: appId, issuer_id: issuerId, name: 'Balanz' }];
    if (sql.startsWith('SELECT d.id')) return [{ id: docId }];
    if (sql.startsWith('INSERT INTO external_identity_sources'))
      return [
        {
          id: 'source',
          system_id: systemId,
          issuer_id: issuerId,
          application_id: appId,
          enabled: true,
          code: 'balanz',
          name: 'Balanz',
        },
      ];
    return [];
  };
  const query = jest.fn((sql: string) => Promise.resolve(respond(sql)));
  const db = {
    transaction: (work: (m: unknown) => unknown) => work({ query }),
  } as unknown as DataSource;
  const systems = {
    get: jest.fn().mockResolvedValue(f.row),
    clients: jest.fn().mockResolvedValue([client]),
  };
  const registry = new IntegrationRegistryService(db, config, systems as never);
  await expect(
    registry.save({ actor } as LegalRequest, {
      systemId,
      applicationId: appId,
      documentIds: [docId],
    }),
  ).resolves.toMatchObject({
    systemId,
    issuerId,
    applicationId: appId,
    productCode: 'balanz_cfdi',
  });
  expect(
    query.mock.calls.some(([sql]) =>
      sql.startsWith('INSERT INTO external_identity_sources'),
    ),
  ).toBe(true);
});

it('resolves generic capability service references only within the current system', () => {
  const caps = [
    {
      code: 'notifications',
      name: 'Notificaciones',
      schema: {
        fields: [
          {
            key: 'deliveryService',
            label: 'Servicio de entrega',
            type: 'string' as const,
            format: 'service' as const,
            required: true,
          },
        ],
      },
    },
  ];
  expect(
    validateConfiguration(
      { notifications: { deliveryService: 'legal-context' } },
      caps,
      services,
    ),
  ).toEqual({ notifications: { deliveryService: 'legal-context' } });
  for (const configured of [
    [],
    [{ ...services[0], enabled: false }],
    [{ ...services[0], code: 'other-system' }],
  ])
    expect(() =>
      validateConfiguration(
        { notifications: { deliveryService: 'legal-context' } },
        caps,
        configured,
      ),
    ).toThrow('servicio habilitado');
  expect(() =>
    parseSchema({
      fields: [{ ...caps[0].schema.fields[0], options: ['fixed'] }],
    }),
  ).toThrow('Opciones');
});
it('rejects removing, disabling or renaming a service referenced by a capability', async () => {
  for (const next of [
    [],
    [{ ...services[0], enabled: false }],
    [{ ...services[0], code: 'renamed' }],
  ])
    await expect(
      fixture(true).service.save({ ...draft, services: next }, actor, systemId),
    ).rejects.toThrow('servicio habilitado');
});
it('accepts custom endpoint paths without deriving a Balanz endpoint', async () => {
  const f = fixture();
  const custom = [
    { ...services[0], url: 'http://localhost:3021/integrations/verify' },
  ];
  await expect(
    f.service.save({ ...draft, services: custom }, actor),
  ).resolves.toMatchObject({ services: custom });
  expect(await f.service.choices()).not.toHaveProperty('contextUrls');
});
it('validates service URLs, unique codes, limits and production transport', () => {
  expect(
    validateServices(
      [
        {
          ...services[0],
          url: 'https://support.example/custom/path',
          resource: 'https://support.example',
        },
      ],
      config,
    ),
  ).toHaveLength(1);
  for (const url of [
    'file:///etc/passwd',
    'http://10.0.0.1/internal',
    'https://user:password@example.test/check',
    'https://example.test/check?secret=value',
    'https://example.test/check#fragment',
  ])
    expect(() => validateServices([{ ...services[0], url }], config)).toThrow();
  expect(() =>
    validateServices(
      services,
      new ConfigService({ legalIntegrations: { production: true } }),
    ),
  ).toThrow();
  expect(() => validateServices([...services, ...services], config)).toThrow(
    'duplicado',
  );
  expect(() =>
    validateServices(
      Array.from({ length: 101 }, () => services[0]),
      config,
    ),
  ).toThrow('100');
  const dto = plainToInstance(SaveSystemDto, {
    ...draft,
    services: [{ ...services[0], injected: true }],
  });
  expect(
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
  ).not.toHaveLength(0);
});

it('requires a complete generic OAuth destination for verification', () => {
  expect(() =>
    resolveVerificationService(
      [{ ...services[0], audience: '' }],
      'legal-context',
    ),
  ).toThrow('destino OAuth');
  expect(() =>
    validateServices(
      [{ ...services[0], resource: 'https://other.example' }],
      config,
    ),
  ).toThrow('origen');
  expect(resolveVerificationService(services, 'legal-context').url).toBe(
    services[0].url,
  );
});

it('validates a generic OAuth origin without a hardcoded client and rejects unsafe destinations', async () => {
  const f = fixture(
    false,
    new ConfigService({
      legalService: { clientId: 'legal-fixed-client' },
      legalIntegrations: { production: false },
    }),
  );
  await expect(
    f.service.serviceDestination('http://localhost:3021/custom/check'),
  ).resolves.toEqual({
    resource: 'http://localhost:3021',
  });
  await expect(
    f.service.serviceDestination('https://127.0.0.1/check'),
  ).rejects.toThrow('direcciones públicas');
  const dto = plainToInstance(ServiceDestinationDto, {
    url: 'http://localhost:3021/check',
    clientId: 'injected-client',
  });
  expect(
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
  ).toHaveLength(1);
});

it('allows multiple functions on one identity only when every effective grant exists', async () => {
  const f = fixture();
  const value = {
    ...draft,
    clients: [{ ...client, roles: ['collector', 'validator'] }],
  };
  await expect(f.service.save(value, actor)).rejects.toThrow(
    'todas sus funciones',
  );
  f.directory.directory.mockResolvedValue([
    {
      ...client,
      name: 'Backend',
      scopes: [],
      serviceDestinations: [
        {
          audience: 'legal-api',
          resource: 'https://legal.example',
          scopes: functionScopes
            .filter((s) => s.audience === 'legal-api')
            .map((s) => s.code),
        },
        {
          audience: introspectionScope.audience,
          resource: introspectionScope.resource,
          scopes: [introspectionScope.code],
        },
      ],
    },
  ]);
  await expect(f.service.save(value, actor)).resolves.toMatchObject({
    clients: value.clients,
  });
});
it('prevalidates function selections without granting or writing before OAuth setup', async () => {
  const f = fixture();
  await expect(
    f.service.save(
      { ...draft, clients: [{ ...client, roles: ['collector', 'validator'] }] },
      actor,
      undefined,
      true,
    ),
  ).resolves.toMatchObject({ validated: true });
  expect(
    f.query.mock.calls.some(([sql]) =>
      /^(INSERT|UPDATE|DELETE|WITH updated)/.test(sql),
    ),
  ).toBe(false);
  await expect(
    f.service.save(
      { ...draft, clients: [{ ...client, roles: ['unknown'] }] },
      actor,
      undefined,
      true,
    ),
  ).rejects.toThrow('funciones registradas');
});
it('rejects empty and duplicated functions including direct service calls', async () => {
  for (const roles of [[], ['collector', 'collector']])
    await expect(
      fixture().service.save(
        { ...draft, clients: [{ ...client, roles }] },
        actor,
      ),
    ).rejects.toThrow('funciones únicas');
  expect(
    validateSync(
      plainToInstance(SaveSystemDto, {
        ...draft,
        clients: [{ ...client, role: 'collector', roles: undefined }],
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    ),
  ).not.toHaveLength(0);
});
it('requires verified catalog actor permission for Console integration management', async () => {
  const registry = new IntegrationRegistryService(
    {} as DataSource,
    config,
    {} as SystemsService,
  );
  expect(() =>
    registry.saveFromCatalog({ actor } as LegalRequest, {
      systemId,
      applicationId: appId,
      documentIds: [docId],
    }),
  ).toThrow('Verified Console');
  await expect(
    registry.catalogOptions({ actor } as LegalRequest),
  ).rejects.toThrow('Verified Console');
});

it('validates field applicability against declared function codes', () => {
  const field = {
    key: 'endpoint',
    label: 'Endpoint',
    type: 'string',
    functions: ['collector'],
  };
  expect(
    parseSchema({ fields: [field] }, ['collector']).fields[0].functions,
  ).toEqual(['collector']);
  for (const value of [
    [],
    ['unknown'],
    ['collector', 'collector'],
    'collector',
    [false],
  ])
    expect(() =>
      parseSchema({ fields: [{ ...field, functions: value }] }, ['collector']),
    ).toThrow('funciones registradas');
});
it('enforces required fields only for applicable functions while validating every supplied value', () => {
  const scoped = {
    code: 'delivery',
    name: 'Entrega',
    functions: [
      {
        code: 'sender',
        name: 'Enviar',
        scopes: [{ audience: 'delivery-api', code: 'delivery.send' }],
      },
      {
        code: 'reader',
        name: 'Leer',
        scopes: [{ audience: 'delivery-api', code: 'delivery.read' }],
      },
    ],
    schema: {
      fields: [
        {
          key: 'endpoint',
          label: 'Endpoint',
          type: 'string' as const,
          format: 'uri' as const,
          required: true,
          functions: ['sender'],
        },
        {
          key: 'mode',
          label: 'Modo',
          type: 'string' as const,
          required: true,
          options: ['test', 'live'],
        },
      ],
    },
  };
  expect(
    validateConfiguration({ delivery: { mode: 'test' } }, [scoped], [], {
      delivery: ['reader'],
    }),
  ).toEqual({ delivery: { mode: 'test' } });
  expect(() =>
    validateConfiguration({ delivery: { mode: 'test' } }, [scoped], [], {
      delivery: ['sender'],
    }),
  ).toThrow('obligatorio');
  expect(() =>
    validateConfiguration(
      { delivery: { mode: 'test', endpoint: 'invalid' } },
      [scoped],
      [],
      { delivery: ['reader'] },
    ),
  ).toThrow('URL');
  expect(() =>
    validateConfiguration({ delivery: {} }, [scoped], [], {
      delivery: ['reader'],
    }),
  ).toThrow('obligatorio');
});
it('permits prepared and validator-only systems without collector settings but retains collector runtime requirements', async () => {
  const f = fixture();
  const empty = {
    ...draft,
    configuration: { legalAcceptances: {} },
    services: [],
  };
  await expect(
    f.service.save({ ...empty, clients: [] }, actor),
  ).resolves.toMatchObject({ configuration: { legalAcceptances: {} } });
  await expect(
    f.service.save(
      { ...empty, clients: [{ ...client, roles: ['validator'] }] },
      actor,
      undefined,
      true,
    ),
  ).resolves.toMatchObject({ validated: true });
  await expect(
    f.service.save(
      { ...empty, clients: [{ ...client, enabled: false }] },
      actor,
    ),
  ).resolves.toMatchObject({ configuration: { legalAcceptances: {} } });
  await expect(
    f.service.save({ ...empty, enabled: false }, actor),
  ).resolves.toMatchObject({ enabled: false });
  await expect(f.service.save(empty, actor)).rejects.toThrow('obligatorio');
  await expect(
    f.service.save(
      {
        ...empty,
        configuration: { legalAcceptances: { identityIssuer: 'invalid' } },
        clients: [{ ...client, roles: ['validator'] }],
      },
      actor,
      undefined,
      true,
    ),
  ).rejects.toThrow('identidad de origen');
  expect(() => legalAcceptanceConfiguration({}, [])).toThrow('obligatorio');
  expect(
    f.query.mock.calls.some(([sql]) =>
      sql.startsWith('INSERT INTO external_identity_sources'),
    ),
  ).toBe(false);
});
it('preserves collector applicability for the Legal core schema', async () => {
  const f = fixture();
  await expect(
    f.service.saveCapability(
      {
        ...capability,
        schema: {
          fields: legalAcceptanceSchema.fields.map((field) => ({
            ...field,
            functions: ['validator'],
          })),
        },
      },
      actor,
    ),
  ).rejects.toThrow('Conserva los campos');
  await expect(
    f.service.saveCapability(
      {
        ...capability,
        schema: {
          fields: legalAcceptanceSchema.fields.map((field) => ({
            ...field,
            functions: ['unknown'],
          })),
        },
      },
      actor,
    ),
  ).rejects.toThrow('funciones registradas');
});
it('checks a changed required field against each persisted systems enabled functions', async () => {
  const f = fixture(true);
  const field = {
    key: 'validatorTag',
    label: 'Etiqueta',
    type: 'string',
    required: true,
    functions: ['validator'],
  };
  await expect(
    f.service.saveCapability(
      {
        ...capability,
        schema: { fields: [...legalAcceptanceSchema.fields, field] },
      },
      actor,
    ),
  ).resolves.toMatchObject({ code: 'legalAcceptances' });
  await expect(
    f.service.saveCapability(
      {
        ...capability,
        schema: {
          fields: [
            ...legalAcceptanceSchema.fields,
            { ...field, functions: ['collector'] },
          ],
        },
      },
      actor,
    ),
  ).rejects.toThrow('obligatorio');
});

it('requires collector introspection even without payment receiver and prevents removing its scope', async () => {
  const f = fixture();
  await expect(
    f.service.saveCapability(capability, actor),
  ).resolves.toMatchObject({ code: 'legalAcceptances' });
  await expect(
    f.service.saveCapability(
      {
        ...capability,
        functions: functions.map((fn) => ({
          ...fn,
          scopes: fn.scopes.filter(
            (scope) => scope.code !== introspectionScope.code,
          ),
        })),
      },
      actor,
    ),
  ).rejects.toThrow('introspección de Identity');
  f.directory.directory.mockResolvedValue([
    {
      ...client,
      name: 'Collector without introspection',
      scopes: [],
      serviceDestinations: [
        {
          audience: 'legal-api',
          resource: 'https://legal.example',
          scopes: [
            'legal.integration.acceptances.prepare',
            'legal.integration.acceptances.create',
          ],
        },
      ],
    },
  ]);
  await expect(f.service.save(draft, actor)).rejects.toThrow(
    'permisos de todas sus funciones',
  );
});
