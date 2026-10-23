const { ServiceClientsService } = require('../../../apps/api/src/modules/legal/service-clients/service-clients.service');
const { ServiceTokenService } = require('../../../apps/api/src/modules/auth/service-token.service');
const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../../../apps/api/package.json'));
const {LegalAcceptanceValidationService}=require('../../../apps/api/src/modules/legal/authorization/legal-acceptance-validation.service');
const {
  LegalPersonalGuard,
} = require('../../../apps/api/src/modules/legal/authorization/legal-personal.guard');
const {
  LegalServiceGuard,
} = require('../../../apps/api/src/modules/legal/authorization/legal-service.guard');
const {
  LegalConsumerAccessService,
} = require('../../../apps/api/src/modules/legal/authorization/legal-consumer-access.service');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { DataSource } = apiRequire('typeorm');
const { Test } = apiRequire('@nestjs/testing');
const { ValidationPipe } = apiRequire('@nestjs/common');
const { ConfigService } = apiRequire('@nestjs/config');
const { getRepositoryToken } = apiRequire('@nestjs/typeorm');
const { AccessClient, SsoAuthGuard } = apiRequire('@hemia/auth/nestjs');
const { generateKeyPair, exportJWK, SignJWT } = apiRequire('jose');
const {
  LegalController,
  LegalPersonalController,
  LegalTechnicalController,
} = require('../../../apps/api/src/modules/legal/controllers/legal.controller');
const { LegalAuthGuard } = require('../../../apps/api/src/common/guards/legal-auth.guard');
const { PermissionsGuard } = require('../../../apps/api/src/common/guards/permissions.guard');
const {
  LegalContextService,
} = require('../../../apps/api/src/modules/legal/session/legal-context.service');
const { LegalService } = require('../../../apps/api/src/modules/legal/services/legal.service');
const {
  AccessService,
} = require('../../../apps/api/src/modules/legal/event-bus/access.service');
const {
  S3StorageService,
} = require('../../../apps/api/src/modules/storage/s3-storage.service');
const {
  REDIS,
  RedisSessionStore,
} = require('../../../apps/api/src/modules/auth/redis/redis-session-store');
const {
  LEGAL_ROLES,
} = require('../../../apps/api/src/modules/legal/authorization/legal-role-catalog');
const { scopedId } = require('../../../apps/api/src/modules/legal/authorization/legal-scope');
const ds = new DataSource({
  type: 'postgres',
  host: '127.0.0.1',
  port: Number(process.env.TEST_DATABASE_PORT),
  username: 'postgres',
  password: 'isolated-test-only',
  database: 'legal_consumer_test',
  entities: [process.cwd() + '/src/**/*.entity.ts'],
  migrations: [process.cwd() + '/src/database/migrations/*.ts'],
  synchronize: false,
  migrationsRun: false,
});
let app, upstream;
(async () => {
  await ds.initialize();
  await ds.runMigrations({ transaction: 'all' });
  const issuer = [randomUUID(), randomUUID()],
    apps = [randomUUID(), randomUUID()],
    docs = [randomUUID(), randomUUID()],
    org = [randomUUID(), randomUUID()],
    tenants = [randomUUID(), randomUUID()];
  const operatorOrg = randomUUID(),
    operatorTenant = randomUUID(),
    identity = randomUUID(),
    member = randomUUID();
  for (let i = 0; i < 2; i++) {
    await ds.query(
      "INSERT INTO issuers(id,key,name,legal_name,type,country_code,default_locale) VALUES($1,$2,'Issuer','Sensitive legal name','hemia','MX','es-MX')",
      [issuer[i], 'i' + i],
    );
    await ds.query(
      "INSERT INTO applications(id,issuer_id,key,name) VALUES($1,$2,$3,'App')",
      [apps[i], issuer[i], 'app' + i],
    );
    await ds.query(
      "INSERT INTO documents(id,issuer_id,application_id,key,locale,title) VALUES($1,$2,$3,'terms','es-MX','Terms')",
      [docs[i], issuer[i], apps[i]],
    );
    await ds.query(
      "INSERT INTO product_tenants(id,organization_id,external_tenant_id,code,name,status) VALUES($1::uuid,$2,$1::text,'legal','Tenant','active')",
      [tenants[i], org[i]],
    );
  }
  await ds.query(
    "INSERT INTO product_tenants(id,organization_id,external_tenant_id,code,name,status) VALUES($1::uuid,$2,$1::text,'legal','Operator','active')",
    [operatorTenant, operatorOrg],
  );
  const notifications = [];
  for (let a = 0; a < 2; a++)
    for (let o = 0; o < 2; o++) {
      const id = randomUUID();
      notifications.push({ id, a, o });
      await ds.query(
        "INSERT INTO notifications(id,issuer_id,application_id,organization_id,product_tenant_id,channel,recipient_logical_id,status) VALUES($1,$2,$3,$4,$5,'email','private@example.test','failed')",
        [id, issuer[a], apps[a], org[o], tenants[o]],
      );
    }
  await ds.query(
    "INSERT INTO notifications(issuer_id,application_id,channel,recipient_logical_id,status) VALUES($1,$2,'email','unknown@example.test','failed')",
    [issuer[0], apps[0]],
  );
  const acceptanceIds = [],
    versions = [],
    rules = [];
  for (let a = 0; a < 2; a++) {
    const version = randomUUID(),
      rule = randomUUID();
    await ds.query(
      "INSERT INTO document_versions(id,document_id,version,status,content_hash) VALUES($1,$2,'1','published','hash')",
      [version, docs[a]],
    );
    await ds.query(
      "INSERT INTO acceptance_rules(id,document_id,version_id,issuer_id,application_id,acceptance_mode) VALUES($1,$2,$3,$4,$5,'individual')",
      [rule, docs[a], version, issuer[a], apps[a]],
    );
    versions.push(version);
    rules.push(rule);
    for (let o = 0; o < 2; o++) {
      const id = randomUUID();
      acceptanceIds.push({ id, a, o });
      await ds.query(
        "INSERT INTO acceptances(id,issuer_id,application_id,organization_id,product_tenant_id,identity_issuer,subject_id,document_id,document_version_id,acceptance_rule_id,accepted_by_identity_issuer,accepted_by_subject_id,acceptance_mode,content_hash,accepted_at) VALUES($1,$2,$3,$4,$5,'identity','customer',$6,$7,$8,'identity','customer','individual','hash',now())",
        [id, issuer[a], apps[a], org[o], tenants[o], docs[a], version, rule],
      );
      await ds.query(
        "INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id) VALUES($1,$2,'test','identity','customer','user','legal.acceptance.record','legal_acceptance',$3)",
        [issuer[a], apps[a], id],
      );
    }
  }
  // Verify populated upgrade preserves evidence and ambiguous history rolls back.
  const {
    LegalOrganizationConsumerBoundary1790035200000,
  } = require('../../../apps/api/src/database/migrations/1790035200000-LegalOrganizationConsumerBoundary');
  const migration = new LegalOrganizationConsumerBoundary1790035200000();
  const qr = ds.createQueryRunner();
  await qr.connect();
  const history = () => ds.query('SELECT * FROM acceptances ORDER BY id');
  const beforeHistory = await history();
  await qr.startTransaction();
  await migration.down(qr);
  await migration.up(qr);
  await qr.commitTransaction();
  assert.deepEqual(await history(), beforeHistory);
  await qr.startTransaction();
  await migration.down(qr);
  await qr.query('UPDATE acceptances SET organization_id=$1 WHERE id=$2', [
    randomUUID(),
    acceptanceIds[0].id,
  ]);
  await assert.rejects(migration.up(qr), /Ambiguous historical/);
  await qr.rollbackTransaction();
  await qr.release();
  assert.deepEqual(await history(), beforeHistory);
  console.log(
    'PASS populated organization migration preserves history, down/up and ambiguity rollback',
  );
  const editorialAudit = randomUUID();
  await ds.query(
    `INSERT INTO audit_events(id,issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'test','identity','ana','user','legal.document.edit','legal_document',$4,'{"sensitive":"must not leak"}')`,
    [editorialAudit, issuer[0], apps[0], docs[0]],
  );
  await ds.query(
    "INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,metadata) VALUES($1,$2,'test','identity','ana','user','legal.acceptance.export','legal_acceptance','{}')",
    [issuer[0], apps[0]],
  );
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' };
  const other = await generateKeyPair('RS256');
  let wrongKey = false,
    audience = 'legal-api',
    unavailable = false,
    grants = [],
    resolveCount = 0;
  function grant(role = 'legal.viewer', app = 0, consumer = null) {
    return {
      assignment_id: randomUUID(),
      assignment_version: 1,
      role_code: role,
      valid_from: Math.floor(Date.now() / 1000) - 1,
      expires_at: null,
      resource_scope:
        app === null
          ? { type: 'legal_global', ids: [] }
          : { type: 'applications', ids: [apps[app]] },
      consumer_scope:
        consumer === null
          ? { type: 'not_applicable', organization_ids: [] }
          : { type: 'organizations', organization_ids: [org[consumer]] },
    };
  }
  let organizationFailure = false,
    unknownOrganization = false;
  const suspendedOrganizations = new Set();
  let consumerDenied = false,
    introspectionFailure = false;
  let organizationRoles = [];
  upstream = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/oauth/introspect') {
      if (introspectionFailure) {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const token = new URLSearchParams(raw).get('token');
      const common = {
        active: true,
        exp: Math.floor(Date.now() / 1000) + 300,
        aud: 'legal-api',
      };
      const human = {
        ...common,
        client_id: 'personal',
        scope:
          'legal.self.pending.read legal.self.acceptances.read legal.self.acceptances.create',
        sub: 'ana',
        session_id: 'human-session',
      };
      const machine = {
        ...common,
        client_id: 'evaluator',
        scope: 'legal.pending.evaluate',
      };
      res.end(
        JSON.stringify(
          {
            human,
            machine,
            validator: {...machine,client_id:"billing-legal-service",scope:"legal.acceptances.validate"},
            operator: {
              ...human,
              client_id: 'operator',
              scope: 'legal.access',
            },
            wrongAudience: { ...human, aud: 'billing-api' },
            wrongScope: { ...human, scope: 'legal.access' },
            expired: { ...human, exp: 1 },
            revoked: { active: false },
          }[token] ?? { active: false },
        ),
      );
      return;
    }
    if (req.url === '/v1/internal/legal/consumer-context') {
      if (consumerDenied) {
        res.writeHead(403);
        res.end('{}');
        return;
      }
      if (organizationFailure) {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (!org.includes(body.organization_id)) {
        res.writeHead(403);
        res.end('{}');
        return;
      }
      res.end(
        JSON.stringify({
          ...body,
          membership_id: member,
          context_version: 2,
          roles: organizationRoles,
        }),
      );
      return;
    }
    if (req.url === '/jwks') {
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (req.url === '/oauth/token') {
      let raw='';for await(const chunk of req)raw+=chunk;
      const billing=new URLSearchParams(raw).get('client_id')==='billing-legal-service';
      res.end(JSON.stringify({ scope:new URLSearchParams(raw).get('scope'), access_token: billing?'validator':'exchange',token_type:'Bearer',expires_in:120 }));
      return;
    }
    if (
      req.url === '/v1/internal/legal/organizations/validate' ||
      req.url === '/v1/internal/legal/organization-context'
    ) {
      if (organizationFailure) {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const ids = body.organization_ids ?? [body.organization_id];
      const valid = ids.every((id) => org.includes(id)) && !unknownOrganization;
      const active = req.url.endsWith('/organization-context')
        ? ids.every((id) => !suspendedOrganizations.has(id))
        : true;
      res.end(
        JSON.stringify({
          valid: valid && active,
          organization_ids: valid && active ? ids : [],
        }),
      );
      return;
    }
    if (req.url === '/v1/me/context/resolve') {
      resolveCount++;
      if (unavailable) {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        identity_issuer: 'https://identity.test',
        identity_reference_id: identity,
        organization_id: operatorOrg,
        membership_id: member,
        product_code: 'legal',
        contract_version: 1,
        catalog_version: 1,
        context_version: 1,
        assignments: grants,
      };
      const token = await new SignJWT(claims)
        .setProtectedHeader({
          alg: 'RS256',
          kid: 'test',
          typ: 'hemia-context+jwt',
        })
        .setIssuer(base)
        .setAudience(audience)
        .setSubject('ana')
        .setJti(randomUUID())
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(now + 300)
        .sign(wrongKey ? other.privateKey : privateKey);
      res.end(JSON.stringify({ context_token: token }));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const values = new Map();
  const store = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
    withLock: async (_key, _ttl, fn) => fn(),
  };
  const redis = {
    get: async (key) =>
      values.has(key) ? JSON.stringify(values.get(key)) : null,
  };
  const client = new AccessClient({
    clientId: 'legal',
    clientSecret: 'isolated',
    tokenUrl: base + '/oauth/token',
    scope: 'legal.access',
    access: {
      apiBaseUrl: base,
      jwksUrl: base + '/jwks',
      audience: 'access-api',
    },
  });
  const configuration = {
    'sso.issuer': 'https://identity.test',
    'sso.tokenUrl': base + '/oauth/token',
    'sso.access.apiBaseUrl': base,
    'legalService.introspectionUrl': base + '/oauth/introspect',
    'legalService.clientId': 'introspector',
    'legalService.clientSecret': 'test-secret',
    LEGAL_PERSONAL_CLIENTS: JSON.stringify({
      personal: { application_ids: [apps[0]] },
    }),
  };
  await ds.query(`INSERT INTO legal_service_clients(oauth_issuer,client_id,enabled,policy) VALUES($1,$2,true,$3)`, ['https://identity.test','evaluator',JSON.stringify({grants:[{operation:'legal.pending.evaluate',issuerId:issuer[0],applicationId:apps[0],organizationIds:[org[0]]}]})]);
  const providers = [
    ServiceClientsService,
    ServiceTokenService,
    LegalAcceptanceValidationService,
    { provide: SsoAuthGuard, useValue: {} },
    LegalService,
    LegalConsumerAccessService,
    LegalPersonalGuard,
    LegalServiceGuard,
    AccessService,
    LegalContextService,
    LegalAuthGuard,
    PermissionsGuard,
    { provide: DataSource, useValue: ds },
    { provide: AccessClient, useValue: client },
    {
      provide: ConfigService,
      useValue: {
        getOrThrow: (key) => configuration[key],
        get: (key) => configuration[key],
      },
    },
    { provide: REDIS, useValue: redis },
    { provide: RedisSessionStore, useValue: store },
    { provide: S3StorageService, useValue: {} },
  ];
  for (const metadata of ds.entityMetadatas)
    providers.push({
      provide: getRepositoryToken(metadata.target),
      useValue: ds.getRepository(metadata.target),
    });
  const module = await Test.createTestingModule({
    controllers: [
      LegalController,
      LegalPersonalController,
      LegalTechnicalController,
    ],
    providers,
  })
    .overrideProvider(SsoAuthGuard)
    .useValue({
      canActivate: (ctx) => {
        const request = ctx.switchToHttp().getRequest();
        const session = randomUUID();
        values.set('sso:session:' + session, {
          legalContext: {
            organizationId: operatorOrg,
          },
        });
        request.ssoAuth = { cookie: session, accessToken: 'identity-token' };
        request.user = { iss: 'https://identity.test', sub: 'ana' };
        request.accessContext = {
          identity: {
            issuer: 'https://identity.test',
            identity_reference_id: identity,
          },
          organizations: [
            {
              organization_id: operatorOrg,
              membership_id: member,
              organization_status: 'active',
              membership_status: 'active',
              roles: ['organization_owner'],
              product: {
                code: 'legal',
                status: 'enabled',
              },
            },
          ],
        };
        return true;
      },
    })
    .compile();
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  const request = async (path, method = 'GET', body, token) => {
    const res = await fetch((await app.getUrl()) + '/v1/legal/' + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  // The console and all new consumer operations work with zero local tenants.
  await ds.query('DELETE FROM product_tenants');
  const personalQuery = `me/pending?organizationId=${org[0]}&issuerId=${issuer[0]}&applicationId=${apps[0]}`;
  const evaluation = {
    organizationId: org[0],
    issuerId: issuer[0],
    applicationId: apps[0],
    identityIssuer: 'https://identity.test',
    subjectId: 'ana',
  };
  for (const token of ['machine', 'revoked', 'expired'])
    assert.equal(
      (await request(personalQuery, 'GET', undefined, token)).status,
      401,
      token,
    );
  for (const token of ['operator', 'wrongAudience', 'wrongScope'])
    assert.equal(
      (await request(personalQuery, 'GET', undefined, token)).status,
      403,
      token,
    );
  assert.equal(
    (await request(personalQuery, 'GET', undefined, 'human')).status,
    200,
  );
  assert.equal(
    (
      await request(
        personalQuery + '&productTenantId=forged',
        'GET',
        undefined,
        'human',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `me/pending?organizationId=${org[0]}&issuerId=${issuer[1]}&applicationId=${apps[1]}`,
        'GET',
        undefined,
        'human',
      )
    ).status,
    403,
  );
  assert.equal(
    (await request('pending/evaluate', 'POST', evaluation, 'human')).status,
    401,
  );
  assert.equal(
    (await request('pending/evaluate', 'POST', evaluation, 'machine')).status,
    201,
  );
  assert.equal(
    (
      await request(
        'pending/evaluate',
        'POST',
        { ...evaluation, roles: ['organization_owner'] },
        'machine',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        'pending/evaluate',
        'POST',
        { ...evaluation, applicationId: apps[1], issuerId: issuer[1] },
        'machine',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        'pending/evaluate',
        'POST',
        { ...evaluation, organizationId: org[1] },
        'machine',
      )
    ).status,
    403,
  );
  consumerDenied = true;
  assert.equal(
    (await request(personalQuery, 'GET', undefined, 'human')).status,
    403,
  );
  assert.equal(
    (await request('pending/evaluate', 'POST', evaluation, 'machine')).status,
    403,
  );
  consumerDenied = false;
  introspectionFailure = true;
  assert.equal(
    (await request(personalQuery, 'GET', undefined, 'human')).status,
    503,
  );
  introspectionFailure = false;
  const acceptance = {
    documentVersionId: versions[0],
    acceptanceRuleId: rules[0],
    accepted: true,
    organizationId: org[0],
  };
  assert.equal(
    (await request('acceptances', 'POST', acceptance, 'machine')).status,
    401,
  );
  const accepted = await Promise.all([
    request('acceptances', 'POST', acceptance, 'human'),
    request('acceptances', 'POST', acceptance, 'human'),
  ]);
  assert.equal(accepted[0].status, 201, JSON.stringify(accepted[0].body));
  assert.equal(accepted[1].status, 201, JSON.stringify(accepted[1].body));
  assert.equal(accepted[0].body.id, accepted[1].body.id);
  assert.equal(accepted[0].body.productTenantId, undefined);
  const ownAcceptances = await request(
    'me/acceptances?organizationId=' + org[0],
    'GET',
    undefined,
    'human',
  );
  assert.equal(ownAcceptances.status, 200);
  assert.equal(ownAcceptances.body.length, 1);
  assert.equal(ownAcceptances.body[0].subjectId, 'ana');
  await ds.query(
    "UPDATE acceptance_rules SET acceptance_mode='organization_representative',role='organization_owner' WHERE id=$1",
    [rules[0]],
  );
  assert.equal(
    (
      await request(
        'acceptances',
        'POST',
        { ...acceptance, organizationId: org[1] },
        'human',
      )
    ).status,
    403,
  );
  organizationRoles = ['organization_owner'];
  assert.equal(
    (
      await request(
        'acceptances',
        'POST',
        { ...acceptance, organizationId: org[1] },
        'human',
      )
    ).status,
    201,
  );
  organizationRoles = [];
  await ds.query(
    "UPDATE acceptance_rules SET acceptance_mode='individual',role=NULL WHERE id=$1",
    [rules[0]],
  );
  await ds.query(
    "DELETE FROM audit_events WHERE actor_subject_id='ana' AND action='legal.acceptance.record'",
  );
  await ds.query(
    "DELETE FROM acceptances WHERE identity_issuer='https://identity.test'",
  );
  grants = [grant()];
  let result = await request('applications?limit=1');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.meta.total, 1);
  assert.equal(result.body.items[0].id, apps[0]);
  result = await request('documents');
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].id, docs[0]);
  assert.equal(result.body[0].issuer.legalName, undefined);
  assert.equal((await request('documents/' + docs[1])).status, 403);
  assert.equal((await request('issuers/' + issuer[0])).status, 403);
  result = await request('issuers/options');
  assert.equal(result.body.length, 1);
  assert.deepEqual(Object.keys(result.body[0]).sort(), [
    'id',
    'name',
    'status',
  ]);
  assert.equal(
    (await request('documents/' + docs[0], 'PATCH', { title: 'Forbidden' }))
      .status,
    403,
  );
  grants = [grant('legal.editor')];
  assert.equal(
    (await request('documents/' + docs[0], 'PATCH', { title: 'Allowed' }))
      .status,
    200,
  );
  assert.equal(
    (await request('documents/' + docs[1], 'PATCH', { title: 'Forbidden' }))
      .status,
    403,
  );
  grants = [
    grant('legal.notification_operator', 0, 0),
    grant('legal.notification_operator', 1, 1),
  ];
  result = await request('notifications');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(
    result.body.map((n) => n.id).sort(),
    notifications
      .filter((n) => n.a === n.o)
      .map((n) => n.id)
      .sort(),
  );
  const cross = notifications.find((n) => n.a === 0 && n.o === 1);
  assert.equal(
    (await request('notifications/' + cross.id + '/retry', 'POST')).status,
    403,
  );
  const own = notifications.find((n) => n.a === 0 && n.o === 0);
  assert.equal(
    (await request('notifications/' + own.id + '/retry', 'POST')).status,
    201,
  );
  suspendedOrganizations.add(org[0]);
  await ds.query("UPDATE product_tenants SET status='suspended' WHERE id=$1", [
    tenants[0],
  ]);
  assert.equal(
    (await request('notifications/' + own.id + '/retry', 'POST')).status,
    403,
  );
  assert.equal(
    (await request('notifications/' + own.id + '/cancel', 'POST')).status,
    201,
  );
  grants = [grant('legal.auditor', 0, 0), grant('legal.auditor', 1, 1)];
  const acceptanceOwn = acceptanceIds.find((n) => n.a === 0 && n.o === 0),
    acceptanceCross = acceptanceIds.find((n) => n.a === 0 && n.o === 1);
  assert.equal((await request('acceptances/' + acceptanceOwn.id)).status, 200);
  assert.equal(
    (await request('acceptances/' + acceptanceCross.id)).status,
    403,
  );
  result = await request('acceptances/export');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(
    result.body.map((n) => n.id).sort(),
    acceptanceIds
      .filter((n) => n.a === n.o)
      .map((n) => n.id)
      .sort(),
  );
  result = await request('audit-events');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(
    result.body.filter((e) => e.entityType === 'legal_acceptance').length,
    2,
  );
  assert.deepEqual(
    result.body.find((e) => e.id === editorialAudit).metadata,
    {},
  );
  assert.equal(
    result.body.some((e) => e.action === 'legal.acceptance.export'),
    false,
  );
  organizationFailure = true;
  for (const route of [
    'acceptances/' + acceptanceOwn.id,
    'acceptances/export',
    'audit-events',
  ])
    assert.equal((await request(route)).status, 503, route);
  organizationFailure = false;
  unknownOrganization = true;
  for (const route of [
    'acceptances/' + acceptanceOwn.id,
    'acceptances/export',
    'audit-events',
  ])
    assert.equal((await request(route)).status, 403, route);
  grants = [grant('legal.notification_operator', 0, 0)];
  assert.equal((await request('notifications')).status, 403);
  assert.equal(
    (await request('notifications/' + own.id + '/cancel', 'POST')).status,
    403,
  );
  unknownOrganization = false;
  organizationFailure = true;
  assert.equal((await request('notifications')).status, 503);
  assert.equal(
    (await request('notifications/' + own.id + '/cancel', 'POST')).status,
    503,
  );
  organizationFailure = false;
  grants = [grant()];
  await ds.query("UPDATE applications SET status='archived' WHERE id=$1", [
    apps[0],
  ]);
  assert.equal((await request('documents/' + docs[0])).status, 200);
  grants = [grant('legal.editor')];
  assert.equal(
    (await request('documents/' + docs[0], 'PATCH', { title: 'Forbidden' }))
      .status,
    403,
  );
  grants = [];
  assert.equal((await request('documents')).status, 403);
  grants = [grant()];
  wrongKey = true;
  assert.equal((await request('documents')).status, 403);
  wrongKey = false;
  audience = 'billing-api';
  assert.equal((await request('documents')).status, 403);
  audience = 'legal-api';
  unavailable = true;
  assert.equal((await request('documents')).status, 503);
  unavailable = false;
  assert(resolveCount > 10);
  assert.equal(
    (await ds.query('SELECT count(*)::int n FROM tenant_memberships'))[0].n,
    0,
    'no automatic membership creation',
  );
  assert.equal(
    (await ds.query('SELECT count(*)::int n FROM product_tenants'))[0].n,
    0,
  );
  await require('./legal-checkout-evidence.integration.cjs')(ds,request,configuration,org,issuer,apps,{legalUrl:await app.getUrl(),identityUrl:base});
  console.log(
    'PASS personal/service separation, scopes, resource/client binding, organization isolation, Access failures, concurrent acceptance without tenants;  signed SDK context, explicit assignments, scope pairing, SQL pagination, minimal issuer projection, live resource/organization state, no fallback, bad signature/audience and dependency outage',
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    if (upstream) await new Promise((resolve) => upstream.close(resolve));
    if (ds.isInitialized) await ds.destroy();
  });
