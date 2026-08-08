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
import {
  canonicalMarkdown,
  hashContent,
  LegalService,
} from '../../../src/modules/legal/services/legal.service';

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
      { putImmutable: jest.fn(), signedDownloadUrl: jest.fn() } as never,
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

    await service.createDraft(document.id, { contentMarkdown: '# v1' }, actor);
    const edited = await service.updateDraft(
      document.id,
      { contentMarkdown: '# v2' },
      actor,
    );

    expect(edited.contentMarkdown).toBe('# v2');
    await expect(
      service.createDraft(document.id, { contentMarkdown: '# v3' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('publishes a draft with reproducible hash, rule and outbox event', async () => {
    const document = await createDocument(service);

    await service.createDraft(
      document.id,
      { contentMarkdown: '# v1\r\n' },
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
      hashContent(canonicalMarkdown('# v1\r\n')),
    );
    expect(published.rules).toHaveLength(1);
    expect(outbox.rows).toHaveLength(1);
    await expect(
      service.updateDraft(document.id, { contentMarkdown: '# nope' }, actor),
    ).rejects.toThrow('Draft not found');
  });

  it('rejects duplicate and overlapping publication rules', async () => {
    const document = await createDocument(service);
    await service.createDraft(document.id, { contentMarkdown: '# v1' }, actor);

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
    await service.createDraft(document.id, { contentMarkdown: '# v1' }, actor);
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
    await service.createDraft(document.id, { contentMarkdown: '# v1' }, actor);
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
    await service.createDraft(document.id, { contentMarkdown: '# v1' }, actor);
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
