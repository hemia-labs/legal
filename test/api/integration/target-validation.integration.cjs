const { ServiceTokenService } = require('../../../apps/api/src/modules/auth/service-token.service');
const { createRequire } = require('node:module');
const apiRequire = createRequire(require('node:path').resolve(__dirname, '../../../apps/api/package.json'));
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { DataSource } = apiRequire('typeorm');
const { Test } = apiRequire('@nestjs/testing');
const { ValidationPipe } = apiRequire('@nestjs/common');
const { ConfigService } = apiRequire('@nestjs/config');
const {
  TargetValidationController,
} = require('../../../apps/api/src/modules/legal/target-validation/target-validation.controller');
const {
  TargetValidationGuard,
} = require('../../../apps/api/src/modules/legal/target-validation/target-validation.guard');
const {
  TargetValidationService,
} = require('../../../apps/api/src/modules/legal/target-validation/target-validation.service');
const port = Number(process.env.TEST_DATABASE_PORT);
assert(Number.isInteger(port) && port > 0);
const ds = new DataSource({
  type: 'postgres',
  host: '127.0.0.1',
  port,
  username: 'postgres',
  password: 'isolated-test-only',
  database: 'legal_targets_test',
  entities: [process.cwd() + '/src/**/*.entity.ts'],
  migrations: [process.cwd() + '/src/database/migrations/*.ts'],
  synchronize: false,
  migrationsRun: false,
});
let app, server;
(async () => {
  await ds.initialize();
  assert.equal(
    (
      await ds.query(
        "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'",
      )
    )[0].n,
    0,
  );
  await ds.runMigrations({ transaction: 'all' });
  const issuerIds = Array.from({ length: 4 }, randomUUID),
    applicationIds = Array.from({ length: 5 }, randomUUID);
  for (let i = 0; i < 4; i++)
    await ds.query(
      `INSERT INTO issuers(id,key,name,legal_name,type,country_code,default_locale,status,deleted_at) VALUES($1,$2,'test','test','test','MX','es',$3,$4)`,
      [
        issuerIds[i],
        'test' + i,
        ['active', 'inactive', 'archived', 'active'][i],
        i === 3 ? new Date() : null,
      ],
    );
  for (let i = 0; i < 5; i++)
    await ds.query(
      `INSERT INTO applications(id,issuer_id,key,name,status,deleted_at) VALUES($1,$2,$3,'test',$4,$5)`,
      [
        applicationIds[i],
        issuerIds[i === 3 ? 1 : 0],
        'app' + i,
        ['active', 'inactive', 'archived', 'active', 'active'][i],
        i === 4 ? new Date() : null,
      ],
    );
  const valid = {
    active: true,
    exp: Math.floor(Date.now() / 1000) + 600,
    client_id: 'access-legal-validator',
    aud: 'legal-api',
    scope: 'legal.authorization.targets.validate',
  };
  let reply = valid;
  server = createServer((req, res) => {
    if (reply === 'failure') {
      res.writeHead(500);
      res.end();
      return;
    }
    if (reply === 'timeout') return;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const config = {
    'legalService.introspectionUrl': `http://127.0.0.1:${server.address().port}`,
    'legalService.clientId': 'test',
    'legalService.clientSecret': 'test',
  };
  const module = await Test.createTestingModule({
    controllers: [TargetValidationController],
    providers: [
      ServiceTokenService,
      TargetValidationService,
      TargetValidationGuard,
      { provide: DataSource, useValue: ds },
      { provide: ConfigService, useValue: { get: (key) => config[key], getOrThrow: (key) => { if (!config[key]) throw new Error(key); return config[key]; } } },
    ],
  }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const url =
    (await app.getUrl()) + '/v1/internal/authorization/targets/validate';
  const request = async (
    body = { target_type: 'legal_issuer', ids: [issuerIds[0]] },
    token = 'test',
  ) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token
          ? { authorization: 'Bearer ' + token }
          : { cookie: 'legal_session=fake' }),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await request(undefined, null)).status, 401);
  for (const [value, status] of [
    [{ active: false }, 401],
    [{ ...valid, exp: 1 }, 401],
    [{ ...valid, sub: 'human' }, 401],
    [{ ...valid, session_id: 'session' }, 401],
    [{ ...valid, aud: 'billing-api' }, 403],
    [{ ...valid, client_id: 'other' }, 403],
    [{ ...valid, scope: 'other' }, 403],
    [{}, 503],
    ['failure', 503],
    ['timeout', 503],
  ]) {
    reply = value;
    assert.equal((await request()).status, status);
  }
  reply = valid;
  for (const body of [
    { target_type: 'other', ids: [issuerIds[0]] },
    { target_type: 'legal_issuer', ids: [] },
    { target_type: 'legal_issuer', ids: ['invalid'] },
    {
      target_type: 'legal_issuer',
      ids: [issuerIds[0], issuerIds[0].toUpperCase()],
    },
    { target_type: 'legal_issuer', ids: [issuerIds[0]], extra: true },
    {
      target_type: 'legal_issuer',
      ids: Array.from({ length: 1001 }, randomUUID),
    },
  ])
    assert.equal((await request(body)).status, 400);
  const snapshot = async () =>
    JSON.stringify(
      await ds.query('SELECT row_to_json(i) AS row FROM issuers i ORDER BY id'),
    ) +
    JSON.stringify(
      await ds.query(
        'SELECT row_to_json(a) AS row FROM applications a ORDER BY id',
      ),
    );
  const before = await snapshot();
  const missing = randomUUID();
  for (const [type, ids, reasons] of [
    [
      'legal_issuer',
      [...issuerIds, missing],
      [null, 'inactive', 'inactive', 'not_found', 'not_found'],
    ],
    [
      'legal_application',
      [...applicationIds, missing],
      [
        null,
        'inactive',
        'inactive',
        'parent_unavailable',
        'not_found',
        'not_found',
      ],
    ],
  ]) {
    const response = await request({ target_type: type, ids });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.valid, false);
    assert.deepEqual(
      result.results.map((x) => x.id),
      ids,
    );
    assert.deepEqual(
      result.results.map((x) => x.reason),
      reasons,
    );
    for (const row of result.results)
      assert.deepEqual(
        Object.keys(row).sort(),
        ['id', 'target_type', 'valid', 'status', 'issuer_id', 'reason'].sort(),
      );
  }
  assert.equal(
    (
      await request({
        target_type: 'legal_issuer',
        ids: Array.from({ length: 1000 }, randomUUID),
      })
    ).status,
    200,
  );
  assert.equal(await snapshot(), before);
  await ds.query("UPDATE issuers SET status='inactive' WHERE id=$1", [
    issuerIds[0],
  ]);
  assert.equal((await (await request()).json()).valid, false);
  assert.equal(
    (
      await (
        await request({
          target_type: 'legal_application',
          ids: [applicationIds[0]],
        })
      ).json()
    ).results[0].reason,
    'parent_unavailable',
  );
  await ds.query(
    "UPDATE issuers SET status='active',deleted_at=now() WHERE id=$1",
    [issuerIds[0]],
  );
  assert.equal(
    (
      await (
        await request({
          target_type: 'legal_application',
          ids: [applicationIds[0]],
        })
      ).json()
    ).results[0].reason,
    'parent_unavailable',
  );
  await ds.query('UPDATE issuers SET deleted_at=NULL WHERE id=$1', [
    issuerIds[0],
  ]);
  console.log(
    'PASS HTTP authentication, timeout, strict DTO, PostgreSQL batches/states/parents, 1000/1001 limits, no writes, fresh status',
  );
  if (process.env.LEGAL_ACCEPTANCE_CREDENTIALS) {
    const credentials = JSON.parse(
      readFileSync(process.env.LEGAL_ACCEPTANCE_CREDENTIALS, 'utf8'),
    );
    assert.equal(typeof credentials.introspectorClientId, 'string', 'introspectorClientId is required');
    assert(credentials.introspectorClientId.trim(), 'introspectorClientId is required');
    Object.assign(config, {
      'legalService.introspectionUrl': credentials.identityUrl + '/oauth/introspect',
      'legalService.clientId': credentials.introspectorClientId,
      'legalService.clientSecret': credentials.introspectorSecret,
    });
    const post = async (path, body) =>
      fetch(credentials.identityUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      });
    const tokenResponse = await post('/oauth/token', {
      grant_type: 'client_credentials',
      client_id: 'access-legal-validator',
      client_secret: credentials.validatorSecret,
      scope: 'legal.authorization.targets.validate',
    });
    assert.equal(tokenResponse.ok, true);
    const { access_token } = await tokenResponse.json();
    try {
      const accepted = await request(undefined, access_token);
      assert.equal(accepted.status, 200);
      assert.equal((await accepted.json()).valid, true);
    } finally {
      const revoked = await post('/oauth/revoke', {
        token: access_token,
        client_id: 'access-legal-validator',
        client_secret: credentials.validatorSecret,
      });
      assert(revoked.ok);
    }
    assert.equal((await request(undefined, access_token)).status, 401);
    console.log(
      'PASS REAL Identity client_credentials -> Legal HTTP -> introspection -> revoke -> 401',
    );
    if (process.env.ACCESS_LEGAL_CLIENT_MODULE) {
      const { LegalTargetValidationClient } = require(process.env.ACCESS_LEGAL_CLIENT_MODULE);
      const clientConfig = {
        LEGAL_VALIDATION_TOKEN_URL: credentials.identityUrl + '/oauth/token',
        LEGAL_VALIDATION_URL: url,
        LEGAL_VALIDATION_CLIENT_SECRET: credentials.validatorSecret,
      };
      const client = new LegalTargetValidationClient({ get: key => clientConfig[key] });
      const originalFetch = globalThis.fetch;
      const issuedTokens = [];
      globalThis.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (String(args[0]) === clientConfig.LEGAL_VALIDATION_TOKEN_URL && response.ok) {
          const value = await response.clone().json();
          if (typeof value.access_token === 'string') issuedTokens.push(value.access_token);
        }
        return response;
      };
      try {
        const verified = await client.validate('legal_application', [applicationIds[0]]);
        assert.equal(verified[0].issuer_id, issuerIds[0]);
        await assert.rejects(client.validate('legal_application', [randomUUID()]), e => e.code === 'ACCESS_INVALID_LEGAL_TARGETS');
        await ds.query("UPDATE issuers SET status='inactive' WHERE id=$1", [issuerIds[0]]);
        await assert.rejects(client.validate('legal_application', [applicationIds[0]]), e => e.code === 'ACCESS_INVALID_LEGAL_TARGETS');
      } finally {
        globalThis.fetch = originalFetch;
        for (const token of issuedTokens) {
          const revoked = await post('/oauth/revoke', {
            token,
            client_id: 'access-legal-validator',
            client_secret: credentials.validatorSecret,
          });
          assert(revoked.ok);
          assert.equal((await request(undefined, token)).status, 401);
        }
      }
      console.log('PASS REAL Access client -> Identity -> Legal -> PostgreSQL; missing targets and fresh parent deactivation denied');
    }

  } else
    console.log(
      'SKIP real Identity acceptance: LEGAL_ACCEPTANCE_CREDENTIALS not configured',
    );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (ds.isInitialized) await ds.destroy();
  });
