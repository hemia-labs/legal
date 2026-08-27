import { createHash } from 'crypto';
import { AuditEvent } from '../../../src/modules/legal/entities/audit-event.entity';
import { LegalAcceptanceRule } from '../../../src/modules/legal/entities/legal-acceptance-rule.entity';
import { LegalDocumentVersion } from '../../../src/modules/legal/entities/legal-document-version.entity';
import { LegalNotification } from '../../../src/modules/legal/entities/legal-notification.entity';
import { LegalPublication } from '../../../src/modules/legal/entities/legal-publication.entity';
import { LegalPublicationAsset } from '../../../src/modules/legal/entities/legal-publication-asset.entity';
import { OutboxEvent } from '../../../src/modules/legal/entities/outbox-event.entity';
import { LegalOutboxWorker } from '../../../src/modules/legal/workers/legal-outbox.worker';
import { analyzeLegalSource } from '../../../src/modules/legal/helpers/legal-source.helper';

describe('LegalOutboxWorker publication uploads', () => {
  it('publishes an HTML source as a private source asset and safe HTML artifact', async () => {
    const outbox = new Repo<OutboxEvent>();
    const rules = new Repo<LegalAcceptanceRule>();
    const notifications = new Repo<LegalNotification>();
    const publications = new Repo<LegalPublication>();
    const assets = new Repo<LegalPublicationAsset>();
    const versions = new Repo<LegalDocumentVersion>();
    const audits = new Repo<AuditEvent>();
    const sourceBody = Buffer.from('<h1>Terms</h1><script>alert(1)</script>');
    const analysis = analyzeLegalSource({
      buffer: sourceBody,
      mimetype: 'text/html',
      originalname: 'terms.html',
    });
    const stored = new Map<string, ReturnType<typeof ref>>();
    const storage = {
      read: async () => sourceBody,
      putImmutable: async (key: string, body: Buffer, contentType: string) => {
        const existing = stored.get(key);
        if (existing) return existing;
        const next = ref(key, body, contentType);
        stored.set(key, next);
        return next;
      },
    };

    await versions.save({
      id: 'version-html',
      documentId: 'document-html',
      version: '1.0.0',
      status: 'draft',
      contentHash: analysis.contentHash,
      sourceHash: analysis.sourceHash,
      sourceKind: 'html',
      sourceContentType: 'text/html',
      sourceFileName: 'terms.html',
      sourceSizeBytes: sourceBody.length,
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    } as LegalDocumentVersion);
    await publications.save({
      id: 'publication-html',
      documentId: 'document-html',
      documentVersionId: 'version-html',
      issuerId: 'issuer-html',
      applicationId: 'application-html',
      documentType: 'terms_and_conditions',
      productId: 'application-html',
      organizationId: null,
      productTenantId: null,
      documentKey: 'terms',
      version: '1.0.0',
      status: 'pending',
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      effectiveUntil: null,
      acceptanceDeadline: null,
      gracePeriodDays: 0,
      rulesSnapshot: [{ acceptanceMode: 'individual' }],
      contentHash: analysis.contentHash,
      sourceKind: 'html',
      sourceHash: analysis.sourceHash,
      requestedByIdentityIssuer: 'dev',
      requestedBySubjectId: 'user',
      publishedByIdentityIssuer: null,
      publishedBySubjectId: null,
      publishedAt: null,
      failureReason: null,
    } as LegalPublication);

    const worker = new LegalOutboxWorker(
      outbox,
      rules,
      notifications,
      publications,
      assets,
      dataSource([
        [LegalPublication, publications],
        [LegalPublicationAsset, assets],
        [LegalDocumentVersion, versions],
        [LegalAcceptanceRule, rules],
        [AuditEvent, audits],
        [OutboxEvent, outbox],
      ]),
      storage,
    );
    const event = {
      id: 'event-html',
      traceId: 'trace-html',
      eventType: 'legal.publication.requested',
      payload: {
        publicationId: 'publication-html',
        locale: 'es-MX',
        sourceKind: 'html',
        sourceHash: analysis.sourceHash,
        sourceFileName: 'terms.html',
        sourceRef: ref('draft-source.html', sourceBody, 'text/html'),
      },
      status: 'pending',
      attemptCount: 0,
      nextRunAt: null,
      processedAt: null,
    } as OutboxEvent;

    await (worker as any).processEvent(event);

    expect(publications.rows[0].status).toBe('published');
    expect(assets.rows.map((asset) => asset.kind).sort()).toEqual(['html', 'source']);
    expect(versions.rows[0].sourceS3ObjectKey).toBe(
      `legal/documents/document-html/versions/1.0.0/source/${analysis.sourceHash}.html`,
    );
  });

  it('marks a failed upload and completes an idempotent retry', async () => {
    const outbox = new Repo<OutboxEvent>();
    const rules = new Repo<LegalAcceptanceRule>();
    const notifications = new Repo<LegalNotification>();
    const publications = new Repo<LegalPublication>();
    const assets = new Repo<LegalPublicationAsset>();
    const versions = new Repo<LegalDocumentVersion>();
    const audits = new Repo<AuditEvent>();
    const sourceBody = Buffer.from('<h1>v2</h1>');
    const sourceAnalysis = analyzeLegalSource({
      buffer: sourceBody,
      mimetype: 'text/html',
      originalname: 'terms.html',
    });
    let failHtml = true;
    const stored = new Map<string, ReturnType<typeof ref>>();
    const storage = {
      read: async () => sourceBody,
      putImmutable: async (key: string, body: Buffer, contentType: string) => {
        if (failHtml && key.endsWith('/html.html')) throw new Error('S3 unavailable');
        const existing = stored.get(key);
        if (existing) return existing;
        const next = ref(key, body, contentType);
        stored.set(key, next);
        return next;
      },
    };

    const previous = versions.save({
      id: 'version-old',
      documentId: 'document-1',
      version: '1.0.0',
      status: 'published',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as LegalDocumentVersion);
    await previous;
    await rules.save({
      id: 'rule-old',
      documentId: 'document-1',
      versionId: 'version-old',
      status: 'active',
    } as LegalAcceptanceRule);
    await versions.save({
      id: 'version-new',
      documentId: 'document-1',
      version: '2.0.0',
      status: 'draft',
      contentHash: sourceAnalysis.contentHash,
      sourceKind: 'html',
      sourceContentType: 'text/html',
      sourceFileName: 'terms.html',
      sourceSizeBytes: sourceBody.length,
      sourceHash: sourceAnalysis.sourceHash,
      effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      createdAt: new Date('2026-07-01T00:00:00Z'),
    } as LegalDocumentVersion);
    await publications.save({
      id: 'publication-1',
      documentId: 'document-1',
      documentVersionId: 'version-new',
      issuerId: 'issuer-1',
      applicationId: 'application-1',
      documentType: 'terms_and_conditions',
      productId: 'product-1',
      organizationId: null,
      productTenantId: null,
      documentKey: 'terms',
      version: '2.0.0',
      status: 'pending',
      effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      effectiveUntil: null,
      acceptanceDeadline: null,
      gracePeriodDays: 0,
      rulesSnapshot: [{ acceptanceMode: 'individual' }],
      contentHash: sourceAnalysis.contentHash,
      sourceKind: 'html',
      sourceHash: sourceAnalysis.sourceHash,
      requestedByIdentityIssuer: 'dev',
      requestedBySubjectId: 'user',
      publishedByIdentityIssuer: null,
      publishedBySubjectId: null,
      publishedAt: null,
      failureReason: null,
    } as LegalPublication);

    const worker = new LegalOutboxWorker(
      outbox,
      rules,
      notifications,
      publications,
      assets,
      dataSource([
        [LegalPublication, publications],
        [LegalPublicationAsset, assets],
        [LegalDocumentVersion, versions],
        [LegalAcceptanceRule, rules],
        [AuditEvent, audits],
        [OutboxEvent, outbox],
      ]),
      storage,
    );
    const event = {
      id: 'event-1',
      traceId: 'trace-1',
      eventType: 'legal.publication.requested',
      payload: {
        publicationId: 'publication-1',
        locale: 'es-MX',
        sourceKind: 'html',
        sourceHash: sourceAnalysis.sourceHash,
        sourceFileName: 'terms.html',
        sourceRef: ref(
          `legal/documents/document-1/draft/source/${sourceAnalysis.sourceHash}.html`,
          sourceBody,
          'text/html',
        ),
      },
      status: 'pending',
      attemptCount: 0,
      nextRunAt: null,
      processedAt: null,
    } as OutboxEvent;
    await outbox.save(event);

    await expect((worker as any).processEvent(event)).rejects.toThrow('S3 unavailable');
    expect(publications.rows[0].status).toBe('failed');
    expect(versions.rows.find((row) => row.id === 'version-old')?.status).toBe(
      'published',
    );

    failHtml = false;
    await (worker as any).processEvent(event);

    expect(publications.rows[0].status).toBe('published');
    expect(versions.rows.find((row) => row.id === 'version-old')?.status).toBe(
      'superseded',
    );
    expect(versions.rows.find((row) => row.id === 'version-new')?.status).toBe(
      'published',
    );
    expect(assets.rows).toHaveLength(2);
    expect(assets.rows.some((asset) => asset.kind === 'pdf')).toBe(false);
    expect(assets.rows.every((asset) => asset.s3VersionId)).toBe(true);

    await (worker as any).processEvent(event);
    expect(assets.rows).toHaveLength(2);
  });

});

function ref(key: string, body: Buffer, contentType: string) {
  return {
    bucket: 'legal-test',
    key,
    versionId: `test-${createHash('sha256').update(body).digest('hex').slice(0, 16)}`,
    etag: null,
    contentType,
    size: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

class Repo<T extends { id: string }> {
  rows: T[] = [];

  create(data: Partial<T>) {
    return data as T;
  }

  async save(entity: T | T[]) {
    if (Array.isArray(entity)) {
      for (const row of entity) await this.save(row);
      return entity;
    }
    if (!entity.id) entity.id = `id-${this.rows.length + 1}`;
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index === -1) this.rows.push(entity);
    else this.rows[index] = entity;
    return entity;
  }

  findOneBy(where: Partial<T>) {
    return Promise.resolve(this.rows.find((row) => matches(row, where)) ?? null);
  }

  find(options: { where?: Partial<T> } = {}) {
    return Promise.resolve(
      this.rows.filter((row) => matches(row, options.where ?? {})),
    );
  }

  findOne(options: { where?: Partial<T> }) {
    return this.find(options).then((rows) => rows[0] ?? null);
  }

  update(where: Partial<T>, patch: Partial<T>) {
    for (const row of this.rows.filter((item) => matches(item, where))) {
      Object.assign(row, patch);
    }
    return Promise.resolve({ affected: 1 });
  }
}

function matches<T>(row: T, where: Partial<T>) {
  return Object.entries(where).every(
    ([key, value]) => row[key as keyof T] === value,
  );
}

function dataSource(repos: [unknown, unknown][]) {
  const map = new Map(repos);
  const manager = { getRepository: (entity: unknown) => map.get(entity) };
  return {
    transaction: (work: (manager: unknown) => unknown) => work(manager),
  } as never;
}
