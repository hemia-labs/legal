const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createLegalClient } = require('../dist');

const baseUrl = 'https://legal.test/proxy';
const query = {
  applicationId: randomUUID(),
  documentSetKey: 'annual-review',
  locale: 'fr-CA',
};
const expiresAt = new Date(Date.now() + 60_000).toISOString();
const document = {
  documentId: randomUUID(),
  documentVersionId: randomUUID(),
  documentKey: 'privacy_policy',
  title: 'Privacy policy',
  version: '2',
  contentHash: 'a'.repeat(64),
  requiredAction: 'acknowledge',
  blocking: true,
  requireReacceptance: true,
  deadline: null,
  artifacts: {
    html: {
      url: 'https://documents.test/policy?signature=example',
      expiresAt,
      contentType: 'text/html',
      size: 16,
      sha256: 'a'.repeat(64),
    },
  },
};
const snapshot = {
  applicationId: query.applicationId,
  documentSetKey: query.documentSetKey,
  revision: randomUUID(),
  snapshotToken: randomUUID(),
  expiresAt,
  documents: [document],
};

test('public reads support configurable sets and locales without OAuth', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(
      url.href,
      `${baseUrl}/v1/legal/public/${query.applicationId}/document-sets/annual-review?locale=fr-CA`,
    );
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).has('authorization'), false);
    return Response.json(snapshot);
  });

  assert.deepEqual(
    await createLegalClient({ baseUrl }).getDocumentSet(query),
    snapshot,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test('evidence uses only its OAuth scope and preserves the saved event on retry', async (t) => {
  const input = {
    snapshotToken: snapshot.snapshotToken,
    idempotencyKey: randomUUID(),
    subjectId: 'account-123',
    occurredAt: new Date().toISOString(),
    confirmations: [
      {
        documentVersionId: document.documentVersionId,
        contentHash: document.contentHash,
        action: 'acknowledge',
        confirmed: true,
      },
    ],
  };
  const receipt = {
    evidenceId: randomUUID(),
    snapshotToken: input.snapshotToken,
    recorded: true,
    occurredAt: input.occurredAt,
    receivedAt: input.occurredAt,
    authenticationMethod: 'collector_attested',
  };
  const scope = 'legal.integration.acceptances.create';
  let tokenRequests = 0;
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url) === 'https://identity.test/oauth/token') {
      tokenRequests++;
      assert.equal(init.body.get('scope'), scope);
      assert.equal(init.body.get('resource'), 'https://legal.test');
      return Response.json({
        access_token: 'fixture-token',
        token_type: 'Bearer',
        expires_in: 60,
        scope,
      });
    }
    posts++;
    assert.equal(url.href, `${baseUrl}/v1/legal/integrations/evidence`);
    assert.equal(init.headers.get('authorization'), 'Bearer fixture-token');
    assert.deepEqual(JSON.parse(init.body), input);
    if (posts === 1)
      return Response.json({ message: 'fixture detail' }, { status: 503 });
    return Response.json(receipt, { status: 201 });
  });

  const client = createLegalClient({
    baseUrl,
    auth: {
      issuer: 'https://identity.test',
      tokenUrl: 'https://identity.test/oauth/token',
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
    },
  });
  await assert.rejects(client.recordEvidence(input), {
    code: 'http',
    status: 503,
  });
  assert.equal(posts, 1);
  assert.deepEqual(await client.recordEvidence(input), receipt);
  assert.equal(posts, 2);
  assert.equal(tokenRequests, 1);
});

test('rejects a snapshot for another set and unsafe URL segments', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ ...snapshot, documentSetKey: 'different-set' }),
  );
  const client = createLegalClient({ baseUrl });
  await assert.rejects(client.getDocumentSet(query), { code: 'contract' });
  await assert.rejects(
    client.getDocumentSet({ ...query, documentSetKey: '../evidence' }),
    { code: 'configuration' },
  );
  assert.equal(fetch.mock.callCount(), 1);
});
