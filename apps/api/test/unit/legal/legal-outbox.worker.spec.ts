import { createHash } from 'crypto';
import { AuditEvent } from '../../../src/modules/legal/entities/audit-event.entity';
import { LegalAcceptance } from '../../../src/modules/legal/entities/legal-acceptance.entity';
import { LegalAcceptanceRule } from '../../../src/modules/legal/entities/legal-acceptance-rule.entity';
import { LegalDocumentVersion } from '../../../src/modules/legal/entities/legal-document-version.entity';
import { LegalEvidence } from '../../../src/modules/legal/entities/legal-evidence.entity';
import { LegalNotification } from '../../../src/modules/legal/entities/legal-notification.entity';
import { LegalPublication } from '../../../src/modules/legal/entities/legal-publication.entity';
import { LegalPublicationAsset } from '../../../src/modules/legal/entities/legal-publication-asset.entity';
import { OutboxEvent } from '../../../src/modules/legal/entities/outbox-event.entity';
import { LegalOutboxWorker } from '../../../src/modules/legal/workers/legal-outbox.worker';

describe('LegalOutboxWorker publication uploads', () => {
  it('marks a failed upload and completes an idempotent retry', async () => {
    const outbox = new Repo<OutboxEvent>();
    const rules = new Repo<LegalAcceptanceRule>();
    const notifications = new Repo<LegalNotification>();
    const publications = new Repo<LegalPublication>();
    const assets = new Repo<LegalPublicationAsset>();
    const evidences = new Repo<LegalEvidence>();
    const acceptances = new Repo<LegalAcceptance>();
    const versions = new Repo<LegalDocumentVersion>();
    const audits = new Repo<AuditEvent>();
    let failHtml = true;
    const stored = new Map<string, ReturnType<typeof ref>>();
    const storage = {
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
      contentMarkdown: '# v2',
      contentHtml: '<h1>v2</h1>',
      contentHash: 'a'.repeat(64),
      effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      createdAt: new Date('2026-07-01T00:00:00Z'),
    } as LegalDocumentVersion);
    await publications.save({
      id: 'publication-1',
      documentId: 'document-1',
      documentVersionId: 'version-new',
      issuerId: 'issuer-1',
      applicationId: 'application-1',
      documentType: 'terms',
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
      contentMarkdown: '# v2',
      contentHtml: '<h1>v2</h1>',
      contentHash: 'a'.repeat(64),
      manifestHash: null,
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
      evidences,
      acceptances,
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
      payload: { publicationId: 'publication-1' },
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
    expect(assets.rows).toHaveLength(3);
    expect(assets.rows.every((asset) => asset.s3VersionId)).toBe(true);
  });

  it('generates acceptance evidence with the stored hash and context', async () => {
    const outbox = new Repo<OutboxEvent>();
    const evidences = new Repo<LegalEvidence>();
    const acceptances = new Repo<LegalAcceptance>();
    let uploaded: Buffer | undefined;
    const storage = {
      putImmutable: async (key: string, body: Buffer, contentType: string) => {
        uploaded = body;
        return ref(key, body, contentType);
      },
    };
    await evidences.save({
      id: 'evidence-1',
      acceptanceId: 'acceptance-1',
      documentVersionId: 'version-1',
      status: 'pending',
    } as LegalEvidence);
    await acceptances.save({
      id: 'acceptance-1',
      issuerId: 'issuer-1',
      applicationId: 'application-1',
      organizationId: 'org-1',
      productTenantId: 'tenant-1',
      identityIssuer: 'hemia',
      subjectId: 'user-1',
      documentVersionId: 'version-1',
      contentHash: 'b'.repeat(64),
      acceptedAt: new Date('2026-08-02T12:00:00Z'),
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      authenticationMethod: 'authenticated_session',
    } as LegalAcceptance);

    const worker = new LegalOutboxWorker(
      outbox,
      new Repo<LegalAcceptanceRule>(),
      new Repo<LegalNotification>(),
      new Repo<LegalPublication>(),
      new Repo<LegalPublicationAsset>(),
      evidences,
      acceptances,
      {} as never,
      storage,
    );
    const event = {
      id: 'evidence-event-1',
      traceId: 'trace-1',
      eventType: 'legal.evidence.requested',
      payload: { evidenceId: 'evidence-1', acceptanceId: 'acceptance-1' },
      status: 'pending',
      attemptCount: 0,
      nextRunAt: null,
      processedAt: null,
    } as OutboxEvent;

    await (worker as any).processEvent(event);

    const evidence = evidences.rows[0];
    expect(evidence.status).toBe('ready');
    expect(evidence.s3ObjectKey).toContain('org-1/tenant-1/acceptance-1');
    expect(evidence.sha256).toBe(
      createHash('sha256').update(uploaded!).digest('hex'),
    );
    expect(JSON.parse(uploaded!.toString())).toMatchObject({
      acceptanceId: 'acceptance-1',
      documentHash: 'b'.repeat(64),
      organizationId: 'org-1',
      productTenantId: 'tenant-1',
      authenticationMethod: 'authenticated_session',
    });
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
