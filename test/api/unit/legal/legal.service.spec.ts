import { FindOperator } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { LegalActor } from '../../../../apps/api/src/common/types/legal-request';
import { AuditEvent } from '../../../../apps/api/src/modules/legal/entities/audit-event.entity';
import { LegalAcceptance } from '../../../../apps/api/src/modules/legal/entities/legal-acceptance.entity';
import { LegalAcceptanceRule } from '../../../../apps/api/src/modules/legal/entities/legal-acceptance-rule.entity';
import { LegalApplication } from '../../../../apps/api/src/modules/legal/entities/legal-application.entity';
import { LegalDocument } from '../../../../apps/api/src/modules/legal/entities/legal-document.entity';
import { LegalDocumentVersion } from '../../../../apps/api/src/modules/legal/entities/legal-document-version.entity';
import { LegalIssuer } from '../../../../apps/api/src/modules/legal/entities/legal-issuer.entity';
import { LegalNotification } from '../../../../apps/api/src/modules/legal/entities/legal-notification.entity';
import { LegalPublication } from '../../../../apps/api/src/modules/legal/entities/legal-publication.entity';
import { LegalPublicationAsset } from '../../../../apps/api/src/modules/legal/entities/legal-publication-asset.entity';
import { OutboxEvent } from '../../../../apps/api/src/modules/legal/entities/outbox-event.entity';
import { PublishDraftDto } from '../../../../apps/api/src/modules/legal/dtos/legal-catalog.dto';
import { analyzeLegalSource } from '../../../../apps/api/src/modules/legal/helpers/legal-source.helper';
import { LegalService } from '../../../../apps/api/src/modules/legal/services/legal.service';

const actor: LegalActor = {
  identityIssuer: 'dev',
  subjectId: 'tester',
  actorType: 'user',
  permissions: ['*.*'],
  traceId: 'trace-test',
  authorization: {
    expiresAt: 9999999999,
    assignments: [
      {
        assignment_id: 'test',
        assignment_version: 1,
        role_code: 'legal.catalog_manager',
        valid_from: 1,
        expires_at: null,
        resource_scope: { type: 'legal_global', ids: [] },
        consumer_scope: { type: 'not_applicable', organization_ids: [] },
      },
    ],
  },
};

const auditor: LegalActor = {
  ...actor,
  authorization: {
    expiresAt: 9999999999,
    assignments: [
      {
        assignment_id: 'auditor',
        assignment_version: 1,
        role_code: 'legal.auditor',
        valid_from: 1,
        expires_at: null,
        resource_scope: { type: 'legal_global', ids: [] },
        consumer_scope: { type: 'all_organizations', organization_ids: [] },
      },
    ],
  },
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
  let service: LegalService;
  let deleteDocumentFiles: jest.Mock<Promise<boolean>, [string]>;
  let storageRead: jest.Mock<Promise<Buffer>, [unknown]>;

  beforeEach(() => {
    deleteDocumentFiles = jest.fn(() => Promise.resolve(true));
    storageRead = jest.fn(() => Promise.resolve(Buffer.from('')));
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
      ]) as never,
      {
        rolesFromRequest: () => [],
        ensureRole: (role: string | null, roles: string[]) => {
          if (role && !roles.includes(role))
            throw new ConflictException('missing role');
        },
      },
      {
        putImmutable: jest.fn(
          (key: string, body: Buffer, contentType: string) =>
            Promise.resolve({
              bucket: 'legal-test',
              key,
              versionId: 'source-version',
              etag: null,
              contentType,
              size: body.length,
              sha256: 'a'.repeat(64),
            }),
        ),
        signedDownloadUrl: jest.fn(),
        read: storageRead,
        deleteDocumentFiles,
      } as never,
      { organizations: () => Promise.resolve() } as never,
    );
  });

  it('rejects a supplied consumer tenant without its organization', async () => {
    await expect(
      service.evaluatePending({
        issuerId: 'issuer',
        applicationId: 'application',
        productTenantId: 'tenant',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('soft deletes a document with an audit event', async () => {
    const document = await createDocument(service);

    await expect(service.deleteDocument(document.id, actor)).resolves.toEqual({
      storageDeleted: true,
    });
    expect(deleteDocumentFiles).toHaveBeenCalledWith(document.id);

    expect(documents.rows[0].deletedAt).toBeInstanceOf(Date);
    expect(audit.rows.at(-1)).toMatchObject({
      action: 'legal.document.delete',
      entityType: 'legal_document',
      entityId: document.id,
    });
  });

  it('does not remove files when the document cannot be deleted', async () => {
    await expect(service.deleteDocument('missing', actor)).rejects.toThrow(
      'Document not found',
    );
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
    const document = await createDocument(service);
    jest
      .spyOn(documents, 'softRemove')
      .mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.deleteDocument(document.id, actor)).rejects.toThrow(
      'Database unavailable',
    );
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
  });

  it.each(['denied', 'partial'])(
    'retains the logical deletion and reports %s cleanup',
    async (outcome) => {
      const document = await createDocument(service);
      if (outcome === 'denied')
        deleteDocumentFiles.mockRejectedValueOnce(new Error('AccessDenied'));
      else deleteDocumentFiles.mockResolvedValueOnce(false);
      await expect(service.deleteDocument(document.id, actor)).resolves.toEqual(
        { storageDeleted: false },
      );
      expect(documents.rows[0].deletedAt).toBeInstanceOf(Date);
    },
  );

  it.each(['pending', 'uploading'])(
    'does not delete while a publication is %s',
    async (status) => {
      const document = await createDocument(service);
      await publications.save({
        documentId: document.id,
        status,
      } as LegalPublication);
      await expect(
        service.deleteDocument(document.id, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(documents.rows[0].deletedAt).toBeUndefined();
      expect(deleteDocumentFiles).not.toHaveBeenCalled();
    },
  );

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

    const documentsForLoop = await service.listDocuments(
      {
        issuerId: issuer.id,
        applicationId: firstApp.id,
      },
      actor,
    );

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

  it('rejects generic reparenting even before documents exist', async () => {
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

    await expect(
      service.updateApplication(
        application.id,
        { issuerId: targetIssuer.id },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(applications.rows[0].issuerId).toBe(originalIssuer.id);
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
    ).rejects.toBeInstanceOf(ForbiddenException);
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

    const response = await service.listApplications(
      {
        issuerId: issuer.id,
        status: 'active',
        page: 2,
        limit: 1,
      },
      actor,
    );

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
    const defaultList = await service.listApplications(
      {
        page: 1,
        limit: 10,
      },
      actor,
    );
    expect(defaultList.items).toHaveLength(1);
    expect(defaultList.items[0].status).toBe('inactive');

    const activeList = await service.listApplications(
      {
        page: 1,
        limit: 10,
        status: 'active',
      },
      actor,
    );
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
      'refund_policy',
      'acceptable_use_policy',
      'ai_usage_policy',
      'cookie_policy',
      'security_policy',
      'custom_policy',
      'data_processing_agreement',
      'saas_agreement',
      'nda',
    ]);
  });

  it('enforces privacy variants and their integral parent', async () => {
    const issuer = await service.createIssuer(
      issuerDto('issuer_privacy'),
      actor,
    );
    const app = await service.createApplication(
      { issuerId: issuer.id, key: 'privacy', name: 'Privacy' },
      actor,
    );
    const integral = await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: app.id,
        key: 'privacy_integral',
        locale: 'es-MX',
        title: 'Aviso integral',
        documentType: 'privacy_notice',
        documentVariant: 'integral',
      },
      actor,
    );
    const short = await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: app.id,
        key: 'privacy_short',
        locale: 'es-MX',
        title: 'Aviso corto',
        documentType: 'privacy_notice',
        documentVariant: 'short',
        parentDocumentId: integral.id,
      },
      actor,
    );

    expect(integral.documentVariant).toBe('integral');
    expect(short.parentDocumentId).toBe(integral.id);
    await expect(
      service.createDocument(
        {
          issuerId: issuer.id,
          applicationId: app.id,
          key: 'privacy_invalid',
          locale: 'es-MX',
          title: 'Aviso inválido',
          documentType: 'privacy_notice',
          documentVariant: 'short',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects PDF sources for public documents and accepts them internally', async () => {
    const publicDocument = await createDocument(service);
    await expect(
      service.createDraft(
        publicDocument.id,
        {
          buffer: Buffer.from('%PDF-1.7'),
          mimetype: 'application/pdf',
          originalname: 'terms.pdf',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const issuer = await service.createIssuer(
      issuerDto('issuer_internal'),
      actor,
    );
    const app = await service.createApplication(
      { issuerId: issuer.id, key: 'internal', name: 'Internal' },
      actor,
    );
    const internal = await service.createDocument(
      {
        issuerId: issuer.id,
        applicationId: app.id,
        key: 'dpa',
        locale: 'es-MX',
        title: 'DPA',
        documentType: 'data_processing_agreement',
      },
      actor,
    );
    await expect(
      service.createDraft(
        internal.id,
        {
          buffer: Buffer.from('%PDF-1.7'),
          mimetype: 'application/pdf',
          originalname: 'dpa.pdf',
        },
        actor,
      ),
    ).resolves.toMatchObject({ sourceKind: 'pdf' });
  });

  it('returns the selected public locale and acceptance summary', async () => {
    const document = await createDocument(service);
    const version = await versions.save({
      id: 'version-public',
      documentId: document.id,
      version: '1.0.0',
      status: 'published',
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
      s3ObjectKey: `legal/documents/${document.id}/versions/1.0.0/html.html`,
      s3VersionId: 'asset-version',
      contentType: 'text/html',
      sizeBytes: 20,
      sha256: 'c'.repeat(64),
    } as LegalPublicationAsset);
    await publicationAssets.save({
      id: 'source-public',
      publicationId: 'publication-public',
      kind: 'source',
      s3Bucket: 'legal-test',
      s3ObjectKey: 'published/source.md',
      s3VersionId: 'source-version',
      contentType: 'text/markdown',
      sizeBytes: 42,
      sha256: 'd'.repeat(64),
    } as LegalPublicationAsset);
    version.sourceKind = 'markdown';
    version.sourceFileName = 'terms.md';
    await versions.save(version);
    const storage = (
      service as never as {
        storage: { signedDownloadUrl: jest.Mock };
      }
    ).storage;
    storage.signedDownloadUrl.mockResolvedValue({
      url: 'https://storage.test/document.html',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const response = await service.getPublicDocument(
      document.applicationId,
      document.key,
      'es-MX',
    );

    expect(response.artifacts.source).toMatchObject({
      url: 'https://storage.test/document.html',
      contentType: 'text/markdown',
      sha256: 'd'.repeat(64),
    });
    expect(response.artifacts.html).toBeDefined();
    expect(storage.signedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'published/source.md',
        versionId: 'source-version',
      }),
      'terms.md',
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
    const storage = (
      service as never as {
        storage: { putImmutable: jest.Mock };
      }
    ).storage;
    storage.putImmutable.mockResolvedValue({
      bucket: 'legal-test',
      key: `legal/documents/${document.id}/draft/source/${'a'.repeat(64)}.md`,
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
  });

  it('renders draft markdown with navigable sections for the console', async () => {
    const document = await createDocument(service);
    const draft = await service.createDraft(
      document.id,
      markdownSource('# v1'),
      actor,
    );
    storageRead.mockResolvedValue(
      Buffer.from('# Introducción\n\nTexto\n\n## Alcance'),
    );

    const content = await service.getVersionContent(document.id, draft.id);

    expect(content.mode).toBe('html');
    expect(content.sections).toEqual([
      { id: 'legal-section-1', label: 'Introducción', level: 1 },
      { id: 'legal-section-2', label: 'Alcance', level: 2 },
    ]);
    expect(content.html).toContain(
      '<h1 id="legal-section-1">Introducción</h1>',
    );
  });

  it('serves the published HTML artifact of superseded versions', async () => {
    const document = await createDocument(service);
    versions.rows.push({
      id: 'version_published',
      documentId: document.id,
      version: '1.0.0',
      status: 'superseded',
      sourceKind: 'markdown',
    } as never);
    publications.rows.push({
      id: 'publication_1',
      documentVersionId: 'version_published',
      status: 'superseded',
      publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    } as never);
    publicationAssets.rows.push({
      id: 'asset_html',
      publicationId: 'publication_1',
      kind: 'html',
      s3Bucket: 'legal-test',
      s3ObjectKey: 'legal/documents/html',
      s3VersionId: null,
      contentType: 'text/html',
      sizeBytes: 64,
      sha256: 'a'.repeat(64),
    } as never);
    storageRead.mockResolvedValue(Buffer.from('<h2>Alcance</h2><p>Texto</p>'));

    const content = await service.getVersionContent(
      document.id,
      'version_published',
    );

    expect(content.mode).toBe('html');
    expect(content.sections).toEqual([
      { id: 'legal-section-1', label: 'Alcance', level: 2 },
    ]);
    expect(content.html).toContain('<h2 id="legal-section-1">Alcance</h2>');
  });

  it('publishes a draft with reproducible hash, rule and outbox event', async () => {
    const document = await createDocument(service);

    await service.createDraft(document.id, markdownSource('# v1\r\n'), actor);
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

    const nextDraft = await service.createDraft(
      document.id,
      markdownSource('# v2'),
      actor,
    );
    expect(nextDraft.status).toBe('draft');
    expect(versions.rows.filter((row) => row.version === 'draft')).toHaveLength(
      1,
    );
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
      organizationId: 'org_1',
      identityIssuer: 'dev_b',
      subjectId: 'same',
      roles: [],
    });

    expect(otherIssuerPending.canContinue).toBe(false);
  });

  it('lists the acceptances stored for a document', async () => {
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
    for (const subjectId of ['user_1', 'user_2']) {
      await service.createAcceptance(
        {
          documentVersionId: published.version.id,
          acceptanceRuleId: published.rules[0].id,
          accepted: true,
        },
        requestFor({ identityIssuer: 'dev', subjectId }),
      );
    }

    const list = await service.listDocumentAcceptances(document.id, auditor);

    expect(list.total).toBe(2);
    expect(list.items.map((item) => item.subjectId).sort()).toEqual([
      'user_1',
      'user_2',
    ]);
    expect(list.items[0].documentVersionId).toBe(published.version.id);
    await expect(
      service.listDocumentAcceptances('missing', auditor),
    ).rejects.toThrow('Document not found');
  });

  it('lists the audit trail for a document and its versions', async () => {
    const document = await createDocument(service);
    await service.createDraft(document.id, markdownSource('# v1'), actor);

    const trail = await service.listDocumentAuditEvents(
      document.id,
      { page: 1, limit: 20 },
      auditor,
    );
    const actions = trail.items.map((item) => item.action);

    expect(trail.total).toBeGreaterThanOrEqual(2);
    expect(trail.page).toBe(1);
    expect(trail.limit).toBe(20);
    expect(actions).toContain('legal.document.create');
    expect(actions).toContain('legal.version.draft_create');
    expect(trail.items[0].metadata).toEqual({});
    await expect(
      service.listDocumentAuditEvents(
        'missing',
        { page: 1, limit: 20 },
        auditor,
      ),
    ).rejects.toThrow('Document not found');
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
          productTenantId: null,
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
  return Object.entries(where).every(([key, value]) => {
    // SQL authorization is exercised against PostgreSQL in consumer integration tests.
    if (value instanceof FindOperator && value.type === 'raw') return true;
    if (value instanceof FindOperator && value.type === 'in') {
      return (value.value as unknown[]).includes(row[key as keyof T]);
    }
    return row[key as keyof T] === value;
  });
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
  const manager = {
    query: () => Promise.resolve([]),
    getRepository: (entity: unknown) => map.get(entity),
  };
  return {
    transaction: (work: (manager: unknown) => unknown) => work(manager),
    getRepository: (entity: unknown) => map.get(entity),
  };
}

function requestFor(actorPatch: Partial<LegalActor>, roles = []) {
  const nextActor = { ...actor, ...actorPatch };
  return {
    actor: nextActor,
    accessContext: { organizations: [{ organization_id: 'org_1', roles }] },
    personalContext: {
      organizationId: 'org_1',
      externalTenantId: 'external_1',
      productTenantId: 'tenant_1',
      contextVersion: 1,
      roles,
      applicationIds: [],
      permissions: ['*.*'],
    },
    ssoAuth: { cookie: 'session_1' },
    ip: '127.0.0.1',
    header: (name: string) => (name === 'user-agent' ? 'jest' : ''),
  } as never;
}
