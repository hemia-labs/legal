'use strict';
const { createRequire } = require('node:module'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const load = createRequire(
  path.resolve(__dirname, '../../../apps/api/package.json'),
);
const { DataSource } = load('typeorm');
const { Test } = load('@nestjs/testing');
const { ConfigService } = load('@nestjs/config');
const base = path.resolve(
  __dirname,
  '../../../apps/api/dist/src/modules/legal',
);
const { DocumentSetsService } = require(
  base + '/integrations/document-sets/document-sets.service',
);
const controllers = require(
  base + '/integrations/document-sets/document-sets.controller',
);
const { IntegrationAuthGuard } = require(
  base + '/integrations/acceptance/integration-auth.guard',
);
const { LegalAuthGuard } = require(
  path.resolve(base, '../../common/guards/legal-auth.guard'),
);
const { PermissionsGuard } = require(
  path.resolve(base, '../../common/guards/permissions.guard'),
);
const verification = require(
  base + '/integrations/acceptance/verification-http',
);
const { IntegrationRegistryService } = require(
  base + '/integrations/registry/integration-registry.service',
);
const { DocumentSets1793318400000 } = require(
  path.resolve(base, '../../database/migrations/1793318400000-DocumentSets'),
);
assert.equal(process.env.DOCUMENT_SETS_QA_ISOLATED, '1');
const port = Number(process.env.TEST_DATABASE_PORT);
assert.ok(Number.isInteger(port) && port > 1024 && port !== 5432);
const db = new DataSource({
  type: 'postgres',
  host: '127.0.0.1',
  port,
  username: 'postgres',
  password: 'isolated-test-only',
  database: 'legal_document_sets_test',
  synchronize: false,
});
let app;
(async () => {
  await db.initialize();
  try {
    const migration = new DocumentSets1793318400000();
    await db.query(`CREATE TABLE system_capabilities(code text PRIMARY KEY,schema jsonb,updated_at timestamptz);
 CREATE TABLE issuers(id uuid PRIMARY KEY,status text DEFAULT 'active',deleted_at timestamptz);
 CREATE TABLE applications(id uuid PRIMARY KEY,issuer_id uuid REFERENCES issuers(id),status text DEFAULT 'active',deleted_at timestamptz);
 CREATE TABLE systems(id uuid PRIMARY KEY,enabled boolean DEFAULT true,configuration jsonb,services jsonb);
 CREATE TABLE external_identity_sources(id uuid PRIMARY KEY,system_id uuid REFERENCES systems(id),application_id uuid REFERENCES applications(id),issuer_id uuid REFERENCES issuers(id),enabled boolean DEFAULT true);
 CREATE TABLE external_identity_source_clients(id uuid PRIMARY KEY,source_id uuid REFERENCES external_identity_sources(id),oauth_issuer text,client_id text,roles text[],enabled boolean DEFAULT true,UNIQUE(id,source_id));
 CREATE TABLE external_identity_source_documents(source_id uuid REFERENCES external_identity_sources(id),document_id uuid);
 CREATE TABLE external_identity_source_organizations(source_id uuid,organization_id uuid,enabled boolean);
 CREATE TABLE documents(id uuid PRIMARY KEY,application_id uuid REFERENCES applications(id),key text,title text,locale text,document_type text DEFAULT 'terms_and_conditions',status text DEFAULT 'active',deleted_at timestamptz);
 CREATE TABLE document_versions(id uuid PRIMARY KEY,document_id uuid REFERENCES documents(id),version text,status text DEFAULT 'published',content_hash text,effective_from timestamptz,effective_until timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_version_id uuid REFERENCES document_versions(id),status text DEFAULT 'published',organization_id text);
 CREATE TABLE publication_assets(publication_id uuid REFERENCES publications(id),kind text,sha256 text);
 CREATE TABLE audit_events(id uuid DEFAULT gen_random_uuid(),issuer_id uuid,application_id uuid,trace_id text,actor_identity_issuer text,actor_subject_id text,actor_type text,action text,entity_type text,entity_id uuid,metadata jsonb);`);
    await migration.up(db.createQueryRunner());
    const ids = Array.from({ length: 9 }, () => randomUUID()),
      [
        issuer,
        application,
        system,
        source,
        client,
        document,
        version,
        subject,
        session,
      ] = ids;
    await db.query('INSERT INTO issuers(id) VALUES($1)', [issuer]);
    await db.query('INSERT INTO applications(id,issuer_id) VALUES($1,$2)', [
      application,
      issuer,
    ]);
    await db.query(
      'INSERT INTO systems(id,configuration,services) VALUES($1,$2,$3)',
      [
        system,
        JSON.stringify({
          legalAcceptances: {
            identityIssuer: 'urn:example:product',
            productCode: 'example',
            contextService: 'context',
          },
        }),
        JSON.stringify([
          {
            code: 'context',
            url: 'http://127.0.0.1/context',
            resource: 'http://127.0.0.1',
            audience: 'example-api',
            enabled: true,
          },
        ]),
      ],
    );
    await db.query(
      'INSERT INTO external_identity_sources(id,system_id,application_id,issuer_id) VALUES($1,$2,$3,$4)',
      [source, system, application, issuer],
    );
    await db.query(
      "INSERT INTO external_identity_source_clients(id,source_id,oauth_issuer,client_id,roles) VALUES($1,$2,'https://identity.example','example-backend',ARRAY['collector','validator'])",
      [client, source],
    );
    await db.query(
      "INSERT INTO documents(id,application_id,key,title,locale) VALUES($1,$2,'terms','Terms','es-MX')",
      [document, application],
    );
    await db.query(
      'INSERT INTO external_identity_source_documents VALUES($1,$2)',
      [source, document],
    );
    await db.query(
      "INSERT INTO document_versions(id,document_id,version,content_hash) VALUES($1,$2,'1.0.0',$3)",
      [version, document, 'a'.repeat(64)],
    );
    const legal = {
      getAccountDocument: async (appId, id, versionId, locale) => {
        const [r] = await db.query(
          'SELECT v.*,d.title FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE d.application_id=$1 AND d.id=$2 AND v.id=$3 AND d.locale=$4',
          [appId, id, versionId, locale],
        );
        assert.ok(r);
        return {
          document: { id, title: r.title },
          version: { id: r.id },
          contentHash: r.content_hash,
          artifacts: { html: { url: 'https://storage.example/document.html' } },
        };
      },
      getPublicDocument: async (appId, key, locale, v) => {
        const [r] = await db.query(
          'SELECT v.*,d.title,d.id docid FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE d.application_id=$1 AND d.key=$2 AND d.locale=$3 AND v.version=$4',
          [appId, key, locale, v],
        );
        assert.ok(r);
        return {
          document: { title: r.title },
          version: {
            id: r.id,
            effectiveFrom: r.effective_from,
            effectiveUntil: r.effective_until,
          },
          contentHash: r.content_hash,
          artifacts: { html: { url: 'https://storage.example/document.html' } },
        };
      },
    };
    await db.query(
      "UPDATE systems SET configuration=configuration #- '{legalAcceptances,contextService}',services='[]'::jsonb WHERE id=$1",
      [system],
    );
    const platformOrganization = randomUUID();
    const registryConfig = new ConfigService({
      authorization: { platformOrganizationIds: [platformOrganization] },
    });
    const registry = new IntegrationRegistryService(
      db,
      registryConfig,
      {},
    );
    const service = new DocumentSetsService(
      db,
      legal,
      {
        contextUrl: (value) => new URL(value),
        production: false,
        platformOperatorFor: (actor, applicationId) =>
          registry.platformOperatorFor(actor, applicationId),
        canManageSource: (...args) => registry.canManageSource(...args),
      },
      { get: async () => 'synthetic-token' },
    );
    const actor = {
      identityIssuer: 'https://identity.example',
      subjectId: subject,
      actorType: 'user',
      traceId: randomUUID(),
      permissions: [],
      authorization: {
        expiresAt: 9999999999,
        assignments: [
          {
            assignment_id: 'qa',
            assignment_version: 1,
            role_code: 'legal.editor',
            valid_from: 1,
            expires_at: null,
            resource_scope: { type: 'legal_global', ids: [] },
            consumer_scope: { type: 'not_applicable', organization_ids: [] },
          },
        ],
      },
    };
    const caller = {
      issuer: 'https://identity.example',
      clientId: 'example-backend',
      role: 'collector',
    };
    let liveCaller = caller,
      liveActor = actor;
    const module = await Test.createTestingModule({
      controllers: Object.values(controllers),
      providers: [{ provide: DocumentSetsService, useValue: service }],
    })
      .overrideGuard(IntegrationAuthGuard)
      .useValue({
        canActivate: (c) => {
          c.switchToHttp().getRequest().integrationCaller = liveCaller;
          return true;
        },
      })
      .overrideGuard(LegalAuthGuard)
      .useValue({
        canActivate: (c) => {
          c.switchToHttp().getRequest().actor = liveActor;
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const root = await app.getUrl();
    async function http(method, url, body) {
      const response = await fetch(root + url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    const config = {
      sourceId: source,
      name: 'Account terms',
      enabled: true,
      verification: 'collector_attested',
      requiresOrganization: false,
      requiresMfa: false,
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      documents: [
        {
          documentId: document,
          requiredAction: 'accept',
          blocking: true,
          requireReacceptance: true,
        },
      ],
    };
    const setPath = `/v1/legal/applications/${application}/document-sets/registration`,
      publicPath = `/v1/legal/public/${application}/document-sets/registration?locale=es-MX`;
    let response = await http('PUT', setPath, config);
    assert.equal(response.status, 200, JSON.stringify(response));
    const revision = response.body.revision;
    response = await http('PUT', setPath, config);
    assert.equal(response.status, 409);
    response = await http('GET', publicPath);
    assert.equal(response.status, 200, JSON.stringify(response));
    const snapshot = response.body;
    const repeated = await Promise.all(
      Array.from({ length: 5 }, () => http('GET', publicPath)),
    );
    assert.ok(
      repeated.every((r) => r.body.snapshotToken === snapshot.snapshotToken),
    );
    assert.equal(
      (await http('GET', publicPath + '&unexpected=true')).status,
      400,
    );
    const occurrence = new Date().toISOString();
    const evidence = {
      snapshotToken: snapshot.snapshotToken,
      idempotencyKey: randomUUID(),
      subjectId: subject,
      occurredAt: occurrence,
      confirmations: [
        {
          documentVersionId: version,
          contentHash: 'a'.repeat(64),
          action: 'accept',
          confirmed: true,
        },
      ],
    };
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence', {
          ...evidence,
          confirmations: [{ ...evidence.confirmations[0], confirmed: false }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence', {
          ...evidence,
          confirmations: [
            { ...evidence.confirmations[0], contentHash: 'b'.repeat(64) },
          ],
        })
      ).status,
      409,
    );
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        http('POST', '/v1/legal/integrations/evidence', evidence),
      ),
    );
    assert.ok(
      concurrent.every((r) => r.status === 201),
      JSON.stringify(concurrent),
    );
    const receipt = concurrent[0].body;
    assert.ok(
      concurrent.every((r) => r.body.evidenceId === receipt.evidenceId),
    );
    const reordered = Object.fromEntries(Object.entries(evidence).reverse());
    reordered.confirmations = evidence.confirmations.map((c) =>
      Object.fromEntries(Object.entries(c).reverse()),
    );
    assert.equal(
      (await http('POST', '/v1/legal/integrations/evidence', reordered)).body
        .evidenceId,
      receipt.evidenceId,
      'JSON property order cannot change a receipt',
    );
    assert.equal(receipt.authenticationMethod, 'collector_attested');
    assert.equal(receipt.occurredAt, occurrence);
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence', {
          ...evidence,
          subjectId: 'other',
        })
      ).status,
      409,
    );
    liveCaller = { ...caller, clientId: 'other-backend' };
    assert.equal(
      (await http('POST', '/v1/legal/integrations/evidence', evidence)).status,
      403,
    );
    liveCaller = caller;
    const query = {
      applicationId: application,
      documentSetKey: 'registration',
      subjectId: subject,
      locale: 'es-MX',
    };
    assert.equal(
      (await http('POST', '/v1/legal/integrations/pending/evaluate', query))
        .body.pendingDocuments.length,
      0,
    );
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/pending/evaluate', {
          ...query,
          subjectId: 'other',
        })
      ).body.pendingDocuments.length,
      1,
    );
    liveCaller = { ...caller, role: 'validator' };
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence/validate', {
          ...query,
          evidenceId: receipt.evidenceId,
        })
      ).body.valid,
      true,
    );
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence/validate', {
          ...query,
          subjectId: 'other',
          evidenceId: receipt.evidenceId,
        })
      ).status,
      403,
    );
    liveCaller = caller;
    const contractPath = `/v1/legal/applications/${application}/document-sets/subscription_checkout`;
    assert.equal(
      (
        await http('PUT', contractPath, {
          ...config,
          name: 'Subscription',
          requiresOrganization: true,
        })
      ).status,
      200,
    );
    liveCaller = { ...caller, role: 'validator' };
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence/validate', {
          ...query,
          documentSetKey: 'subscription_checkout',
          evidenceId: receipt.evidenceId,
        })
      ).status,
      403,
      'Registration never authorizes checkout',
    );
    liveCaller = caller;
    const contract = (
      await http(
        'GET',
        `/v1/legal/public/${application}/document-sets/subscription_checkout?locale=es-MX`,
      )
    ).body;
    const contractEvidence = {
      ...evidence,
      snapshotToken: contract.snapshotToken,
      idempotencyKey: randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    assert.equal(
      (await http('POST', '/v1/legal/integrations/evidence', contractEvidence))
        .status,
      403,
      'Organization policy is explicit',
    );
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence', {
          ...contractEvidence,
          organizationId: 'clinic-1',
        })
      ).status,
      201,
    );
    await db.query(
      'INSERT INTO external_identity_source_organizations VALUES($1,$2,true)',
      [source, randomUUID()],
    );
    assert.equal(
      (await http('POST', '/v1/legal/integrations/evidence', evidence)).status,
      403,
      'Replays cannot bypass a tightened organization allowlist',
    );
    await db.query(
      'DELETE FROM external_identity_source_organizations WHERE source_id=$1',
      [source],
    );
    const newVersion = randomUUID();
    await db.query(
      "INSERT INTO document_versions(id,document_id,version,content_hash) VALUES($1,$2,'2.0.0',$3)",
      [newVersion, document, 'b'.repeat(64)],
    );
    response = await http(
      'POST',
      '/v1/legal/integrations/pending/evaluate',
      query,
    );
    assert.equal(response.body.pendingDocuments[0].reason, 'new_version');
    assert.equal(response.body.allowed, false);
    liveCaller = { ...caller, role: 'validator' };
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence/validate', {
          ...query,
          evidenceId: receipt.evidenceId,
        })
      ).body.valid,
      false,
    );
    liveCaller = caller;
    assert.equal(
      (await http('POST', '/v1/legal/integrations/evidence', evidence)).body
        .evidenceId,
      receipt.evidenceId,
      'Replay preserves original receipt after a publication',
    );
    const next = (await http('GET', publicPath)).body;
    assert.notEqual(next.snapshotToken, snapshot.snapshotToken);
    assert.equal(next.documents[0].version, '2.0.0');
    const [old] = await db.query(
      `INSERT INTO legal_document_set_snapshots(set_id,source_id,application_id,set_key,set_revision,locale,fingerprint,configuration,documents,created_at,expires_at) SELECT set_id,source_id,application_id,set_key,set_revision,locale,fingerprint,configuration,documents,'2020-01-01','2020-01-02' FROM legal_document_set_snapshots WHERE id=$1 RETURNING id`,
      [snapshot.snapshotToken],
    );
    const delayed = await http('POST', '/v1/legal/integrations/evidence', {
      ...evidence,
      snapshotToken: old.id,
      idempotencyKey: randomUUID(),
      occurredAt: '2020-01-01T12:00:00.000Z',
    });
    assert.equal(delayed.status, 201, JSON.stringify(delayed));
    assert.notEqual(delayed.body.occurredAt, delayed.body.receivedAt);
    assert.equal(
      (
        await http('POST', '/v1/legal/integrations/evidence', {
          ...evidence,
          idempotencyKey: randomUUID(),
          occurredAt: '2019-01-01T00:00:00.000Z',
        })
      ).status,
      409,
    );
    await assert.rejects(
      db.query('UPDATE legal_evidence_receipts SET subject_id=$1 WHERE id=$2', [
        'tamper',
        receipt.evidenceId,
      ]),
    );
    await assert.rejects(
      db.query('DELETE FROM legal_document_set_snapshots WHERE id=$1', [
        old.id,
      ]),
    );
    response = await http(
      'POST',
      '/v1/legal/integrations/evidence/history',
      query,
    );
    assert.equal(response.body.items.length, 2);
    assert.equal(response.body.items[0].documents[0].version, '1.0.0');
    assert.equal(
      (
        await http('PUT', setPath, {
          ...config,
          expectedRevision: revision,
          verification: 'verified_session',
          requiresMfa: true,
        })
      ).status,
      400,
      'Verified policies need a registered verification service',
    );
    await db.query(
      "UPDATE systems SET configuration=jsonb_set(configuration,'{legalAcceptances,contextService}','\"context\"'::jsonb),services=$2::jsonb WHERE id=$1",
      [
        system,
        JSON.stringify([
          {
            code: 'context',
            url: 'http://127.0.0.1/context',
            resource: 'http://127.0.0.1',
            audience: 'example-api',
            enabled: true,
          },
        ]),
      ],
    );
    const strong = {
      ...config,
      expectedRevision: revision,
      verification: 'verified_session',
      requiresMfa: true,
    };
    const strongSet = await http('PUT', setPath, strong);
    assert.equal(strongSet.status, 200);
    assert.equal(
      (await http('POST', '/v1/legal/integrations/pending/evaluate', query))
        .body.pendingDocuments.length,
      1,
      'Weak evidence cannot clear a stronger policy',
    );
    const secure = (await http('GET', publicPath)).body;
    const secureEvidence = {
      ...evidence,
      snapshotToken: secure.snapshotToken,
      idempotencyKey: randomUUID(),
      occurredAt: new Date().toISOString(),
      sessionId: session,
      confirmations: [
        {
          documentVersionId: newVersion,
          contentHash: 'b'.repeat(64),
          action: 'accept',
          confirmed: true,
        },
      ],
    };
    let mfa = false;
    let representativeAllowed = true;
    verification.postVerificationContext = async (
      _url,
      _prod,
      _token,
      body,
    ) => {
      const input = JSON.parse(body);
      return {
        subjectId: input.subjectId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        canAcceptDocuments:
          input.documentSetKey !== 'account_contracts' || representativeAllowed,
        authenticationMethod: 'passkey',
        mfaVerified: mfa,
      };
    };
    assert.equal(
      (await http('POST', '/v1/legal/integrations/evidence', secureEvidence))
        .status,
      403,
    );
    mfa = true;
    response = await http(
      'POST',
      '/v1/legal/integrations/evidence',
      secureEvidence,
    );
    assert.equal(response.status, 201, JSON.stringify(response));
    assert.equal(response.body.authenticationMethod, 'passkey');
    assert.equal(
      (await http('POST', '/v1/legal/integrations/pending/evaluate', query))
        .body.pendingDocuments.length,
      0,
    );
    const reviewPath = '/v1/legal/integrations/pending/prepare';
    const reviewQuery = { ...query, sessionId: session };
    const noReview = await http('POST', reviewPath, reviewQuery);
    assert.deepEqual(noReview.body.documents, []);
    assert.equal(noReview.body.snapshotToken, undefined);
    const privacyDocument = randomUUID(),
      privacyVersion = randomUUID();
    await db.query(
      "INSERT INTO documents(id,application_id,key,title,locale) VALUES($1,$2,'privacy','Privacy','es-MX')",
      [privacyDocument, application],
    );
    await db.query(
      'INSERT INTO external_identity_source_documents VALUES($1,$2)',
      [source, privacyDocument],
    );
    await db.query(
      "INSERT INTO document_versions(id,document_id,version,content_hash) VALUES($1,$2,'1.0.1',$3)",
      [privacyVersion, privacyDocument, 'c'.repeat(64)],
    );
    assert.equal(
      (
        await http('PUT', setPath, {
          ...strong,
          expectedRevision: strongSet.body.revision,
          documents: [
            ...strong.documents,
            {
              ...strong.documents[0],
              documentId: privacyDocument,
              requiredAction: 'acknowledge',
            },
          ],
        })
      ).status,
      200,
    );
    assert.equal((await http('GET', publicPath)).body.documents.length, 2);
    const review = await http('POST', reviewPath, reviewQuery);
    assert.equal(review.status, 201);
    assert.deepEqual(
      review.body.documents.map((d) => d.documentVersionId),
      [privacyVersion],
    );
    const update = {
      ...secureEvidence,
      snapshotToken: review.body.snapshotToken,
      idempotencyKey: randomUUID(),
      occurredAt: new Date().toISOString(),
      confirmations: [
        {
          documentVersionId: privacyVersion,
          contentHash: 'c'.repeat(64),
          action: 'acknowledge',
          confirmed: true,
        },
      ],
    };
    const recordPath = '/v1/legal/integrations/evidence';
    assert.equal(
      (await http('POST', recordPath, { ...update, subjectId: randomUUID() }))
        .status,
      403,
    );
    assert.equal(
      (await http('POST', recordPath, { ...update, sessionId: randomUUID() }))
        .status,
      403,
    );
    assert.equal(
      (
        await http('POST', recordPath, {
          ...update,
          confirmations: [
            ...update.confirmations,
            ...secureEvidence.confirmations,
          ],
        })
      ).status,
      409,
    );
    const updated = await http('POST', recordPath, update);
    assert.equal(updated.status, 201, JSON.stringify(updated));
    assert.equal(
      (await http('POST', recordPath, update)).body.evidenceId,
      updated.body.evidenceId,
    );
    assert.deepEqual(
      (await http('POST', reviewPath, reviewQuery)).body.documents,
      [],
    );
    const updatedHistory = (
      await http('POST', '/v1/legal/integrations/evidence/history', query)
    ).body.items;
    assert.deepEqual(
      updatedHistory[0].documents.map((d) => d.documentVersionId),
      [privacyVersion],
    );
    assert.deepEqual(
      updatedHistory[1].documents.map((d) => d.documentVersionId),
      [newVersion],
    );
    const organizationId = randomUUID();
    const organizationSetPath = setPath.replace(
      /registration$/,
      'account_contracts',
    );
    const organizationSet = {
      ...config,
      evidenceScope: 'organization',
      verification: 'verified_session',
      requiresOrganization: true,
    };
    assert.equal(
      (
        await http('PUT', organizationSetPath, {
          ...organizationSet,
          verification: 'collector_attested',
        })
      ).status,
      400,
    );
    assert.equal(
      (await http('PUT', organizationSetPath, organizationSet)).status,
      200,
    );
    assert.equal(
      (
        await http(
          'GET',
          publicPath.replace('/registration?', '/account_contracts?'),
        )
      ).status,
      404,
    );
    const organizationReview = {
      ...reviewQuery,
      documentSetKey: 'account_contracts',
      organizationId,
    };
    const sharedReview = await http('POST', reviewPath, organizationReview);
    assert.equal(sharedReview.status, 201, JSON.stringify(sharedReview));
    const signature = {
      ...secureEvidence,
      snapshotToken: sharedReview.body.snapshotToken,
      idempotencyKey: randomUUID(),
      organizationId,
      occurredAt: new Date().toISOString(),
    };
    representativeAllowed = false;
    assert.equal((await http('POST', recordPath, signature)).status, 403);
    representativeAllowed = true;
    const signed = await http('POST', recordPath, signature);
    assert.equal(signed.status, 201, JSON.stringify(signed));
    const peer = { ...organizationReview, subjectId: randomUUID() };
    const elsewhere = { ...peer, organizationId: randomUUID() };
    const pendingPath = '/v1/legal/integrations/pending/evaluate';
    const historyPath = '/v1/legal/integrations/evidence/history';
    assert.deepEqual(
      (await http('POST', pendingPath, peer)).body.pendingDocuments,
      [],
    );
    assert.equal(
      (await http('POST', pendingPath, elsewhere)).body.pendingDocuments.length,
      1,
    );
    assert.deepEqual(
      (await http('POST', historyPath, elsewhere)).body.items,
      [],
    );
    assert.equal(
      (
        await http('POST', historyPath, {
          ...elsewhere,
          cursor: signed.body.evidenceId,
        })
      ).status,
      400,
    );
    assert.deepEqual(
      (await http('POST', historyPath, peer)).body.items.map((r) => [
        r.evidenceId,
        r.signerSubjectId,
      ]),
      [[signed.body.evidenceId, subject]],
    );
    const catalogPath = '/v1/legal/integrations/account-catalog';
    const catalogQuery = {
      applicationId: application,
      subjectId: subject,
      organizationId,
      locale: 'es-MX',
    };
    const catalogSetPath = setPath.replace(/registration$/, 'account_policies');
    const policy = {
      ...config,
      usage: 'account',
      documents: [
        {
          documentId: privacyDocument,
          requiredAction: 'informational',
          blocking: false,
          requireReacceptance: false,
        },
      ],
    };
    await db.query(
      "UPDATE documents SET document_type='saas_agreement' WHERE id=$1",
      [privacyDocument],
    );
    await db.query(
      "WITH p AS (INSERT INTO publications(document_version_id) VALUES ($1) RETURNING id) INSERT INTO publication_assets SELECT id,'html',$2 FROM p",
      [privacyVersion, 'c'.repeat(64)],
    );
    assert.equal((await http('PUT', setPath.replace(/registration$/, 'invalid_public'), {
      ...policy,
      usage: undefined,
      documents: [{ ...policy.documents[0], requiredAction: 'accept' }],
    })).status, 400);
    assert.equal(
      (
        await http('PUT', catalogSetPath, {
          ...policy,
          documents: [{ ...policy.documents[0], blocking: true }],
        })
      ).status,
      400,
    );
    assert.equal((await http('PUT', catalogSetPath, policy)).status, 200);
    const catalog = await http('POST', catalogPath, catalogQuery);
    assert.deepEqual(
      catalog.body.sets.map((set) => [
        set.documentSetKey,
        set.documents[0].requiredAction,
      ]),
      [['account_policies', 'informational']],
    );
    const policyQuery = { ...catalogQuery, documentSetKey: 'account_policies' };
    const accountDocumentPath = '/v1/legal/integrations/account-document';
    const internalDocument = await http('POST', accountDocumentPath, {
      ...policyQuery, documentVersionId: privacyVersion,
    });
    assert.equal(internalDocument.status, 201, JSON.stringify(internalDocument));
    assert.equal(internalDocument.body.version.id, privacyVersion);
    assert.equal((await http('POST', accountDocumentPath, {
      ...policyQuery, documentVersionId: randomUUID(),
    })).status, 404);
    assert.deepEqual(
      (await http('POST', pendingPath, policyQuery)).body.pendingDocuments,
      [],
    );
    assert.deepEqual(
      (await http('POST', reviewPath, policyQuery)).body.documents,
      [],
    );
    assert.equal(
      (
        await http(
          'GET',
          publicPath.replace('/registration?', '/account_policies?'),
        )
      ).status,
      404,
    );
    await db.query(
      "UPDATE document_versions SET effective_from='2099-01-01' WHERE id=$1",
      [privacyVersion],
    );
    assert.deepEqual(
      (await http('POST', catalogPath, catalogQuery)).body.sets[0].documents,
      [],
    );
    liveActor = {
      ...actor,
      authorization: {
        ...actor.authorization,
        authenticatedOrganizationId: randomUUID(),
      },
    };
    assert.equal((await http('PUT', setPath, strong)).status, 403);
    const contractSetPath = setPath.replace(/registration$/, 'saas_contract');
    const listPath = setPath.replace(/\/registration$/, '');
    await db.query(
      'UPDATE document_versions SET effective_from=NULL WHERE id=$1',
      [privacyVersion],
    );
    // Representante del consultorio: an internal SaaS contract signed per organization.
    const representativeContract = {
      ...config,
      name: 'Contrato de servicios SaaS',
      usage: 'account',
      evidenceScope: 'organization',
      verification: 'verified_session',
      requiresOrganization: true,
      documents: [
        {
          documentId: privacyDocument,
          requiredAction: 'accept',
          blocking: false,
          requireReacceptance: true,
        },
      ],
    };
    assert.equal(
      (await http('PUT', contractSetPath, representativeContract)).status,
      403,
    );
    assert.equal((await http('GET', listPath)).status, 403);
    liveActor = {
      ...actor,
      authorization: {
        assignments: [],
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        authenticatedOrganizationId: platformOrganization.toUpperCase(),
      },
    };
    const linked = await http('PUT', contractSetPath, representativeContract);
    assert.equal(linked.status, 200, JSON.stringify(linked));
    const listed = await http('GET', listPath);
    assert.equal(listed.status, 200, JSON.stringify(listed));
    const contractSet = listed.body.find((set) => set.key === 'saas_contract');
    assert.equal(contractSet.configuration.usage, 'account');
    assert.equal(contractSet.configuration.evidenceScope, 'organization');
    assert.deepEqual(
      contractSet.configuration.documents.map((doc) => doc.documentId),
      [privacyDocument],
    );
    const contractCatalog = await http('POST', catalogPath, catalogQuery);
    assert.ok(
      contractCatalog.body.sets.some(
        (set) => set.documentSetKey === 'saas_contract',
      ),
      JSON.stringify(contractCatalog.body),
    );
    liveActor = {
      ...liveActor,
      authorization: {
        ...liveActor.authorization,
        authenticatedOrganizationId: randomUUID(),
      },
    };
    assert.equal((await http('GET', listPath)).status, 403);
    assert.equal(
      (
        await http('PUT', contractSetPath, {
          ...representativeContract,
          expectedRevision: linked.body.revision,
        })
      ).status,
      403,
    );
    // A selective binding enables only this identity and application, without
    // granting every member of the organization access to shared policies.
    registryConfig.set('authorization.platformOrganizationIds', []);
    registryConfig.set('authorization.platformOperatorBindings', [{
      identityIssuer: actor.identityIssuer,
      subjectId: actor.subjectId,
      organizationId: platformOrganization,
      applicationIds: [application],
    }]);
    const selectedOperator = {
      ...actor,
      authorization: {
        assignments: [],
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        authenticatedOrganizationId: platformOrganization,
      },
    };
    liveActor = selectedOperator;
    assert.equal((await http('GET', listPath)).status, 200);
    const selectiveUpdate = await http('PUT', contractSetPath, {
      ...representativeContract,
      expectedRevision: linked.body.revision,
    });
    assert.equal(selectiveUpdate.status, 200, JSON.stringify(selectiveUpdate));
    for (const change of [
      { subjectId: randomUUID() },
      { identityIssuer: 'https://another-identity.example' },
      { actorType: 'service' },
      { authorization: { ...selectedOperator.authorization, expiresAt: 1 } },
    ]) {
      liveActor = { ...selectedOperator, ...change };
      assert.equal((await http('GET', listPath)).status, 403);
      assert.equal((await http('PUT', contractSetPath, {
        ...representativeContract,
        expectedRevision: selectiveUpdate.body.revision,
      })).status, 403);
    }
    liveActor = selectedOperator;
    assert.equal((await http('GET', listPath.replace(application, randomUUID()))).status, 403);
    await db.query('INSERT INTO external_identity_source_organizations VALUES($1,$2,true)', [source, randomUUID()]);
    const foreignSourceSets = await http('GET', listPath);
    assert.equal(foreignSourceSets.status, 200);
    assert.deepEqual(foreignSourceSets.body, []);
    assert.equal((await http('PUT', contractSetPath, {
      ...representativeContract,
      expectedRevision: selectiveUpdate.body.revision,
    })).status, 403);
    await db.query('DELETE FROM external_identity_source_organizations WHERE source_id=$1', [source]);
    registryConfig.set('authorization.platformOperatorBindings', []);
    assert.equal((await http('GET', listPath)).status, 403);
    liveActor = actor;
    assert.equal((await http('GET', listPath)).status, 200);
    const count = (
      await db.query('SELECT count(*)::int n FROM audit_events')
    )[0].n;
    assert.ok(count >= 5);
    await migration.down(db.createQueryRunner());
    await migration.up(db.createQueryRunner());
    console.log(
      'PASS real PostgreSQL/HTTP: configuration CAS, public snapshot reuse, validation, eight concurrent retries, provenance/subject isolation, exact version receipts, pending/validation, historical delivery, immutable evidence, real assurance policy, stronger-policy reacceptance, admin scope, audit and migration down/up. No real provider or configured DB.',
    );
  } finally {
    if (app) await app.close();
    await db.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
