import { ConflictException } from '@nestjs/common';
import { LegalActor } from '../../../src/common/types/legal-request';
import { AuditEvent } from '../../../src/modules/legal/entities/audit-event.entity';
import { LegalAcceptance } from '../../../src/modules/legal/entities/legal-acceptance.entity';
import { LegalAcceptanceRule } from '../../../src/modules/legal/entities/legal-acceptance-rule.entity';
import { LegalApplication } from '../../../src/modules/legal/entities/legal-application.entity';
import { LegalDocument } from '../../../src/modules/legal/entities/legal-document.entity';
import { LegalDocumentVersion } from '../../../src/modules/legal/entities/legal-document-version.entity';
import { LegalEvidence } from '../../../src/modules/legal/entities/legal-evidence.entity';
import { LegalIssuer } from '../../../src/modules/legal/entities/legal-issuer.entity';
import { LegalNotification } from '../../../src/modules/legal/entities/legal-notification.entity';
import { LegalPublication } from '../../../src/modules/legal/entities/legal-publication.entity';
import { LegalPublicationAsset } from '../../../src/modules/legal/entities/legal-publication-asset.entity';
import { OutboxEvent } from '../../../src/modules/legal/entities/outbox-event.entity';
import { PublishDraftDto } from '../../../src/modules/legal/dtos/legal-catalog.dto';
import { analyzeLegalSource } from '../../../src/modules/legal/helpers/legal-source.helper';
import { LegalService } from '../../../src/modules/legal/services/legal.service';

const actor: LegalActor = {
  identityIssuer: 'dev',
  subjectId: 'tester',
  actorType: 'user',
  permissions: ['*.*'],
  traceId: 'trace-test',
};

const issuerDto = (key: string, name = 'Hemia') => ({
  key,
  name,
  legalName: `${name}, S.A. de C.V.`,
  type: 'hemia',
  countryCode: 'MX',
  defaultLocale: 'es-MX',
});

const markdownSource = (value: string, fileName = 'source.md') => ({
  buffer: Buffer.from(value),
  mimetype: 'text/markdown',
  originalname: fileName,
});

describe('LegalService', () => {
  let issuers: Repo<LegalIssuer>;
  let applications: Repo<LegalApplication>;
  let documents: Repo<LegalDocument>;
  let versions: Repo<LegalDocumentVersion>;
  let rules: Repo<LegalAcceptanceRule>;
  let acceptances: Repo<LegalAcceptance>;
  let notifications: Repo<LegalNotification>;
  let audit: Repo<AuditEvent>;
  let outbox: Repo<OutboxEvent>;
  let publications: Repo<LegalPublication>;
  let publicationAssets: Repo<LegalPublicationAsset>;
  let evidences: Repo<LegalEvidence>;
  let service: LegalService;

  beforeEach(() => {
    issuers = new Repo();
    applications = new Repo();
    documents = new Repo();
    versions = new Repo();
    rules = new Repo();
    acceptances = new Repo();
    notifications = new Repo();
    audit = new Repo();
    outbox = new Repo();
    publications = new Repo();
    publicationAssets = new Repo();
    evidences = new Repo();
    service = new LegalService(
      issuers as never,
      applications as never,
      documents as never,
      versions as never,
      rules as never,
      acceptances as never,
      notifications as never,
      audit as never,
      outbox as never,
      publications as never,
      publicationAssets as never,
      evidences as never,
      dataSource([
        [LegalIssuer, issuers],
        [LegalApplication, applications],
        [LegalDocument, documents],
        [LegalDocumentVersion, versions],
        [LegalAcceptanceRule, rules],
        [LegalAcceptance, acceptances],
        [LegalNotification, notifications],
        [AuditEvent, audit],
        [OutboxEvent, outbox],
        [LegalPublication, publications],
        [LegalPublicationAsset, publicationAssets],
        [LegalEvidence, evidences],
      ]) as never,
      {
        rolesFromRequest: () => [],
        ensureRole: (role: string | null, roles: string[]) => {
          if (role && !roles.includes(role))
            throw new ConflictException('missing role');
        },
      } as never,
      {
        putImmutable: jest.fn(async (key: string, body: Buffer, contentType: string) => ({
          bucket: 'legal-test',
          key,
          versionId: 'source-version',
          etag: null,
          contentType,
          size: body.length,
          sha256: 'a'.repeat(64),
        })),
        signedDownloadUrl: jest.fn(),
      } as never,
    );
  });

  it('creates a complete issuer and its audit event', async () => {
    const created = await service.createIssuer(
      { ...issuerDto('issuer_acme', 'ACME'), taxId: 'ACM010101ABC' },
      actor,
    );

    expect(created).toMatchObject({
      key: 'issuer_acme',
      name: 'ACME',
      legalName: 'ACME, S.A. de C.V.',
      taxId: 'ACM010101ABC',
      countryCode: 'MX',
      defaultLocale: 'es-MX',
      status: 'active',
    });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: 'legal.issuer.create',
      entityType: 'legal_issuer',
      issuerId: created.id,
    });
  });

  it('blocks duplicate issuer keys', async () => {
    await service.createIssuer(issuerDto('issuer_hemia'), actor);

    await expect(
      service.createIssuer(issuerDto('issuer_hemia', 'Hemia 2'), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps concurrent issuer key collisions to conflict', async () => {
    jest.spyOn(issuers, 'save').mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.createIssuer(issuerDto('issuer_hemia'), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks documents under archived applications', async () => {
    const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
    const app = await service.createApplication(
      { issuerId: issuer.id, key: 'loop', name: 'Loop' },
      actor,
    );
    await service.archiveApplication(app.id, actor);

    await expect(
      service.createDocument(
        {
          issuerId: issuer.id,
          applicationId: app.id,
          key: 'terms',
          locale: 'es-MX',
          title: 'Terminos',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps concurrent document key collisions to conflict', async () => {
    const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
    const application = await service.createApplication(
      { issuerId: issuer.id, key: 'loop', name: 'Loop' },
      actor,
    );
    jest.spyOn(documents, 'save').mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.createDocument(
        {
          issuerId: issuer.id,
          applicationId: application.id,
          key: 'terms',
          locale: 'es-MX',
          title: 'Terminos',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates and archives a document with auditable lifecycle actions', async () => {
    const document = await createDocument(service);

    const updated = await service.updateDocument(
      document.id,
      { title: 'Terminos actualizados' },
      actor,
    );
    expect(updated.title).toBe('Terminos actualizados');
    expect(audit.rows.at(-1)).toMatchObject({
      action: 'legal.document.edit',
      entityType: 'legal_document',
      entityId: document.id,
    });

    await service.archiveDocument(document.id, actor);
    expect(documents.rows[0].status).toBe('archived');
    const auditCount = audit.rows.length;

    await expect(
      service.archiveDocument(document.id, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.updateDocument(document.id, { title: 'No permitido' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.rows).toHaveLength(auditCount);
  });

  it('lists documents by issuer and application context', async () => {
    const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
    const firstApp = await service.createApplication(
      { issuerId: issuer.id, key: 'loop', name: 'Loop' },
      actor,
    );
    const secondApp = await service.createApplication(
      { issuerId: issuer.id, key: 'horus', name: 'Horus' },
      actor,
    );
    await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: firstApp.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos Loop',
      },
      actor,
    );
    await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: secondApp.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos Horus',
      },
      actor,
    );

    const documentsForLoop = await service.listDocuments({
      issuerId: issuer.id,
      applicationId: firstApp.id,
    });

    expect(documentsForLoop).toHaveLength(1);
    expect(documentsForLoop[0].applicationId).toBe(firstApp.id);
  });

  it('blocks document creation when issuer or application is inactive', async () => {
    const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
    const application = await service.createApplication(
      { issuerId: issuer.id, key: 'loop', name: 'Loop' },
      actor,
    );

    await service.updateApplicationStatus(application.id, 'inactive', actor);
    await expect(
      service.createDocument(
        {
          issuerId: issuer.id,
          applicationId: application.id,
          key: 'terms',
          locale: 'es-MX',
          title: 'Terminos',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.updateApplicationStatus(application.id, 'active', actor);
    await service.updateIssuerStatus(issuer.id, 'inactive', actor);
    await expect(
      service.createDocument(
        {
          issuerId: issuer.id,
          applicationId: application.id,
          key: 'privacy',
          locale: 'es-MX',
          title: 'Privacidad',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows changing an application issuer before documents exist', async () => {
    const originalIssuer = await service.createIssuer(
      issuerDto('issuer_original', 'Original'),
      actor,
    );
    const targetIssuer = await service.createIssuer(
      issuerDto('issuer_target', 'Target'),
      actor,
    );
    const application = await service.createApplication(
      { issuerId: originalIssuer.id, key: 'portal', name: 'Portal' },
      actor,
    );

    const updated = await service.updateApplication(
      application.id,
      { issuerId: targetIssuer.id },
      actor,
    );

    expect(updated.issuerId).toBe(targetIssuer.id);
  });

  it('blocks changing an application issuer after documents exist', async () => {
    const originalIssuer = await service.createIssuer(
      issuerDto('issuer_original', 'Original'),
      actor,
    );
    const targetIssuer = await service.createIssuer(
      issuerDto('issuer_target', 'Target'),
      actor,
    );
    const application = await service.createApplication(
      { issuerId: originalIssuer.id, key: 'portal', name: 'Portal' },
      actor,
    );
    await service.createDocument(
      {
        issuerId: originalIssuer.id,
        applicationId: application.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Términos',
      },
      actor,
    );

    await expect(
      service.updateApplication(
        application.id,
        { issuerId: targetIssuer.id },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('filters and paginates applications with metadata', async () => {
    const issuer = await service.createIssuer(
      issuerDto('issuer_applications', 'Applications'),
      actor,
    );
    const otherIssuer = await service.createIssuer(
      issuerDto('issuer_other', 'Other'),
      actor,
    );
    const archived = await service.createApplication(
      { issuerId: issuer.id, key: 'archived', name: 'Archived' },
      actor,
    );
    await service.archiveApplication(archived.id, actor);
    await service.createApplication(
      { issuerId: issuer.id, key: 'portal', name: 'Portal' },
      actor,
    );
    await service.createApplication(
      { issuerId: issuer.id, key: 'admin', name: 'Admin' },
      actor,
    );
    await service.createApplication(
      { issuerId: otherIssuer.id, key: 'other', name: 'Other app' },
      actor,
    );

    const response = await service.listApplications({
      issuerId: issuer.id,
      status: 'active',
      page: 2,
      limit: 1,
    });

    expect(response.meta).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0].issuerId).toBe(issuer.id);
    expect(response.items[0].status).toBe('active');
  });

  it('supports application lifecycle actions separately', async () => {
    const issuer = await service.createIssuer(
      issuerDto('issuer_lifecycle', 'Lifecycle'),
      actor,
    );
    const application = await service.createApplication(
      { issuerId: issuer.id, key: 'lifecycle', name: 'Lifecycle' },
      actor,
    );

    await service.updateApplicationStatus(application.id, 'inactive', actor);
    expect(applications.rows[0].status).toBe('inactive');
    const defaultList = await service.listApplications({
      page: 1,
      limit: 10,
    });
    expect(defaultList.items).toHaveLength(1);
    expect(defaultList.items[0].status).toBe('inactive');

    const activeList = await service.listApplications({
      page: 1,
      limit: 10,
      status: 'active',
    });
    expect(activeList.items).toHaveLength(0);

    await service.updateApplicationStatus(application.id, 'active', actor);
    await service.archiveApplication(application.id, actor);
    expect(applications.rows[0].status).toBe('archived');

    await service.unarchiveApplication(application.id, actor);
    expect(applications.rows[0].status).toBe('active');

    await service.deleteApplication(application.id, actor);
    expect(applications.rows[0].deletedAt).toBeInstanceOf(Date);
  });

  it('keeps document key uniqueness scoped by issuer and application', async () => {
    const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
    const firstApp = await service.createApplication(
      { issuerId: issuer.id, key: 'loop', name: 'Loop' },
      actor,
    );
    const secondApp = await service.createApplication(
      { issuerId: issuer.id, key: 'horus', name: 'Horus' },
      actor,
    );

    await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: firstApp.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos Loop',
      },
      actor,
    );
    const other = await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: secondApp.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos Horus',
      },
      actor,
    );

    expect(other.applicationId).toBe(secondApp.id);
  });

  it('exposes the controlled document type catalog', () => {
    expect(service.listDocumentTypes().map(({ code }) => code)).toEqual([
      'terms_and_conditions',
      'privacy_notice',
      'acceptable_use_policy',
      'ai_usage_policy',
      'cookie_policy',
      'security_policy',
      'data_processing_agreement',
      'saas_agreement',
      'nda',
      'custom_policy',
      'terms',
    ]);
  });

  it('returns the selected public locale and acceptance summary', async () => {
    const document = await createDocument(service);
    const version = await versions.save({
      id: 'version-public',
      documentId: document.id,
      version: '1.0.0',
      status: 'published',
      contentMarkdown: '# Terminos',
      contentHtml: '<h1>Terminos</h1>',
      contentHash: 'b'.repeat(64),
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
    } as LegalDocumentVersion);
    await publications.save({
      id: 'publication-public',
      documentId: document.id,
      documentVersionId: version.id,
      issuerId: document.issuerId,
      applicationId: document.applicationId,
      documentType: document.documentType,
      productId: document.applicationId,
      documentKey: document.key,
      version: version.version,
      status: 'published',
      effectiveFrom: version.effectiveFrom,
      rulesSnapshot: [],
      contentMarkdown: version.contentMarkdown,
      contentHtml: version.contentHtml,
      contentHash: version.contentHash,
    } as LegalPublication);
    await rules.save({
      id: 'rule-public',
      documentId: document.id,
      versionId: version.id,
      acceptanceMode: 'individual',
      isBlocking: true,
      status: 'active',
      startsAt: null,
      endsAt: null,
    } as LegalAcceptanceRule);
    await publicationAssets.save({
      id: 'asset-public',
      publicationId: 'publication-public',
      kind: 'html',
      s3Bucket: 'legal-test',
      s3ObjectKey: 'documents/issuer/application/es-mx/global/global/terms/1.0.0/html.html',
      s3VersionId: 'asset-version',
      contentType: 'text/html',
      sizeBytes: 20,
      sha256: 'c'.repeat(64),
    } as LegalPublicationAsset);
    const storage = (service as never as {
      storage: { signedDownloadUrl: jest.Mock };
    }).storage;
    storage.signedDownloadUrl.mockResolvedValue({
      url: 'https://storage.test/document.html',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const response = await service.getPublicDocument(
      document.applicationId,
      document.key,
      'es-MX',
    );

    expect(response.document.locale).toBe('es-MX');
    expect(response.version.contentHash).toBe('b'.repeat(64));
    expect(response.acceptance).toMatchObject({
      required: true,
      blocking: true,
      rules: [{ acceptanceMode: 'individual', isBlocking: true }],
    });
    expect(response.publication).not.toHaveProperty('organizationId');
    expect(response.publication).not.toHaveProperty('productTenantId');
    await expect(
      service.getPublicDocument(document.applicationId, document.key, 'en-US'),
    ).rejects.toThrow('Document not found');
  });

  it('allows editing one draft and rejects a second draft', async () => {
    const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
    const app = await service.createApplication(
      { issuerId: issuer.id, key: 'loop', name: 'Loop' },
      actor,
    );
    const document = await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: app.id,
        key: 'terms',
        locale: 'es-MX',
        title: 'Terminos',
      },
      actor,
    );

    await service.createDraft(document.id, markdownSource('# v1'), actor);
    const edited = await service.updateDraft(
      document.id,
      markdownSource('# v2', 'replacement.md'),
      actor,
    );

    expect(edited.sourceFileName).toBe('replacement.md');
    await expect(
      service.createDraft(document.id, markdownSource('# v3'), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores an uploaded HTML source with separate source and content hashes', async () => {
    const document = await createDocument(service);
    const source = Buffer.from('<h1>Terms</h1><script>alert(1)</script>');
    const storage = (service as never as {
      storage: { putImmutable: jest.Mock };
    }).storage;
    storage.putImmutable.mockResolvedValue({
      bucket: 'legal-test',
      key: 'documents/issuer/application/es-mx/global/global/terms/draft/source.html',
      versionId: 'source-version',
      etag: null,
      contentType: 'text/html',
      size: source.length,
      sha256: 'a'.repeat(64),
    });

    const draft = await service.createDraft(
      document.id,
      {
        buffer: source,
        mimetype: 'text/html',
        originalname: 'terms.html',
      },
      actor,
    );

    expect(draft).toMatchObject({
      sourceKind: 'html',
      sourceContentType: 'text/html',
      sourceFileName: 'terms.html',
      sourceSizeBytes: source.length,
    });
    expect(draft.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.sourceHash).not.toBe(draft.contentHash);
    expect(draft).not.toHaveProperty('contentMarkdown');
  });

  it('publishes a draft with reproducible hash, rule and outbox event', async () => {
    const document = await createDocument(service);

    await service.createDraft(
      document.id,
      markdownSource('# v1\r\n'),
      actor,
    );
    const published = await publishAndActivate(
      document.id,
      {
        version: '1.0.0',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
        gracePeriodDays: 3,
        rules: [{ acceptanceMode: 'individual' }],
      },
      actor,
    );

    expect(published.contentHash).toBe(
      analyzeLegalSource(markdownSource('# v1\r\n')).contentHash,
    );
    expect(published.rules).toHaveLength(1);
    expect(outbox.rows).toHaveLength(1);
    await expect(
      service.updateDraft(document.id, markdownSource('# nope'), actor),
    ).rejects.toThrow('Draft not found');
  });

  it('rejects duplicate and overlapping publication rules', async () => {
    const document = await createDocument(service);
    await service.createDraft(document.id, markdownSource('# v1'), actor);

    await expect(
      service.publishDraft(
        document.id,
        {
          version: '1.0.0',
          effectiveFrom: '2026-08-10T00:00:00.000Z',
          rules: [
            { acceptanceMode: 'individual' },
            { acceptanceMode: 'individual' },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('evaluates the most specific pending rule', async () => {
    const document = await createDocument(service);
    await service.createDraft(document.id, markdownSource('# v1'), actor);
    const published = await publishAndActivate(
      document.id,
      {
        version: '1.0.0',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
        rules: [
          { acceptanceMode: 'individual' },
          { acceptanceMode: 'informational', organizationId: 'org_1' },
        ],
      },
      actor,
    );

    const pending = await service.evaluatePending({
      issuerId: published.rules[0].issuerId,
      applicationId: published.rules[0].applicationId,
      identityIssuer: 'dev',
      subjectId: 'user_1',
      organizationId: 'org_1',
      roles: [],
    });

    expect(pending.canContinue).toBe(true);
    expect(pending.pendingDocuments[0].acceptanceMode).toBe('informational');
  });

  it('keeps acceptances scoped by identity issuer and subject', async () => {
    const document = await createDocument(service);
    await service.createDraft(document.id, markdownSource('# v1'), actor);
    const published = await publishAndActivate(
      document.id,
      {
        version: '1.0.0',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
        rules: [{ acceptanceMode: 'individual' }],
      },
      actor,
    );

    await service.createAcceptance(
      {
        documentVersionId: published.version.id,
        acceptanceRuleId: published.rules[0].id,
        accepted: true,
      },
      requestFor({ identityIssuer: 'dev_a', subjectId: 'same' }),
    );

    const otherIssuerPending = await service.evaluatePending({
      issuerId: published.rules[0].issuerId,
      applicationId: published.rules[0].applicationId,
      identityIssuer: 'dev_b',
      subjectId: 'same',
      roles: [],
    });

    expect(otherIssuerPending.canContinue).toBe(false);
  });

  it('fails closed for representative acceptance without Access role', async () => {
    const document = await createDocument(service);
    await service.createDraft(document.id, markdownSource('# v1'), actor);
    const published = await publishAndActivate(
      document.id,
      {
        version: '1.0.0',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
        rules: [
          {
            acceptanceMode: 'organization_representative',
            organizationId: 'org_1',
            role: 'organization_owner',
          },
        ],
      },
      actor,
    );

    await expect(
      service.createAcceptance(
        {
          documentVersionId: published.version.id,
          acceptanceRuleId: published.rules[0].id,
          accepted: true,
          organizationId: 'org_1',
        },
        requestFor({ identityIssuer: 'dev', subjectId: 'owner' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  async function publishAndActivate(documentId: string, dto: PublishDraftDto) {
    const result = await service.publishDraft(documentId, dto, actor);
    const document = documents.rows.find((row) => row.id === documentId)!;
    const version = versions.rows.find((row) => row.id === result.versionId)!;
    const draft = versions.rows.find(
      (row) => row.documentId === documentId && row.version === 'draft',
    );
    if (draft) {
      draft.status = 'superseded';
      await versions.save(draft);
    }
    version.status = 'published';
    version.publishedAt = new Date();
    await versions.save(version);

    const createdRules = await rules.save(
      dto.rules.map((rule) =>
        rules.create({
          documentId,
          versionId: version.id,
          issuerId: document.issuerId,
          applicationId: document.applicationId,
          organizationId: rule.organizationId ?? null,
          productTenantId: rule.productTenantId ?? null,
          role: rule.role ?? null,
          acceptanceMode: rule.acceptanceMode,
          isBlocking:
            rule.isBlocking ?? rule.acceptanceMode !== 'informational',
          startsAt: rule.startsAt ? new Date(rule.startsAt) : null,
          endsAt: rule.endsAt ? new Date(rule.endsAt) : null,
          status: 'active',
        }),
      ),
    );

    return { ...result, version, rules: createdRules };
  }
});

class Repo<T extends { id: string; createdAt?: Date; updatedAt?: Date }> {
  rows: T[] = [];

  find(options?: { where?: Partial<T>; order?: Record<string, 'DESC'> }) {
    let rows = this.rows.filter((row) => matches(row, options?.where ?? {}));
    if (options?.order) rows = rows.toReversed();
    return Promise.resolve(rows);
  }

  findOneBy(where: Partial<T>) {
    return Promise.resolve(
      this.rows.find((row) => matches(row, where)) ?? null,
    );
  }

  findOne(options: { where?: Partial<T>; order?: Record<string, 'DESC'> }) {
    return this.find(options).then((rows) => rows[0] ?? null);
  }

  findAndCount(options?: {
    where?: Partial<T> | Partial<T>[];
    order?: Record<string, 'DESC'>;
    skip?: number;
    take?: number;
  }) {
    const where = options?.where;
    let rows = this.rows.filter((row) =>
      Array.isArray(where)
        ? where.some((condition) => matches(row, condition))
        : matches(row, where ?? {}),
    );
    if (options?.order) rows = rows.toReversed();
    const total = rows.length;
    const start = options?.skip ?? 0;
    const end = options?.take === undefined ? undefined : start + options.take;
    return Promise.resolve([rows.slice(start, end), total] as [T[], number]);
  }

  existsBy(where: Partial<T>) {
    return Promise.resolve(this.rows.some((row) => matches(row, where)));
  }

  create(data: Partial<T>) {
    return data as T;
  }

  save(entity: T): Promise<T>;
  save(entity: T[]): Promise<T[]>;
  save(entity: T | T[]) {
    if (Array.isArray(entity))
      return Promise.all(entity.map((row) => this.save(row)));
    const now = new Date('2026-07-20T00:00:00Z');
    if (!entity.id) entity.id = `id_${this.rows.length + 1}`;
    entity.createdAt ??= now;
    entity.updatedAt = now;
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index === -1) this.rows.push(entity);
    else this.rows[index] = entity;
    return Promise.resolve(entity);
  }

  update(where: Partial<T>, patch: Partial<T>) {
    for (const row of this.rows.filter((item) => matches(item, where))) {
      Object.assign(row, patch);
    }
    return Promise.resolve({ affected: 1 });
  }

  softRemove(entity: T) {
    (entity as T & { deletedAt?: Date }).deletedAt = new Date();
    return this.save(entity);
  }
}

function matches<T>(row: T, where: Partial<T>) {
  return Object.entries(where).every(
    ([key, value]) => row[key as keyof T] === value,
  );
}

async function createDocument(service: LegalService) {
  const issuer = await service.createIssuer(issuerDto('issuer_hemia'), actor);
  const app = await service.createApplication(
    { issuerId: issuer.id, key: 'loop', name: 'Loop' },
    actor,
  );
  return service.createDocument(
    {
      issuerId: issuer.id,
      applicationId: app.id,
      key: 'terms',
      locale: 'es-MX',
      title: 'Terminos',
    },
    actor,
  );
}

function dataSource(repos: [unknown, unknown][]) {
  const map = new Map(repos);
  const manager = { getRepository: (entity: unknown) => map.get(entity) };
  return {
    transaction: (work: (manager: unknown) => unknown) => work(manager),
    getRepository: (entity: unknown) => map.get(entity),
  };
}

function requestFor(actorPatch: Partial<LegalActor>, roles = []) {
  const nextActor = { ...actor, ...actorPatch };
  return {
    actor: nextActor,
    legalContext: {
      organizationId: 'org_1',
      externalTenantId: 'external_1',
      productTenantId: 'tenant_1',
      contextVersion: 1,
      globalRoles: roles,
      permissions: ['*.*'],
    },
    ssoAuth: { cookie: 'session_1' },
    ip: '127.0.0.1',
    header: (name: string) => (name === 'user-agent' ? 'jest' : ''),
  } as never;
}
