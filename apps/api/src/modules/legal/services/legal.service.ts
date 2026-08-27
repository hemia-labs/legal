import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  ILike,
  Not,
  Repository,
} from 'typeorm';
import type {
  LegalActor,
  LegalRequest,
} from '../../../common/types/legal-request';
import {
  AcceptanceRuleInputDto,
  AcceptanceExportFilterDto,
  ApplicationFilterDto,
  AuditEventFilterDto,
  CreateAcceptanceDto,
  CreateApplicationDto,
  CreateDocumentDto,
  CreateIssuerDto,
  DocumentFilterDto,
  EvaluatePendingDto,
  IssuerFilterDto,
  MePendingQueryDto,
  NotificationFilterDto,
  PublishDraftDto,
  UpdateApplicationDto,
  UpdateDocumentDto,
  UpdateIssuerDto,
} from '../dtos/legal-catalog.dto';
import { AuditEvent } from '../entities/audit-event.entity';
import { LegalAcceptance } from '../entities/legal-acceptance.entity';
import { LegalAcceptanceRule } from '../entities/legal-acceptance-rule.entity';
import { LegalApplication } from '../entities/legal-application.entity';
import { LegalDocument } from '../entities/legal-document.entity';
import { LegalDocumentVersion } from '../entities/legal-document-version.entity';
import { LegalIssuer } from '../entities/legal-issuer.entity';
import { LegalNotification } from '../entities/legal-notification.entity';
import { LegalPublication } from '../entities/legal-publication.entity';
import { LegalPublicationAsset } from '../entities/legal-publication-asset.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { S3StorageService } from '../../storage/s3-storage.service';
import { buildPublicationSourceKey } from '../../storage/types/storage.types';
import {
  documentPolicy,
  LEGAL_DOCUMENT_TYPES,
  type LegalDocumentVariant,
} from '../constants/document-types';
import { LegalMapper } from '../mappers/legal.mapper';
import { AccessService } from './access.service';
import { requireLegalClearance } from '../helpers/legal-precondition.helper';
import {
  analyzeLegalSource,
} from '../helpers/legal-source.helper';
import type { LegalSourceUpload } from '../types/legal-source.types';

type PendingDocument = {
  documentId: string;
  documentVersionId: string;
  acceptanceRuleId: string;
  title: string;
  version: string;
  acceptanceMode: string;
  blocking: boolean;
  effectiveFrom: Date | null;
  acceptanceDeadline: Date | null;
  contentHash: string | null;
};

@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(LegalIssuer)
    private readonly issuers: Repository<LegalIssuer>,
    @InjectRepository(LegalApplication)
    private readonly applications: Repository<LegalApplication>,
    @InjectRepository(LegalDocument)
    private readonly documents: Repository<LegalDocument>,
    @InjectRepository(LegalDocumentVersion)
    private readonly versions: Repository<LegalDocumentVersion>,
    @InjectRepository(LegalAcceptanceRule)
    private readonly rules: Repository<LegalAcceptanceRule>,
    @InjectRepository(LegalAcceptance)
    private readonly acceptances: Repository<LegalAcceptance>,
    @InjectRepository(LegalNotification)
    private readonly notifications: Repository<LegalNotification>,
    @InjectRepository(AuditEvent)
    private readonly auditEvents: Repository<AuditEvent>,
    @InjectRepository(OutboxEvent)
    private readonly outboxEvents: Repository<OutboxEvent>,
    @InjectRepository(LegalPublication)
    private readonly publications: Repository<LegalPublication>,
    @InjectRepository(LegalPublicationAsset)
    private readonly publicationAssets: Repository<LegalPublicationAsset>,
    private readonly dataSource: DataSource,
    private readonly access: AccessService,
    private readonly storage: S3StorageService,
  ) {}

  async listIssuers(filter: IssuerFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const base: FindOptionsWhere<LegalIssuer> = {};
    if (filter.type) base.type = filter.type;
    base.status = filter.status ?? 'active';
    if (filter.countryCode) base.countryCode = filter.countryCode;

    const search = filter.search?.trim();
    const where: FindOptionsWhere<LegalIssuer>[] = search
      ? [
          { ...base, key: ILike(`%${search}%`) },
          { ...base, name: ILike(`%${search}%`) },
          { ...base, legalName: ILike(`%${search}%`) },
          { ...base, taxId: ILike(`%${search}%`) },
        ]
      : [base];
    const [issuers, total] = await this.issuers.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: issuers.map((issuer) => LegalMapper.issuer(issuer)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listIssuerOptions() {
    const issuers = await this.issuers.find({
      select: { id: true, name: true, status: true },
      order: { name: 'ASC', id: 'ASC' },
    });
    return issuers.map(({ id, name, status }) => ({ id, name, status }));
  }

  async getIssuer(id: string) {
    return LegalMapper.issuer(await this.activeIssuer(id));
  }

  async createIssuer(dto: CreateIssuerDto, actor: LegalActor) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const issuers = manager.getRepository(LegalIssuer);
        if (await issuers.existsBy({ key: dto.key })) {
          throw new ConflictException('Issuer key already exists');
        }

        const issuer = await issuers.save(
          issuers.create({
            ...dto,
            taxId: dto.taxId ?? null,
            status: 'active',
          }),
        );
        await this.auditWith(
          manager.getRepository(AuditEvent),
          actor,
          'legal.issuer.create',
          'legal_issuer',
          issuer.id,
          { issuerId: issuer.id },
        );
        return LegalMapper.issuer(issuer);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Issuer key already exists');
      }
      throw error;
    }
  }

  async updateIssuer(id: string, dto: UpdateIssuerDto, actor: LegalActor) {
    const issuer = await this.activeIssuer(id);
    Object.assign(issuer, dto);
    const saved = await this.issuers.save(issuer);
    await this.audit(actor, 'legal.issuer.edit', 'legal_issuer', id, {
      issuerId: id,
    });
    return LegalMapper.issuer(saved);
  }

  async updateIssuerStatus(
    id: string,
    status: 'active' | 'inactive',
    actor: LegalActor,
  ) {
    const issuer = await this.issuerById(id);
    if (issuer.status === 'archived') {
      throw new ConflictException('Issuer is archived');
    }
    if (issuer.status === status) {
      throw new ConflictException(`Issuer is already ${status}`);
    }
    issuer.status = status;
    await this.issuers.save(issuer);
    await this.audit(actor, `legal.issuer.${status}`, 'legal_issuer', id, {
      issuerId: id,
    });
  }

  async unarchiveIssuer(id: string, actor: LegalActor) {
    const issuer = await this.issuerById(id);
    if (issuer.status !== 'archived') {
      throw new ConflictException('Issuer is not archived');
    }
    issuer.status = 'active';
    await this.issuers.save(issuer);
    await this.audit(actor, 'legal.issuer.unarchive', 'legal_issuer', id, {
      issuerId: id,
    });
  }

  async archiveIssuer(id: string, actor: LegalActor) {
    const issuer = await this.issuerById(id);
    if (issuer.status === 'archived') {
      throw new ConflictException('Issuer is already archived');
    }
    issuer.status = 'archived';
    await this.issuers.save(issuer);
    await this.audit(actor, 'legal.issuer.archive', 'legal_issuer', id, {
      issuerId: id,
    });
  }

  async deleteIssuer(id: string, actor: LegalActor) {
    const issuer = await this.issuerById(id);
    await this.issuers.softRemove(issuer);
    await this.audit(actor, 'legal.issuer.delete', 'legal_issuer', id, {
      issuerId: id,
    });
  }

  async listApplications(filter: ApplicationFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const base: FindOptionsWhere<LegalApplication> = {};
    if (filter.status && filter.status !== 'all') base.status = filter.status;
    if (filter.issuerId) base.issuerId = filter.issuerId;

    const search = filter.search?.trim();
    const where: FindOptionsWhere<LegalApplication>[] = search
      ? [
          { ...base, key: ILike(`%${search}%`) },
          { ...base, name: ILike(`%${search}%`) },
        ]
      : [base];
    const [applications, total] = await this.applications.findAndCount({
      where,
      relations: { issuer: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: applications.map((application) => LegalMapper.application(application)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createApplication(dto: CreateApplicationDto, actor: LegalActor) {
    await this.activeIssuer(dto.issuerId);
    if (
      await this.applications.existsBy({ issuerId: dto.issuerId, key: dto.key })
    ) {
      throw new ConflictException('Application key already exists for issuer');
    }

    const application = await this.applications.save(
      this.applications.create({ ...dto, status: 'active' }),
    );
    await this.audit(
      actor,
      'legal.application.create',
      'legal_application',
      application.id,
      { issuerId: application.issuerId, applicationId: application.id },
    );
    return LegalMapper.application(application);
  }

  async updateApplication(
    id: string,
    dto: UpdateApplicationDto,
    actor: LegalActor,
  ) {
    const application = await this.activeApplication(id);
    if (dto.issuerId && dto.issuerId !== application.issuerId) {
      await this.activeIssuer(dto.issuerId);
      if (await this.documents.existsBy({ applicationId: id })) {
        throw new ConflictException(
          'Application issuer cannot change after documents are created',
        );
      }
      if (
        await this.applications.existsBy({
          issuerId: dto.issuerId,
          key: application.key,
        })
      ) {
        throw new ConflictException('Application key already exists for issuer');
      }
      application.issuerId = dto.issuerId;
    }
    if (dto.name !== undefined) application.name = dto.name;
    const saved = await this.applications.save(application);
    await this.audit(actor, 'legal.application.edit', 'legal_application', id, {
      issuerId: saved.issuerId,
      applicationId: id,
    });
    return LegalMapper.application(saved);
  }

  async archiveApplication(id: string, actor: LegalActor) {
    const application = await this.applicationById(id);
    if (application.status === 'archived') {
      throw new ConflictException('Application is already archived');
    }
    application.status = 'archived';
    await this.applications.save(application);
    await this.audit(
      actor,
      'legal.application.archive',
      'legal_application',
      id,
      { issuerId: application.issuerId, applicationId: id },
    );
  }

  async unarchiveApplication(id: string, actor: LegalActor) {
    const application = await this.applicationById(id);
    if (application.status !== 'archived') {
      throw new ConflictException('Application is not archived');
    }
    await this.activeIssuer(application.issuerId);
    application.status = 'active';
    await this.applications.save(application);
    await this.audit(
      actor,
      'legal.application.unarchive',
      'legal_application',
      id,
      { issuerId: application.issuerId, applicationId: id },
    );
  }

  async updateApplicationStatus(
    id: string,
    status: 'active' | 'inactive',
    actor: LegalActor,
  ) {
    const application = await this.applicationById(id);
    if (application.status === 'archived') {
      throw new ConflictException('Application is archived');
    }
    if (application.status === status) {
      throw new ConflictException(`Application is already ${status}`);
    }
    if (status === 'active') await this.activeIssuer(application.issuerId);
    application.status = status;
    await this.applications.save(application);
    await this.audit(
      actor,
      `legal.application.${status}`,
      'legal_application',
      id,
      { issuerId: application.issuerId, applicationId: id },
    );
  }

  async deleteApplication(id: string, actor: LegalActor) {
    const application = await this.applicationById(id);
    await this.applications.softRemove(application);
    await this.audit(
      actor,
      'legal.application.delete',
      'legal_application',
      id,
      { issuerId: application.issuerId, applicationId: id },
    );
  }

  async listDocuments(filter: DocumentFilterDto) {
    const documents = await this.documents.find({
      where: {
        ...(filter.issuerId ? { issuerId: filter.issuerId } : {}),
        ...(filter.applicationId
          ? { applicationId: filter.applicationId }
          : {}),
      },
      order: { createdAt: 'DESC' },
    });
    return documents.map((document) => LegalMapper.document(document));
  }

  listDocumentTypes() {
    return LEGAL_DOCUMENT_TYPES;
  }

  async createDocument(dto: CreateDocumentDto, actor: LegalActor) {
    const documentType = dto.documentType ?? 'terms_and_conditions';
    const policy = documentPolicy(documentType);
    if (!policy) throw new BadRequestException('Invalid document type');

    const documentVariant = dto.documentVariant ??
      (documentType === 'privacy_notice' ? 'integral' : 'standard');
    const parentDocumentId = dto.parentDocumentId ?? null;
    await this.validateDocumentVariant(
      dto,
      policy.variants,
      documentVariant,
      parentDocumentId,
    );
    const application = await this.activeApplication(dto.applicationId);
    if (application.issuerId !== dto.issuerId) {
      throw new BadRequestException('Application does not belong to issuer');
    }
    if (
      await this.documents.existsBy({
        issuerId: dto.issuerId,
        applicationId: dto.applicationId,
        key: dto.key,
        locale: dto.locale,
      })
    ) {
      throw new ConflictException('Document key and locale already exist');
    }

    let document: LegalDocument;
    try {
      document = await this.documents.save(
        this.documents.create({
          ...dto,
          documentType,
          documentVariant,
          parentDocumentId,
          status: 'active',
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Document key and locale already exist');
      }
      throw error;
    }

    await this.audit(
      actor,
      'legal.document.create',
      'legal_document',
      document.id,
      {
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      },
    );
    return LegalMapper.document(document);
  }

  async updateDocument(id: string, dto: UpdateDocumentDto, actor: LegalActor) {
    const document = await this.activeDocument(id);
    Object.assign(document, dto);
    const saved = await this.documents.save(document);
    await this.audit(actor, 'legal.document.edit', 'legal_document', id, {
      issuerId: saved.issuerId,
      applicationId: saved.applicationId,
    });
    return LegalMapper.document(saved);
  }

  async archiveDocument(id: string, actor: LegalActor) {
    const document = await this.activeDocument(id);
    document.status = 'archived';
    await this.documents.save(document);
    await this.audit(actor, 'legal.document.archive', 'legal_document', id, {
      issuerId: document.issuerId,
      applicationId: document.applicationId,
    });
  }

  async deleteDocument(id: string, actor: LegalActor) {
    const document = await this.documentById(id);
    await this.documents.softRemove(document);
    await this.audit(actor, 'legal.document.delete', 'legal_document', id, {
      issuerId: document.issuerId,
      applicationId: document.applicationId,
    });
  }

  async getDraft(documentId: string) {
    await this.activeDocument(documentId);
    const draft = await this.versions.findOneBy({
      documentId,
      version: 'draft',
      status: 'draft',
    });
    if (!draft) throw new NotFoundException('Draft not found');
    return LegalMapper.draft(draft);
  }

  async listVersions(documentId: string) {
    await this.activeDocument(documentId);
    const versions = await this.versions.find({
      where: { documentId, version: Not('draft') },
      order: { createdAt: 'DESC' },
    });
    return versions.map((version) => LegalMapper.version(version));
  }

  async getPublication(documentId: string, publicationId: string) {
    await this.activeDocument(documentId);
    const publication = await this.publications.findOneBy({
      id: publicationId,
      documentId,
    });
    if (!publication) throw new NotFoundException('Publication not found');
    return LegalMapper.publication(publication);
  }

  async retryPublication(
    documentId: string,
    publicationId: string,
    actor: LegalActor,
  ) {
    const document = await this.activeDocument(documentId);
    const publication = await this.publications.findOneBy({
      id: publicationId,
      documentId,
    });
    if (!publication) throw new NotFoundException('Publication not found');
    if (publication.status !== 'failed') {
      throw new ConflictException('Only failed publications can be retried');
    }

    const version = await this.versions.findOneBy({
      id: publication.documentVersionId,
    });
    if (!version) throw new NotFoundException('Publication version not found');

    publication.status = 'pending';
    publication.failureReason = null;
    const saved = await this.publications.save(publication);
    const event = await this.outboxEvents.save(
      this.outboxEvents.create({
        traceId: actor.traceId,
        eventType: 'legal.publication.requested',
        payload: {
          publicationId: saved.id,
          documentId: saved.documentId,
          versionId: version.id,
          version: version.version,
          issuerId: document.issuerId,
          applicationId: document.applicationId,
          locale: document.locale,
          contentHash: version.contentHash,
          sourceHash: version.sourceHash,
          sourceKind: version.sourceKind,
          sourceContentType: version.sourceContentType,
          sourceFileName: version.sourceFileName,
          sourceRef: version.sourceS3ObjectKey
            ? {
                bucket: version.sourceS3Bucket,
                key: version.sourceS3ObjectKey,
                versionId: version.sourceS3VersionId,
                etag: version.sourceS3Etag,
                contentType: version.sourceContentType,
                size: version.sourceSizeBytes,
                sha256: version.sourceHash,
              }
            : null,
        },
      }),
    );
    await this.audit(
      actor,
      'legal.publication.retry',
      'legal_publication',
      saved.id,
      { issuerId: saved.issuerId, applicationId: saved.applicationId },
    );
    return { publication: LegalMapper.publication(saved), outboxEventId: event.id };
  }

  async createDraft(
    documentId: string,
    dto: LegalSourceUpload,
    actor: LegalActor,
  ) {
    const document = await this.activeDocument(documentId);
    const existingDraft = await this.versions.findOneBy({
      documentId,
      version: 'draft',
    });
    if (existingDraft?.status === 'draft') {
      throw new ConflictException('Draft already exists');
    }

    const uploaded = await this.uploadDraftSource(document, dto);
    try {
      const draft = await this.versions.save(
        existingDraft
          ? Object.assign(existingDraft, {
              status: 'draft',
              contentHash: uploaded.analysis.contentHash,
              sourceKind: uploaded.analysis.kind,
              sourceContentType: dto.mimetype,
              sourceFileName: uploaded.analysis.fileName,
              sourceSizeBytes: dto.buffer.length,
              sourceHash: uploaded.analysis.sourceHash,
              sourceS3Bucket: uploaded.ref.bucket,
              sourceS3ObjectKey: uploaded.ref.key,
              sourceS3VersionId: uploaded.ref.versionId,
              sourceS3Etag: uploaded.ref.etag,
              effectiveFrom: null,
              effectiveUntil: null,
              acceptanceDeadline: null,
              gracePeriodDays: 0,
              publishedAt: null,
              publishedByIdentityIssuer: null,
              publishedBySubjectId: null,
            })
          : this.versions.create({
              documentId,
              version: 'draft',
              status: 'draft',
              contentHash: uploaded.analysis.contentHash,
              sourceKind: uploaded.analysis.kind,
              sourceContentType: dto.mimetype,
              sourceFileName: uploaded.analysis.fileName,
              sourceSizeBytes: dto.buffer.length,
              sourceHash: uploaded.analysis.sourceHash,
              sourceS3Bucket: uploaded.ref.bucket,
              sourceS3ObjectKey: uploaded.ref.key,
              sourceS3VersionId: uploaded.ref.versionId,
              sourceS3Etag: uploaded.ref.etag,
            }),
      );
      await this.audit(
        actor,
        'legal.version.draft_create',
        'legal_document_version',
        draft.id,
        { issuerId: document.issuerId, applicationId: document.applicationId },
      );
      return LegalMapper.draft(draft);
    } catch (error) {
      await this.storage.delete(uploaded.ref).catch(() => undefined);
      throw error;
    }
  }

  async updateDraft(
    documentId: string,
    dto: LegalSourceUpload,
    actor: LegalActor,
  ) {
    const document = await this.activeDocument(documentId);
    const draft = await this.versions.findOneBy({
      documentId,
      version: 'draft',
      status: 'draft',
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const uploaded = await this.uploadDraftSource(document, dto);
    draft.contentHash = uploaded.analysis.contentHash;
    draft.sourceKind = uploaded.analysis.kind;
    draft.sourceContentType = dto.mimetype;
    draft.sourceFileName = uploaded.analysis.fileName;
    draft.sourceSizeBytes = dto.buffer.length;
    draft.sourceHash = uploaded.analysis.sourceHash;
    draft.sourceS3Bucket = uploaded.ref.bucket;
    draft.sourceS3ObjectKey = uploaded.ref.key;
    draft.sourceS3VersionId = uploaded.ref.versionId;
    draft.sourceS3Etag = uploaded.ref.etag;
    const saved = await this.versions.save(draft);
    await this.audit(
      actor,
      'legal.version.draft_edit',
      'legal_document_version',
      saved.id,
      {
        issuerId: document.issuerId,
        applicationId: document.applicationId,
      },
    );
    return LegalMapper.draft(saved);
  }

  async previewPublication(documentId: string, dto: PublishDraftDto) {
    const document = await this.activeDocument(documentId);
    const draft = await this.versions.findOneBy({
      documentId,
      version: 'draft',
      status: 'draft',
    });
    const currentPublished = await this.currentPublished(documentId);
    const conflicts = await this.publicationConflicts(
      documentId,
      dto,
      !!draft,
      document,
    );

    return {
      version: dto.version,
      rulesCount: dto.rules?.length ?? 0,
      conflicts,
      currentPublished: currentPublished
        ? LegalMapper.version(currentPublished)
        : null,
      canPublish: conflicts.length === 0,
    };
  }

  async publishDraft(
    documentId: string,
    dto: PublishDraftDto,
    actor: LegalActor,
  ) {
    const requestedDocument = await this.activeDocument(documentId);
    this.throwRuleConflicts(
      await this.publicationConflicts(documentId, dto, true, requestedDocument),
    );

    return this.dataSource.transaction(async (manager) => {
      const documents = manager.getRepository(LegalDocument);
      const versions = manager.getRepository(LegalDocumentVersion);
      const auditEvents = manager.getRepository(AuditEvent);
      const outboxEvents = manager.getRepository(OutboxEvent);
      const publications = manager.getRepository(LegalPublication);

      const document = await documents.findOneBy({ id: documentId });
      if (!document) throw new NotFoundException('Document not found');
      if (document.status === 'archived') {
        throw new ConflictException('Document is archived');
      }
      await this.activeApplication(document.applicationId, manager);

      this.throwRuleConflicts(
        await this.publicationConflicts(documentId, dto, true, document),
      );

      const draft = await versions.findOneBy({
        documentId,
        version: 'draft',
        status: 'draft',
      });
      if (!draft) throw new ConflictException('Draft is not publishable');
      if (await versions.existsBy({ documentId, version: dto.version })) {
        throw new ConflictException('Version already exists');
      }

      if (!draft.sourceS3ObjectKey || !draft.sourceHash || !draft.sourceKind) {
        throw new ConflictException('Draft has no uploaded source');
      }
      const contentHash = draft.contentHash;
      if (!contentHash) throw new ConflictException('Draft has no consumable content');
      const snapshot = await versions.save(
        versions.create({
          documentId,
          version: dto.version,
          status: 'draft',
          contentHash,
          sourceKind: draft.sourceKind,
          sourceContentType: draft.sourceContentType,
          sourceFileName: draft.sourceFileName,
          sourceSizeBytes: draft.sourceSizeBytes,
          sourceHash: draft.sourceHash,
          sourceS3Bucket: draft.sourceS3Bucket,
          sourceS3ObjectKey: draft.sourceS3ObjectKey,
          sourceS3VersionId: draft.sourceS3VersionId,
          sourceS3Etag: draft.sourceS3Etag,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : null,
          acceptanceDeadline: dto.acceptanceDeadline
            ? new Date(dto.acceptanceDeadline)
            : null,
          gracePeriodDays: dto.gracePeriodDays ?? 0,
        }),
      );

      const publication = await publications.save(
        publications.create({
          documentId,
          documentVersionId: snapshot.id,
          issuerId: document.issuerId,
          applicationId: document.applicationId,
          documentType: document.documentType,
          productId: document.applicationId,
          organizationId: null,
          productTenantId: null,
          documentKey: document.key,
          version: dto.version,
          status: 'pending',
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : null,
          acceptanceDeadline: dto.acceptanceDeadline
            ? new Date(dto.acceptanceDeadline)
            : null,
          gracePeriodDays: dto.gracePeriodDays ?? 0,
          rulesSnapshot: (dto.rules ?? []) as unknown as Record<string, unknown>[],
          contentHash,
          sourceKind: draft.sourceKind,
          sourceHash: draft.sourceHash,
          requestedByIdentityIssuer: actor.identityIssuer,
          requestedBySubjectId: actor.subjectId,
          publishedByIdentityIssuer: null,
          publishedBySubjectId: null,
          publishedAt: null,
          failureReason: null,
        }),
      );

      await this.auditWith(
        auditEvents,
        actor,
        'legal.publication.request',
        'legal_publication',
        publication.id,
        { issuerId: document.issuerId, applicationId: document.applicationId },
      );

      const outbox = await outboxEvents.save(
        outboxEvents.create({
          traceId: actor.traceId,
          eventType: 'legal.publication.requested',
          payload: {
            documentId,
            publicationId: publication.id,
            versionId: snapshot.id,
            version: snapshot.version,
            issuerId: document.issuerId,
            applicationId: document.applicationId,
            locale: document.locale,
            contentHash,
            sourceHash: draft.sourceHash,
            sourceKind: draft.sourceKind,
            sourceContentType: draft.sourceContentType,
            sourceFileName: draft.sourceFileName,
            sourceRef: draft.sourceS3ObjectKey
              ? {
                  bucket: draft.sourceS3Bucket,
                  key: draft.sourceS3ObjectKey,
                  versionId: draft.sourceS3VersionId,
                  etag: draft.sourceS3Etag,
                  contentType: draft.sourceContentType,
                  size: draft.sourceSizeBytes,
                  sha256: draft.sourceHash,
                }
              : null,
            effectiveFrom: snapshot.effectiveFrom?.toISOString() ?? null,
          },
        }),
      );

      return {
        status: publication.status,
        publicationId: publication.id,
        versionId: snapshot.id,
        version: dto.version,
        sourceHash: draft.sourceHash,
        contentHash,
        outboxEventId: outbox.id,
      };
    });
  }

  private async uploadDraftSource(
    document: LegalDocument,
    file: LegalSourceUpload,
  ) {
    const analysis = analyzeLegalSource(file);
    const policy = documentPolicy(document.documentType);
    if (!policy || !policy.allowedSourceKinds.includes(analysis.kind)) {
      throw new BadRequestException(
        `${document.documentType} does not accept ${analysis.kind} sources`,
      );
    }
    const ref = await this.storage.putImmutable(
      buildPublicationSourceKey(
        {
          documentId: document.id,
          version: 'draft',
        },
        analysis.kind,
        analysis.sourceHash,
      ),
      file.buffer,
      file.mimetype,
    );
    return { analysis, ref };
  }

  private async validateDocumentVariant(
    dto: CreateDocumentDto,
    variants: readonly LegalDocumentVariant[],
    documentVariant: LegalDocumentVariant,
    parentDocumentId: string | null,
  ) {
    const documentType = dto.documentType ?? 'terms_and_conditions';
    if (!variants.includes(documentVariant)) {
      throw new BadRequestException('Invalid document variant');
    }

    if (documentType !== 'privacy_notice') {
      if (documentVariant !== 'standard' || parentDocumentId) {
        throw new BadRequestException(
          'Only privacy notices can have a document variant or parent',
        );
      }
      return;
    }

    if (documentVariant === 'integral' && parentDocumentId) {
      throw new BadRequestException('Integral privacy notice cannot have a parent');
    }
    if (documentVariant === 'integral') return;
    if (!parentDocumentId) {
      throw new BadRequestException(
        'Simplified and short privacy notices require an integral parent',
      );
    }

    const parent = await this.documents.findOneBy({ id: parentDocumentId });
    if (
      !parent ||
      parent.status !== 'active' ||
      parent.documentType !== 'privacy_notice' ||
      parent.documentVariant !== 'integral' ||
      parent.issuerId !== dto.issuerId ||
      parent.applicationId !== dto.applicationId ||
      parent.locale !== dto.locale
    ) {
      throw new BadRequestException('Invalid integral privacy notice parent');
    }
  }

  async getMyPending(query: MePendingQueryDto, request: LegalRequest) {
    const context = request.legalContext;
    if (!context) throw new ConflictException('Legal organization context required');
    return this.evaluatePending({
      ...query,
      organizationId: context.organizationId,
      productTenantId: context.productTenantId,
      identityIssuer: request.actor.identityIssuer,
      subjectId: request.actor.subjectId,
      roles: this.access.rolesFromRequest(request),
    });
  }

  async guardCheck(query: MePendingQueryDto, request: LegalRequest) {
    const pending = await this.getMyPending(query, request);
    requireLegalClearance(pending);
    return pending;
  }

  async evaluatePending(dto: EvaluatePendingDto) {
    if (dto.productTenantId && !dto.organizationId) {
      throw new BadRequestException('productTenantId requires organizationId');
    }

    const rules = await this.dataSource
      .getRepository(LegalAcceptanceRule)
      .find({
        where: {
          issuerId: dto.issuerId,
          applicationId: dto.applicationId,
          status: 'active',
        },
      });
    const now = Date.now();
    const candidates = rules.filter((rule) => {
      if (!matchesContext(rule.organizationId, dto.organizationId))
        return false;
      if (!matchesContext(rule.productTenantId, dto.productTenantId))
        return false;
      if (rule.role && !(dto.roles ?? []).includes(rule.role)) return false;
      if (rule.startsAt && rule.startsAt.getTime() > now) return false;
      if (rule.endsAt && rule.endsAt.getTime() <= now) return false;
      return true;
    });

    const selected = bestRuleByDocument(candidates);
    const pendingDocuments: PendingDocument[] = [];
    for (const rule of selected) {
      const version = await this.versions.findOneBy({
        id: rule.versionId,
        status: 'published',
      });
      if (!version) continue;
      if (version.effectiveFrom && version.effectiveFrom.getTime() > now) {
        continue;
      }
      const document = await this.documents.findOneBy({
        id: rule.documentId,
        status: 'active',
      });
      if (!document) continue;
      if (dto.locale && document.locale !== dto.locale) continue;
      const accepted = await this.acceptanceFor(dto, rule, version);
      if (accepted) continue;
      pendingDocuments.push({
        documentId: document.id,
        documentVersionId: version.id,
        acceptanceRuleId: rule.id,
        title: document.title,
        version: version.version,
        acceptanceMode: rule.acceptanceMode,
        blocking: rule.isBlocking,
        effectiveFrom: version.effectiveFrom,
        acceptanceDeadline: version.acceptanceDeadline,
        contentHash: version.contentHash,
      });
    }

    const blockingCount = pendingDocuments.filter((row) => row.blocking).length;
    return {
      canContinue: blockingCount === 0,
      blockingCount,
      pendingDocuments,
    };
  }

  async createAcceptance(dto: CreateAcceptanceDto, request: LegalRequest) {
    if (!dto.accepted) throw new BadRequestException('accepted must be true');
    const context = request.legalContext;
    if (!context) throw new ConflictException('Legal organization context required');
    const trustedDto = {
      ...dto,
      organizationId: context.organizationId,
      productTenantId: context.productTenantId,
    };

    return this.dataSource.transaction(async (manager) => {
      const versions = manager.getRepository(LegalDocumentVersion);
      const rules = manager.getRepository(LegalAcceptanceRule);
      const acceptances = manager.getRepository(LegalAcceptance);
      const documents = manager.getRepository(LegalDocument);
      const outboxEvents = manager.getRepository(OutboxEvent);
      const auditEvents = manager.getRepository(AuditEvent);

      const version = await versions.findOneBy({
        id: trustedDto.documentVersionId,
        status: 'published',
      });
      if (!version?.contentHash) {
        throw new ConflictException('Version is not published');
      }
      const rule = await rules.findOneBy({
        id: trustedDto.acceptanceRuleId,
        versionId: version.id,
        status: 'active',
      });
      if (!rule) throw new NotFoundException('Acceptance rule not found');
      const document = await documents.findOneBy({ id: rule.documentId });
      if (!document) throw new NotFoundException('Document not found');
      if (trustedDto.locale && document.locale !== trustedDto.locale) {
        throw new ConflictException('Acceptance locale does not match document');
      }
      ensureAcceptanceContext(rule, trustedDto);

      const roles = this.access.rolesFromRequest(request);
      if (rule.acceptanceMode === 'organization_representative') {
        this.access.ensureRole(rule.role, roles);
      }

      const existing = await findAcceptance(
        acceptances,
        request.actor.identityIssuer,
        request.actor.subjectId,
        version.id,
        rule.id,
        trustedDto.organizationId,
        trustedDto.productTenantId,
      );
      if (existing) return LegalMapper.acceptance(existing);

      const acceptance = acceptances.create({
        issuerId: rule.issuerId,
        applicationId: rule.applicationId,
        organizationId: trustedDto.organizationId,
        productTenantId: trustedDto.productTenantId,
        identityIssuer: request.actor.identityIssuer,
        subjectId: request.actor.subjectId,
        documentId: rule.documentId,
        documentVersionId: version.id,
        acceptanceRuleId: rule.id,
        acceptedByIdentityIssuer: request.actor.identityIssuer,
        acceptedBySubjectId: request.actor.subjectId,
        acceptanceMode: rule.acceptanceMode,
        roleAtAcceptance: rule.role,
        ipAddress: request.ip ?? null,
        userAgent: request.header('user-agent') ?? null,
        sessionId: request.ssoAuth?.cookie ?? null,
        authenticationMethod:
          request.header('x-authentication-method') ?? 'authenticated_session',
        locale: trustedDto.locale ?? null,
        contentHash: version.contentHash,
        acceptedAt: new Date(),
        metadata: {
          traceId: request.actor.traceId,
          roles,
          version: version.version,
        },
      });

      let saved: LegalAcceptance;
      try {
        saved = await acceptances.save(acceptance);
      } catch (error) {
        if (isUniqueViolation(error)) {
          const duplicate = await findAcceptance(
            acceptances,
            request.actor.identityIssuer,
            request.actor.subjectId,
            version.id,
            rule.id,
            trustedDto.organizationId,
            trustedDto.productTenantId,
          );
          if (duplicate) return LegalMapper.acceptance(duplicate);
        }
        throw error;
      }

      await this.auditWith(
        auditEvents,
        request.actor,
        'legal.acceptance.record',
        'legal_acceptance',
        saved.id,
        { issuerId: saved.issuerId, applicationId: saved.applicationId },
      );
      await outboxEvents.save(
        outboxEvents.create({
          traceId: request.actor.traceId,
          eventType: 'legal.acceptance.recorded',
          payload: {
            acceptanceId: saved.id,
            documentVersionId: saved.documentVersionId,
          },
        }),
      );

      return LegalMapper.acceptance(saved);
    });
  }

  async listMyAcceptances(request: LegalRequest) {
    const rows = await this.acceptances.find({
      where: {
        identityIssuer: request.actor.identityIssuer,
        subjectId: request.actor.subjectId,
        ...(request.legalContext
          ? { productTenantId: request.legalContext.productTenantId }
          : {}),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => LegalMapper.acceptance(row));
  }

  async getAcceptance(id: string, actor: LegalActor) {
    const acceptance = await this.acceptances.findOneBy({ id });
    if (!acceptance) throw new NotFoundException('Acceptance not found');
    if (
      actor.actorType !== 'service' &&
      (acceptance.identityIssuer !== actor.identityIssuer ||
        acceptance.subjectId !== actor.subjectId)
    ) {
      throw new ForbiddenException('Acceptance belongs to another identity');
    }
    return LegalMapper.acceptance(acceptance);
  }

  async listNotifications(filter: NotificationFilterDto) {
    const rows = await this.notifications.find({
      where: {
        ...(filter.issuerId ? { issuerId: filter.issuerId } : {}),
        ...(filter.applicationId
          ? { applicationId: filter.applicationId }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => LegalMapper.notification(row));
  }

  async retryNotification(id: string, actor: LegalActor) {
    const notification = await this.notifications.findOneBy({ id });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!['failed', 'cancelled'].includes(notification.status)) {
      throw new ConflictException(
        'Only failed or cancelled notifications retry',
      );
    }
    notification.status = 'pending';
    notification.attemptCount = 0;
    notification.lastError = null;
    notification.nextRunAt = new Date();
    notification.sentAt = null;
    const saved = await this.notifications.save(notification);
    await this.audit(
      actor,
      'legal.notification.retry',
      'legal_notification',
      saved.id,
      { issuerId: saved.issuerId, applicationId: saved.applicationId },
    );
    return LegalMapper.notification(saved);
  }

  async cancelNotification(id: string, actor: LegalActor) {
    const notification = await this.notifications.findOneBy({ id });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.status === 'sent') {
      throw new ConflictException('Sent notifications cannot be cancelled');
    }
    notification.status = 'cancelled';
    notification.nextRunAt = null;
    const saved = await this.notifications.save(notification);
    await this.audit(
      actor,
      'legal.notification.cancel',
      'legal_notification',
      saved.id,
      { issuerId: saved.issuerId, applicationId: saved.applicationId },
    );
    return LegalMapper.notification(saved);
  }

  async listAuditEvents(filter: AuditEventFilterDto) {
    const rows = await this.auditEvents.find({
      where: {
        ...(filter.issuerId ? { issuerId: filter.issuerId } : {}),
        ...(filter.applicationId
          ? { applicationId: filter.applicationId }
          : {}),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => LegalMapper.auditEvent(row));
  }

  async exportAcceptances(
    filter: AcceptanceExportFilterDto,
    actor: LegalActor,
  ) {
    const rows = await this.acceptances.find({
      where: {
        ...(filter.issuerId ? { issuerId: filter.issuerId } : {}),
        ...(filter.applicationId
          ? { applicationId: filter.applicationId }
          : {}),
      },
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    const issuerId = filter.issuerId ?? rows[0]?.issuerId;
    const applicationId = filter.applicationId ?? rows[0]?.applicationId;
    const audit = await this.auditEvents.save(
      this.auditEvents.create({
        issuerId: issuerId ?? null,
        applicationId: applicationId ?? null,
        traceId: actor.traceId,
        actorIdentityIssuer: actor.identityIssuer,
        actorSubjectId: actor.subjectId,
        actorType: actor.actorType,
        action: 'legal.acceptance.export',
        entityType: 'legal_acceptance',
        entityId: null,
        metadata: { count: rows.length, format: filter.format ?? 'json' },
      }),
    );
    await this.outboxEvents.save(
      this.outboxEvents.create({
        traceId: actor.traceId,
        eventType: 'legal.acceptance.exported',
        payload: {
          auditEventId: audit.id,
          issuerId: issuerId ?? null,
          applicationId: applicationId ?? null,
          count: rows.length,
          format: filter.format ?? 'json',
        },
      }),
    );

    const mapped = rows.map((row) => LegalMapper.acceptance(row));
    if (filter.format === 'csv') {
      return {
        contentType: 'text/csv; charset=utf-8',
        filename: 'legal-acceptances.csv',
        body: toCsv(mapped),
      };
    }
    return {
      contentType: 'application/json; charset=utf-8',
      filename: 'legal-acceptances.json',
      body: JSON.stringify(mapped, null, 2),
    };
  }

  async getPublicDocument(
    applicationId: string,
    documentKey: string,
    locale: string,
    version?: string,
  ) {
    const document = await this.documents.findOne({
      where: {
        applicationId,
        key: documentKey,
        locale,
        status: 'active',
      },
      order: { createdAt: 'ASC' },
    });
    if (!document) throw new NotFoundException('Document not found');
    const policy = documentPolicy(document.documentType);
    if (!policy || policy.workflow !== 'public') {
      throw new NotFoundException('Document not found');
    }

    const published = await this.versions.findOne({
      where: {
        documentId: document.id,
        status: 'published',
        ...(version ? { version } : {}),
      },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    if (!published) throw new NotFoundException('Published version not found');

    const publication = await this.publications.findOne({
      where: { documentVersionId: published.id, status: 'published' },
    });
    if (!publication) throw new NotFoundException('Published storage not found');

    const assets = await this.publicationAssets.find({
      where: { publicationId: publication.id },
    });
    if (
      policy.requiresHtml &&
      !assets.some((asset) => asset.kind === 'html')
    ) {
      throw new NotFoundException('Published HTML artifact not found');
    }
    const rules = await this.rules.find({
      where: {
        documentId: document.id,
        versionId: published.id,
        status: 'active',
      },
    });
    const artifactEntries = await Promise.all(
      assets
        .filter((asset) => asset.kind !== 'source')
        .map(async (asset) => {
        const signed = await this.storage.signedDownloadUrl({
          bucket: asset.s3Bucket,
          key: asset.s3ObjectKey,
          versionId: asset.s3VersionId,
          etag: null,
          contentType: asset.contentType,
          size: asset.sizeBytes,
          sha256: asset.sha256,
        });
        return [
          asset.kind,
          {
            url: signed.url,
            expiresAt: signed.expiresAt,
            contentType: asset.contentType,
            size: asset.sizeBytes,
            sha256: asset.sha256,
          },
        ] as const;
      }),
    );

    let privacyNotice: {
      variant: LegalDocument['documentVariant'];
      integralDocumentKey: string | null;
      integralVersion: string;
    } | null = null;
    if (document.documentType === 'privacy_notice') {
      const integral = document.documentVariant === 'integral'
        ? document
        : document.parentDocumentId
          ? await this.documents.findOneBy({ id: document.parentDocumentId })
          : null;
      const integralVersion = integral
        ? document.documentVariant === 'integral'
          ? published
          : await this.versions.findOneBy({
              documentId: integral.id,
              version: published.version,
              status: 'published',
            })
        : null;
      privacyNotice = {
        variant: document.documentVariant,
        integralDocumentKey: integral?.key ?? null,
        integralVersion: integralVersion?.version ?? published.version,
      };
    }

    return {
      document: LegalMapper.document(document),
      privacyNotice,
      version: {
        id: published.id,
        documentId: published.documentId,
        version: published.version,
        status: published.status,
        contentHash: published.contentHash,
        sourceHash: published.sourceHash,
        effectiveFrom: published.effectiveFrom,
        effectiveUntil: published.effectiveUntil,
        acceptanceDeadline: published.acceptanceDeadline,
        gracePeriodDays: published.gracePeriodDays,
        publishedAt: published.publishedAt,
      },
      contentHash: published.contentHash,
      acceptance: {
        required: rules.some(
          (rule) => rule.acceptanceMode !== 'informational',
        ),
        blocking: rules.some((rule) => rule.isBlocking),
        rules: rules.map((rule) => ({
          acceptanceMode: rule.acceptanceMode,
          isBlocking: rule.isBlocking,
          startsAt: rule.startsAt,
          endsAt: rule.endsAt,
        })),
      },
      publication: {
        version: publication.version,
        status: publication.status,
        effectiveFrom: publication.effectiveFrom,
        effectiveUntil: publication.effectiveUntil,
        publishedAt: publication.publishedAt,
      },
      artifacts: Object.fromEntries(artifactEntries),
    };
  }

  private async activeApplication(id: string, manager?: EntityManager) {
    const application = await this.applicationById(id, manager);
    if (application.status !== 'active') {
      throw new ConflictException('Application is not active');
    }
    await this.activeIssuer(application.issuerId, manager);
    return application;
  }

  private async applicationById(id: string, manager?: EntityManager) {
    const applications =
      manager?.getRepository(LegalApplication) ?? this.applications;
    const application = await applications.findOneBy({ id });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private async activeDocument(id: string, manager?: EntityManager) {
    const documents = manager?.getRepository(LegalDocument) ?? this.documents;
    const document = await documents.findOneBy({ id });
    if (!document) throw new NotFoundException('Document not found');
    if (document.status === 'archived') {
      throw new ConflictException('Document is archived');
    }
    await this.activeApplication(document.applicationId, manager);
    return document;
  }

  private async documentById(id: string, manager?: EntityManager) {
    const documents = manager?.getRepository(LegalDocument) ?? this.documents;
    const document = await documents.findOneBy({ id });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private async issuerById(id: string, manager?: EntityManager) {
    const issuers = manager?.getRepository(LegalIssuer) ?? this.issuers;
    const issuer = await issuers.findOneBy({ id });
    if (!issuer) throw new NotFoundException('Issuer not found');
    return issuer;
  }

  private async activeIssuer(id: string, manager?: EntityManager) {
    const issuer = await this.issuerById(id, manager);
    if (issuer.status !== 'active') {
      throw new ConflictException('Issuer is not active');
    }
    return issuer;
  }

  private async currentPublished(documentId: string, manager?: EntityManager) {
    const versions =
      manager?.getRepository(LegalDocumentVersion) ?? this.versions;
    return versions.findOne({
      where: { documentId, status: 'published' },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
  }

  private async publicationConflicts(
    documentId: string,
    dto: PublishDraftDto,
    hasDraft = true,
    document?: LegalDocument,
  ) {
    const conflicts: string[] = [];
    if (!hasDraft) conflicts.push('Draft not found');
    if (!/^\d+\.\d+\.\d+$/.test(dto.version)) {
      conflicts.push('Version must be semantic');
    }
    if (await this.versions.existsBy({ documentId, version: dto.version })) {
      conflicts.push('Version already exists');
    }
    const rules = dto.rules ?? [];
    const resolvedDocument = document ?? (await this.documents.findOneBy({ id: documentId }));
    if (resolvedDocument) {
      const policy = documentPolicy(resolvedDocument.documentType);
      if (!policy) conflicts.push('Invalid document type');
      const draft = await this.versions.findOneBy({
        documentId,
        version: 'draft',
        status: 'draft',
      });
      if (draft && (!draft.sourceKind || !policy?.allowedSourceKinds.includes(draft.sourceKind))) {
        conflicts.push('Draft source format is not allowed for this document type');
      }
      if (draft && policy?.requiresHtml && draft.sourceKind !== 'html' && draft.sourceKind !== 'markdown') {
        conflicts.push('Public documents require an HTML-compatible source');
      }
      if (policy?.acceptance === 'required' && rules.length === 0) {
        conflicts.push('At least one acceptance rule is required');
      }
      if (policy?.acceptance === 'optional' && rules.length > 0) {
        conflicts.push('Acceptance rules are not allowed for this document type');
      }
      if (
        resolvedDocument.documentType === 'privacy_notice' &&
        resolvedDocument.documentVariant !== 'integral'
      ) {
        const parent = resolvedDocument.parentDocumentId
          ? await this.documents.findOneBy({ id: resolvedDocument.parentDocumentId })
          : null;
        const integralVersion = parent
          ? await this.versions.findOneBy({
              documentId: parent.id,
              version: dto.version,
              status: 'published',
            })
          : null;
        if (!integralVersion) {
          conflicts.push(
            'An equivalent published integral privacy notice is required',
          );
        }
      }
    }
    for (const rule of rules) {
      if (
        rule.startsAt &&
        rule.endsAt &&
        Date.parse(rule.endsAt) <= Date.parse(rule.startsAt)
      ) {
        conflicts.push('Rule endsAt must be after startsAt');
      }
    }
    if (hasOverlappingRules(rules)) {
      conflicts.push('Rules overlap in the same context');
    }
    return conflicts;
  }

  private async acceptanceFor(
    dto: EvaluatePendingDto,
    rule: LegalAcceptanceRule,
    version: LegalDocumentVersion,
  ) {
    return findAcceptance(
      this.acceptances,
      dto.identityIssuer,
      dto.subjectId,
      version.id,
      rule.id,
      dto.organizationId,
      dto.productTenantId,
    );
  }

  private throwRuleConflicts(conflicts: string[]) {
    if (conflicts.length) throw new ConflictException(conflicts.join(', '));
  }

  private async audit(
    actor: LegalActor,
    action: string,
    entityType: string,
    entityId: string,
    context: { issuerId?: string; applicationId?: string },
  ) {
    await this.auditWith(
      this.auditEvents,
      actor,
      action,
      entityType,
      entityId,
      context,
    );
  }

  private async auditWith(
    auditEvents: Repository<AuditEvent>,
    actor: LegalActor,
    action: string,
    entityType: string,
    entityId: string,
    context: { issuerId?: string; applicationId?: string },
  ) {
    await auditEvents.save(
      auditEvents.create({
        issuerId: context.issuerId ?? null,
        applicationId: context.applicationId ?? null,
        traceId: actor.traceId,
        actorIdentityIssuer: actor.identityIssuer,
        actorSubjectId: actor.subjectId,
        actorType: actor.actorType,
        action,
        entityType,
        entityId,
      }),
    );
  }
}

function hasOverlappingRules(rules: AcceptanceRuleInputDto[]) {
  return rules.some((rule, index) =>
    rules.slice(index + 1).some((candidate) => {
      if (ruleKey(rule) !== ruleKey(candidate)) return false;
      return periodsOverlap(rule, candidate);
    }),
  );
}

function ruleKey(rule: AcceptanceRuleInputDto) {
  return [
    rule.acceptanceMode,
    rule.organizationId ?? '',
    rule.productTenantId ?? '',
    rule.role ?? '',
  ].join('|');
}

function periodsOverlap(
  first: AcceptanceRuleInputDto,
  second: AcceptanceRuleInputDto,
) {
  const firstStart = first.startsAt ? Date.parse(first.startsAt) : -Infinity;
  const firstEnd = first.endsAt ? Date.parse(first.endsAt) : Infinity;
  const secondStart = second.startsAt ? Date.parse(second.startsAt) : -Infinity;
  const secondEnd = second.endsAt ? Date.parse(second.endsAt) : Infinity;
  return firstStart < secondEnd && secondStart < firstEnd;
}

function matchesContext(ruleValue: string | null, requestValue?: string) {
  return ruleValue === null || ruleValue === (requestValue ?? null);
}

function bestRuleByDocument(rules: LegalAcceptanceRule[]) {
  const selected = new Map<string, LegalAcceptanceRule>();
  for (const rule of rules) {
    const current = selected.get(rule.documentId);
    if (!current || specificity(rule) > specificity(current)) {
      selected.set(rule.documentId, rule);
    }
  }
  return [...selected.values()];
}

function specificity(rule: LegalAcceptanceRule) {
  return (
    Number(!!rule.organizationId) +
    Number(!!rule.productTenantId) +
    Number(!!rule.role)
  );
}

function ensureAcceptanceContext(
  rule: LegalAcceptanceRule,
  dto: CreateAcceptanceDto,
) {
  if (!matchesContext(rule.organizationId, dto.organizationId)) {
    throw new ConflictException('Organization does not match rule');
  }
  if (!matchesContext(rule.productTenantId, dto.productTenantId)) {
    throw new ConflictException('Product tenant does not match rule');
  }
}

function isUniqueViolation(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return (
    'driverError' in error &&
    typeof error.driverError === 'object' &&
    error.driverError !== null &&
    'code' in error.driverError &&
    error.driverError.code === '23505'
  );
}

async function findAcceptance(
  acceptances: Repository<LegalAcceptance>,
  identityIssuer: string,
  subjectId: string,
  documentVersionId: string,
  acceptanceRuleId: string,
  organizationId?: string,
  productTenantId?: string,
) {
  const rows = await acceptances.find({
    where: { identityIssuer, subjectId, documentVersionId, acceptanceRuleId },
  });
  return (
    rows.find(
      (row) =>
        row.organizationId === (organizationId ?? null) &&
        row.productTenantId === (productTenantId ?? null),
    ) ?? null
  );
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = [
    'id',
    'issuerId',
    'applicationId',
    'organizationId',
    'productTenantId',
    'identityIssuer',
    'subjectId',
    'documentId',
    'documentVersionId',
    'acceptanceRuleId',
    'acceptanceMode',
    'contentHash',
    'acceptedAt',
  ];
  return [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(','),
    ),
  ].join('\n');
}

function csvCell(value: unknown) {
  const text =
    value instanceof Date
      ? value.toISOString()
      : value === null || value === undefined
        ? ''
        : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
