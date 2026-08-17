import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SsoAuthGuard } from '@hemia/auth/nestjs';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { LegalErrorFilter } from '../src/common/filters/legal-error.filter';
import { LegalRequest } from '../src/common/types/legal-request';
import { AppModule } from '../src/app.module';
import { LegalContextService } from '../src/modules/legal/services/legal-context.service';
import { LegalOutboxWorker } from '../src/modules/legal/workers/legal-outbox.worker';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'jwks'),
  jwtVerify: jest.fn(),
}));

const headers = {
  'x-identity-issuer': 'dev',
  'x-subject-id': 'console-user',
  'x-actor-type': 'user',
  'x-permissions': '*.*',
  'x-trace-id': 'trace-e2e',
};

describe('Legal catalog (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let worker: LegalOutboxWorker;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SsoAuthGuard)
      .useValue({ canActivate: useTestSso })
      .overrideProvider(LegalContextService)
      .useValue({ require: useTestContext })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new LegalErrorFilter());
    await app.init();
    dataSource = app.get(DataSource);
    worker = app.get(LegalOutboxWorker);
  });

  beforeEach(async () => {
    // This reset is safe only because test/setup-e2e.ts rejects shared databases.
    await dataSource.query(
      'TRUNCATE notifications, outbox_events, audit_events, acceptances, acceptance_rules, document_versions, documents, applications, issuers RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates issuer, application, document and editable draft', async () => {
    const issuer = await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send(issuerPayload('issuer_hemia', 'Hemia'))
      .expect(201)
      .then((response) => response.body as { id: string });

    const application = await request(app.getHttpServer())
      .post('/v1/legal/applications')
      .set(headers)
      .send({ issuerId: issuer.id, key: 'app_loop_prod', name: 'Loop' })
      .expect(201)
      .then((response) => response.body as { id: string });

    const document = await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send({
        issuerId: issuer.id,
        applicationId: application.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos',
      })
      .expect(201)
      .then((response) => response.body as { id: string });

    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft`)
      .set(headers)
      .attach('file', Buffer.from('# v1'), {
        filename: 'terms.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/legal/documents/${document.id}/draft`)
      .set(headers)
      .attach('file', Buffer.from('# v2'), {
        filename: 'terms.md',
        contentType: 'text/markdown',
      })
      .expect(200)
      .expect(({ body }: { body: { sourceKind: string } }) => {
        expect(body.sourceKind).toBe('markdown');
      });
  });

  it('creates and lists an issuer with complete legal data', async () => {
    await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send({
        ...issuerPayload('issuer_acme', 'ACME'),
        taxId: 'ACM010101ABC',
      })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          key: 'issuer_acme',
          name: 'ACME',
          legalName: 'ACME, S.A. de C.V.',
          taxId: 'ACM010101ABC',
          countryCode: 'MX',
          defaultLocale: 'es-MX',
          status: 'active',
        });
      });

    await request(app.getHttpServer())
      .get('/v1/legal/issuers')
      .set(headers)
      .expect(200)
      .expect(
        ({ body }: {
          body: {
            items: Array<{ key: string }>;
            meta: { total: number; page: number; limit: number };
          };
        }) => {
          expect(body.items).toHaveLength(1);
          expect(body.items[0].key).toBe('issuer_acme');
          expect(body.meta).toMatchObject({ total: 1, page: 1, limit: 10 });
        },
      );

    await request(app.getHttpServer())
      .get('/v1/legal/issuers?search=acme&status=active&limit=1')
      .set(headers)
      .expect(200)
      .expect(
        ({ body }: {
          body: {
            items: Array<{ key: string }>;
            meta: { total: number; totalPages: number };
          };
        }) => {
          expect(body.items.map(({ key }) => key)).toEqual(['issuer_acme']);
          expect(body.meta).toMatchObject({ total: 1, totalPages: 1 });
        },
      );

    await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send(issuerPayload('issuer_acme', 'ACME duplicado'))
      .expect(409)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('LEGAL_CONFLICT'),
      );
  });

  it('excludes archived issuers unless requested explicitly', async () => {
    const archived = await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send(issuerPayload('issuer_archived', 'Archivado'))
      .expect(201)
      .then((response) => response.body as { id: string });

    await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send(issuerPayload('issuer_active', 'Activo'))
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/legal/issuers/${archived.id}`)
      .set(headers)
      .expect(204);

    await request(app.getHttpServer())
      .get('/v1/legal/issuers')
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: { items: Array<{ key: string }> } }) => {
        expect(body.items.map(({ key }) => key)).toEqual(['issuer_active']);
      });

    await request(app.getHttpServer())
      .get('/v1/legal/issuers?status=archived')
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: { items: Array<{ key: string }> } }) => {
        expect(body.items.map(({ key }) => key)).toEqual(['issuer_archived']);
      });
  });

  it('requires all mandatory issuer fields', async () => {
    await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send({ key: 'issuer_acme', name: 'ACME', type: 'customer' })
      .expect(400)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('LEGAL_VALIDATION_FAILED'),
      );
  });

  it.each([
    ['type', { type: 'external' }],
    ['key', { key: 'INVALID KEY' }],
    ['uppercase country', { countryCode: 'mx' }],
    ['ISO country', { countryCode: 'ZZ' }],
    ['locale', { defaultLocale: 'not_a_locale' }],
  ])('rejects an invalid issuer %s', async (_field, patch) => {
    await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set(headers)
      .send({ ...issuerPayload('issuer_acme', 'ACME'), ...patch })
      .expect(400);
  });

  it('requires issuer create permission', async () => {
    await request(app.getHttpServer())
      .post('/v1/legal/issuers')
      .set({ ...headers, 'x-permissions': 'legal.issuers.view' })
      .send(issuerPayload('issuer_acme', 'ACME'))
      .expect(403)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('LEGAL_FORBIDDEN'),
      );
  });

  it('rejects cross-issuer document context and archived application writes', async () => {
    const firstIssuer = await createIssuer(app, 'issuer_a');
    const secondIssuer = await createIssuer(app, 'issuer_b');
    const application = await request(app.getHttpServer())
      .post('/v1/legal/applications')
      .set(headers)
      .send({ issuerId: firstIssuer.id, key: 'app_loop_prod', name: 'Loop' })
      .expect(201)
      .then((response) => response.body as { id: string });

    await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send({
        issuerId: secondIssuer.id,
        applicationId: application.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos',
      })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/v1/legal/applications/${application.id}`)
      .set(headers)
      .expect(204);

    await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send({
        issuerId: firstIssuer.id,
        applicationId: application.id,
        key: 'privacy',
        locale: 'es-MX',
        title: 'Privacidad',
      })
      .expect(409);
  });

  it('rejects duplicate document key and locale in the same context', async () => {
    await request(app.getHttpServer())
      .get('/v1/legal/document-types')
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: { code: string }[] }) => {
        expect(body.map(({ code }) => code)).toEqual(
          expect.arrayContaining(['custom_policy', 'terms']),
        );
      });

    const issuer = await createIssuer(app, 'issuer_hemia');
    const application = await request(app.getHttpServer())
      .post('/v1/legal/applications')
      .set(headers)
      .send({ issuerId: issuer.id, key: 'app_loop_prod', name: 'Loop' })
      .expect(201)
      .then((response) => response.body as { id: string });

    const payload = {
      issuerId: issuer.id,
      applicationId: application.id,
      key: 'terms',
      locale: 'es-MX',
      title: 'Terminos',
    };

    await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send({ ...payload, documentType: 'unknown_type' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send(payload)
      .expect(409);
  });

  it('lists, updates and archives documents with an idempotent archive', async () => {
    const document = await createDocument(app, 'terms');

    await request(app.getHttpServer())
      .get('/v1/legal/documents')
      .query({
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      })
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: Array<{ id: string; status: string }> }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: document.id, status: 'active' }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .patch(`/v1/legal/documents/${document.id}`)
      .set(headers)
      .send({ title: 'Terminos actualizados' })
      .expect(200)
      .expect(({ body }: { body: { title: string } }) => {
        expect(body.title).toBe('Terminos actualizados');
      });

    await request(app.getHttpServer())
      .delete(`/v1/legal/documents/${document.id}`)
      .set(headers)
      .expect(204);

    await request(app.getHttpServer())
      .get('/v1/legal/documents')
      .query({
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      })
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: Array<{ id: string; status: string }> }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: document.id, status: 'archived' }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .patch(`/v1/legal/documents/${document.id}`)
      .set(headers)
      .send({ title: 'No permitido' })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/v1/legal/documents/${document.id}`)
      .set(headers)
      .expect(409);
  });

  it('enforces document permissions independently', async () => {
    const issuer = await createIssuer(app, 'issuer_permissions');
    const application = await request(app.getHttpServer())
      .post('/v1/legal/applications')
      .set(headers)
      .send({ issuerId: issuer.id, key: 'app_loop_prod', name: 'Loop' })
      .expect(201)
      .then((response) => response.body as { id: string });
    const payload = {
      issuerId: issuer.id,
      applicationId: application.id,
      key: 'terms',
      locale: 'es-MX',
      title: 'Terminos',
    };

    await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set({ ...headers, 'x-permissions': 'legal.documents.view' })
      .send(payload)
      .expect(403);

    const document = await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set({ ...headers, 'x-permissions': 'legal.documents.create' })
      .send(payload)
      .expect(201)
      .then((response) => response.body as { id: string });

    await request(app.getHttpServer())
      .get('/v1/legal/documents')
      .set({ ...headers, 'x-permissions': 'legal.documents.view' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/v1/legal/documents/${document.id}`)
      .set({ ...headers, 'x-permissions': 'legal.documents.view' })
      .send({ title: 'No permitido' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/v1/legal/documents/${document.id}`)
      .set({ ...headers, 'x-permissions': 'legal.documents.edit' })
      .send({ title: 'Permitido' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/legal/documents/${document.id}`)
      .set({ ...headers, 'x-permissions': 'legal.documents.edit' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/v1/legal/documents/${document.id}`)
      .set({ ...headers, 'x-permissions': 'legal.documents.archive' })
      .expect(204);
  });

  it('resolves public documents by required locale', async () => {
    const issuer = await createIssuer(app, 'issuer_locales');
    const application = await request(app.getHttpServer())
      .post('/v1/legal/applications')
      .set(headers)
      .send({ issuerId: issuer.id, key: 'app_loop_prod', name: 'Loop' })
      .expect(201)
      .then((response) => response.body as { id: string });
    const base = {
      issuerId: issuer.id,
      applicationId: application.id,
      key: 'terms',
      title: 'Terms',
      documentType: 'terms_and_conditions',
    };
    const spanish = await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send({ ...base, locale: 'es-MX', title: 'Terminos' })
      .expect(201)
      .then((response) => response.body as { id: string });
    const english = await request(app.getHttpServer())
      .post('/v1/legal/documents')
      .set(headers)
      .send({ ...base, locale: 'en-US', title: 'Terms' })
      .expect(201)
      .then((response) => response.body as { id: string });

    await publishVersion(app, spanish.id, '1.0.0', '# Terminos');
    await publishVersion(app, english.id, '1.0.0', '# Terms');
    await worker.processPending();

    await request(app.getHttpServer())
      .get(`/v1/legal/public/${application.id}/documents/terms`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/v1/legal/public/${application.id}/documents/terms`)
      .query({ locale: 'es-MX' })
      .expect(200)
      .expect(({ body }: {
        body: {
          document: { locale: string; title: string };
          publication: Record<string, unknown>;
        };
      }) => {
        expect(body.document).toMatchObject({
          locale: 'es-MX',
          title: 'Terminos',
        });
        expect(body.publication).not.toHaveProperty('organizationId');
        expect(body.publication).not.toHaveProperty('productTenantId');
      });

    await request(app.getHttpServer())
      .get(`/v1/legal/public/${application.id}/documents/terms/versions/1.0.0`)
      .query({ locale: 'en-US' })
      .expect(200)
      .expect(({ body }: { body: { document: { locale: string; title: string } } }) => {
        expect(body.document).toMatchObject({
          locale: 'en-US',
          title: 'Terms',
        });
      });
  });

  it('publishes an optional PDF artifact for applications', async () => {
    const document = await createDocument(app, 'pdfterms');
    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft`)
      .set(headers)
      .attach('file', Buffer.from('%PDF-1.7\nlegal'), {
        filename: 'terms.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft/publish`)
      .set(headers)
      .send(publishPayload('1.0.0'))
      .expect(201);
    await worker.processPending();

    await request(app.getHttpServer())
      .get(`/v1/legal/public/${document.applicationId}/documents/${document.key}`)
      .query({ locale: 'es-MX' })
      .expect(200)
      .expect(
        ({ body }: { body: { artifacts: { pdf?: { contentType: string; sha256: string } } } }) => {
          expect(body.artifacts.pdf).toMatchObject({
            contentType: 'application/pdf',
          });
          expect(body.artifacts.pdf?.sha256).toMatch(/^[a-f0-9]{64}$/);
        },
      );
  });

  it('previews and publishes a draft with rule, audit and outbox', async () => {
    const document = await createDocument(app, 'terms');
    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft`)
      .set(headers)
      .attach('file', Buffer.from('# Terminos\n<script>alert(1)</script>'), {
        filename: 'terms.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    const payload = publishPayload('1.0.0');

    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft/preview-publication`)
      .set(headers)
      .send(payload)
      .expect(201)
      .expect(({ body }: { body: { canPublish: boolean } }) => {
        expect(body.canPublish).toBe(true);
      });

    const published = await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft/publish`)
      .set(headers)
      .send(payload)
      .expect(201)
      .then(
        (response) =>
          response.body as { contentHash: string; outboxEventId: string },
      );

    expect(published.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(published.outboxEventId).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft/publish`)
      .set(headers)
      .send(payload)
      .expect(409);

    const [outboxCount] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'legal.version.published'`,
    )) as [{ count: number }];
    expect(outboxCount.count).toBe(1);
  });

  it('supersedes the previous version on a second publication', async () => {
    const document = await createDocument(app, 'terms');
    await publishVersion(app, document.id, '1.0.0', '# v1');
    await publishVersion(app, document.id, '1.1.0', '# v2');

    await request(app.getHttpServer())
      .get(`/v1/legal/documents/${document.id}/versions`)
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: { status: string }[] }) => {
        expect(body.map((row) => row.status).sort()).toEqual([
          'published',
          'superseded',
        ]);
      });
  });

  it('requires publish permission distinct from edit', async () => {
    const document = await createDocument(app, 'terms');
    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft`)
      .set(headers)
      .attach('file', Buffer.from('# v1'), {
        filename: 'terms.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/legal/documents/${document.id}/draft/publish`)
      .set({ ...headers, 'x-permissions': 'legal.versions.edit' })
      .send(publishPayload('1.0.0'))
      .expect(403);
  });

  it('returns pending documents, records acceptance and clears guard 428', async () => {
    const document = await createDocument(app, 'terms');
    const published = await publishVersion(app, document.id, '1.0.0', '# v1');

    await request(app.getHttpServer())
      .get('/v1/legal/me/guard-check')
      .query({
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      })
      .set(headers)
      .expect(428);

    const pending = await request(app.getHttpServer())
      .get('/v1/legal/me/pending')
      .query({
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      })
      .set(headers)
      .expect(200)
      .then(
        (response) =>
          response.body as {
            canContinue: boolean;
            pendingDocuments: {
              documentVersionId: string;
              acceptanceRuleId: string;
            }[];
          },
      );

    expect(pending.canContinue).toBe(false);
    expect(pending.pendingDocuments).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/v1/legal/acceptances')
      .set(headers)
      .send({
        documentVersionId: published.version.id,
        acceptanceRuleId: published.rules[0].id,
        accepted: true,
        locale: 'es-MX',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/v1/legal/me/guard-check')
      .query({
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      })
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: { canContinue: boolean } }) => {
        expect(body.canContinue).toBe(true);
      });
  });

  it('requires Access role for representative acceptance and keeps evidence', async () => {
    const document = await createDocument(app, 'contract');
    const published = await publishVersion(app, document.id, '1.0.0', '# v1', [
      {
        acceptanceMode: 'organization_representative',
        organizationId: 'org_acme',
        role: 'organization_owner',
      },
    ]);

    const payload = {
      documentVersionId: published.version.id,
      acceptanceRuleId: published.rules[0].id,
      accepted: true,
      organizationId: 'org_acme',
    };

    await request(app.getHttpServer())
      .post('/v1/legal/acceptances')
      .set(headers)
      .send(payload)
      .expect(403);

    const acceptance = await request(app.getHttpServer())
      .post('/v1/legal/acceptances')
      .set({ ...headers, 'x-access-roles': 'organization_owner' })
      .send(payload)
      .expect(201)
      .then(
        (response) => response.body as { id: string; roleAtAcceptance: string },
      );

    expect(acceptance.roleAtAcceptance).toBe('organization_owner');

    await request(app.getHttpServer())
      .get(`/v1/legal/acceptances/${acceptance.id}/evidence`)
      .set(headers)
      .expect(200)
      .expect(({ body }: { body: { acceptance: { contentHash: string } } }) => {
        expect(body.acceptance.contentHash).toMatch(/^[a-f0-9]{64}$/);
      });
  });

  it('keeps acceptance idempotent under concurrent requests', async () => {
    const document = await createDocument(app, 'privacy');
    const published = await publishVersion(app, document.id, '1.0.0', '# v1');
    const payload = {
      documentVersionId: published.version.id,
      acceptanceRuleId: published.rules[0].id,
      accepted: true,
    };

    await Promise.all([
      request(app.getHttpServer())
        .post('/v1/legal/acceptances')
        .set(headers)
        .send(payload)
        .expect(201),
      request(app.getHttpServer())
        .post('/v1/legal/acceptances')
        .set(headers)
        .send(payload)
        .expect(201),
    ]);

    const [count] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM acceptances`,
    )) as [{ count: number }];
    expect(count.count).toBe(1);
  });

  it('rejects tenant context without organization', async () => {
    await request(app.getHttpServer())
      .get('/v1/legal/me/pending')
      .query({
        issuerId: '00000000-0000-0000-0000-000000000001',
        applicationId: '00000000-0000-0000-0000-000000000002',
        productTenantId: 'tenant_1',
      })
      .set(headers)
      .expect(400);
  });

  it('processes publication outbox into idempotent notifications', async () => {
    const document = await createDocument(app, 'notify');
    await publishVersion(app, document.id, '1.0.0', '# v1');

    await worker.processPending();
    await worker.processPending();

    const [count] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM notifications`,
    )) as [{ count: number }];
    expect(count.count).toBe(2);

    const notification = await request(app.getHttpServer())
      .get('/v1/legal/notifications')
      .set(headers)
      .expect(200)
      .then((response) => response.body[0] as { id: string });

    await request(app.getHttpServer())
      .post(`/v1/legal/notifications/${notification.id}/cancel`)
      .set({ ...headers, 'x-permissions': 'legal.notifications.view' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/legal/notifications/${notification.id}/cancel`)
      .set(headers)
      .expect(201)
      .expect(({ body }: { body: { status: string } }) => {
        expect(body.status).toBe('cancelled');
      });

    await request(app.getHttpServer())
      .post(`/v1/legal/notifications/${notification.id}/retry`)
      .set(headers)
      .expect(201)
      .expect(({ body }: { body: { status: string } }) => {
        expect(body.status).toBe('pending');
      });
  });

  it('acceptance outbox cancels pending notifications for the version', async () => {
    const document = await createDocument(app, 'cancelnotify');
    const published = await publishVersion(app, document.id, '1.0.0', '# v1');
    await worker.processPending();

    await request(app.getHttpServer())
      .post('/v1/legal/acceptances')
      .set(headers)
      .send({
        documentVersionId: published.version.id,
        acceptanceRuleId: published.rules[0].id,
        accepted: true,
      })
      .expect(201);

    await worker.processPending();

    const [count] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM notifications WHERE status = 'cancelled'`,
    )) as [{ count: number }];
    expect(count.count).toBe(2);
  });

  it('exports acceptances with audit and outbox and serves public published content', async () => {
    const document = await createDocument(app, 'publicterms');
    const published = await publishVersion(
      app,
      document.id,
      '1.0.0',
      '# Public terms',
    );
    await request(app.getHttpServer())
      .post('/v1/legal/acceptances')
      .set(headers)
      .send({
        documentVersionId: published.version.id,
        acceptanceRuleId: published.rules[0].id,
        accepted: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/v1/legal/acceptances/export')
      .query({ format: 'csv' })
      .set({ ...headers, 'x-permissions': 'legal.acceptances.view' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/legal/acceptances/export')
      .query({ format: 'csv' })
      .set(headers)
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain('contentHash');
      });

    await request(app.getHttpServer())
      .get(
        `/v1/legal/public/${document.applicationId}/documents/${document.key}`,
      )
      .query({ locale: 'es-MX' })
      .expect(200)
      .expect(
        ({
          body,
        }: {
          body: { version: { status: string }; contentHash: string };
        }) => {
          expect(body.version.status).toBe('published');
          expect(body.contentHash).toMatch(/^[a-f0-9]{64}$/);
        },
      );

    const [auditCount] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM audit_events WHERE action = 'legal.evidence.export'`,
    )) as [{ count: number }];
    expect(auditCount.count).toBe(1);

    await request(app.getHttpServer())
      .delete(`/v1/legal/documents/${document.id}`)
      .set(headers)
      .expect(204);

    await request(app.getHttpServer())
      .get(
        `/v1/legal/public/${document.applicationId}/documents/${document.key}`,
      )
      .query({ locale: 'es-MX' })
      .expect(404);
  });
});

async function createIssuer(app: INestApplication<App>, key: string) {
  return request(app.getHttpServer())
    .post('/v1/legal/issuers')
    .set(headers)
    .send(issuerPayload(key, key))
    .expect(201)
    .then(
      (response) =>
        response.body as {
          id: string;
          issuerId: string;
          applicationId: string;
        },
    );
}

function issuerPayload(key: string, name: string) {
  return {
    key,
    name,
    legalName: `${name}, S.A. de C.V.`,
    type: 'hemia',
    countryCode: 'MX',
    defaultLocale: 'es-MX',
  };
}

function useTestSso(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest<LegalRequest>();
  request.user = {
    iss: request.header('x-identity-issuer') ?? 'dev',
    sub: request.header('x-subject-id') ?? 'console-user',
  } as never;
  return true;
}

function useTestContext(request: LegalRequest) {
  const permissions = (request.header('x-permissions') ?? '')
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean);
  return {
    organizationId: 'org_acme',
    externalTenantId: 'tenant_acme',
    productTenantId: 'product_tenant_acme',
    contextVersion: 1,
    globalRoles: (request.header('x-access-roles') ?? '')
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean),
    permissions,
  };
}

async function createDocument(app: INestApplication<App>, key: string) {
  const issuer = await createIssuer(app, `issuer_${key}`);
  const application = await request(app.getHttpServer())
    .post('/v1/legal/applications')
    .set(headers)
    .send({ issuerId: issuer.id, key: `app_${key}`, name: 'Loop' })
    .expect(201)
    .then((response) => response.body as { id: string });

  return request(app.getHttpServer())
    .post('/v1/legal/documents')
    .set(headers)
    .send({
      issuerId: issuer.id,
      applicationId: application.id,
      key,
      locale: 'es-MX',
      title: 'Terminos',
    })
    .expect(201)
    .then(
      (response) =>
        response.body as {
          id: string;
          issuerId: string;
          applicationId: string;
          key: string;
        },
    );
}

async function publishVersion(
  app: INestApplication<App>,
  documentId: string,
  version: string,
  markdown: string,
  rules = [{ acceptanceMode: 'individual' }],
) {
  await request(app.getHttpServer())
    .post(`/v1/legal/documents/${documentId}/draft`)
    .set(headers)
    .attach('file', Buffer.from(markdown), {
      filename: 'terms.md',
      contentType: 'text/markdown',
    })
    .expect(201);

  return request(app.getHttpServer())
    .post(`/v1/legal/documents/${documentId}/draft/publish`)
    .set(headers)
    .send(publishPayload(version, rules))
    .expect(201)
    .then(
      (response) =>
        response.body as {
          version: { id: string };
          rules: { id: string; roleAtAcceptance?: string }[];
        },
    );
}

function publishPayload(
  version: string,
  rules = [{ acceptanceMode: 'individual' }],
) {
  return {
    version,
    effectiveFrom: '2026-07-01T00:00:00.000Z',
    acceptanceDeadline: '2026-08-15T23:59:59.000Z',
    gracePeriodDays: 3,
    rules,
  };
}
