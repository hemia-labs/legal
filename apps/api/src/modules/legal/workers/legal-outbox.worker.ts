import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  IsNull,
  LessThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { createHash } from 'crypto';
import { AuditEvent } from '../entities/audit-event.entity';
import { LegalAcceptance } from '../entities/legal-acceptance.entity';
import { LegalAcceptanceRule } from '../entities/legal-acceptance-rule.entity';
import { LegalDocumentVersion } from '../entities/legal-document-version.entity';
import { LegalEvidence } from '../entities/legal-evidence.entity';
import { LegalNotification } from '../entities/legal-notification.entity';
import { LegalPublication } from '../entities/legal-publication.entity';
import { LegalPublicationAsset } from '../entities/legal-publication-asset.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { S3StorageService } from '../../storage/s3-storage.service';
import {
  buildEvidenceKey,
  buildPublicationArtifactKey,
  buildPublicationSourceKey,
  type StorageObjectRef,
} from '../../storage/types/storage.types';
import {
  analyzeLegalSource,
  canonicalHtml,
  renderMarkdown,
  sanitizeHtml,
  sha256,
} from '../helpers/legal-source.helper';

const CHANNELS = ['in_app', 'email'];
const BACKOFF_MINUTES = [1, 5, 15];
const EVENT_BUS_OUTBOX_TYPES = [
  'product.organization_product.provisioned.v1',
  'product.organization_product.provisioning_failed.v1',
];

@Injectable()
export class LegalOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LegalOutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outbox: Repository<OutboxEvent>,
    @InjectRepository(LegalAcceptanceRule)
    private readonly rules: Repository<LegalAcceptanceRule>,
    @InjectRepository(LegalNotification)
    private readonly notifications: Repository<LegalNotification>,
    @InjectRepository(LegalPublication)
    private readonly publications: Repository<LegalPublication>,
    @InjectRepository(LegalPublicationAsset)
    private readonly publicationAssets: Repository<LegalPublicationAsset>,
    @InjectRepository(LegalEvidence)
    private readonly evidences: Repository<LegalEvidence>,
    @InjectRepository(LegalAcceptance)
    private readonly acceptances: Repository<LegalAcceptance>,
    private readonly dataSource: DataSource,
    private readonly storage: S3StorageService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.processPending().catch((error) =>
        this.logger.error(error instanceof Error ? error.message : error),
      );
    }, 30000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending(limit = 10) {
    const now = new Date();
    const events = await this.outbox.find({
      where: [
        {
          eventType: Not(In(EVENT_BUS_OUTBOX_TYPES)),
          status: 'pending',
          nextRunAt: IsNull(),
        },
        {
          eventType: Not(In(EVENT_BUS_OUTBOX_TYPES)),
          status: 'pending',
          nextRunAt: LessThanOrEqual(now),
        },
      ],
      order: { createdAt: 'ASC' },
      take: limit,
    });

    for (const event of events) {
      await this.processEvent(event);
    }

    return { processed: events.length };
  }

  private async processEvent(event: OutboxEvent) {
    event.status = 'processing';
    await this.outbox.save(event);

    try {
      if (event.eventType === 'legal.version.published') {
        await this.createPublicationNotifications(event);
      }
      if (event.eventType === 'legal.publication.requested') {
        await this.processPublication(event);
      }
      if (event.eventType === 'legal.evidence.requested') {
        await this.processEvidence(event);
      }
      if (event.eventType === 'legal.acceptance.recorded') {
        await this.cancelAcceptanceNotifications(event);
      }

      event.status = 'processed';
      event.processedAt = new Date();
      event.nextRunAt = null;
      await this.outbox.save(event);
    } catch (error) {
      event.attemptCount += 1;
      event.status = event.attemptCount >= BACKOFF_MINUTES.length ? 'failed' : 'pending';
      event.nextRunAt =
        event.status === 'pending'
          ? minutesFromNow(BACKOFF_MINUTES[event.attemptCount - 1])
          : null;
      await this.outbox.save(event);
      throw error;
    }
  }

  private async processPublication(event: OutboxEvent) {
    const publicationId = stringPayload(event, 'publicationId');
    if (!publicationId) return;
    const locale = stringPayload(event, 'locale');
    if (!locale) throw new Error('Publication locale is required');

    const publication = await this.publications.findOneBy({ id: publicationId });
    if (!publication || publication.status === 'published') return;
    publication.status = 'uploading';
    publication.failureReason = null;
    await this.publications.save(publication);

    try {
      const context = {
        issuerId: publication.issuerId,
        productId: publication.productId,
        locale,
        organizationId: publication.organizationId,
        tenantId: publication.productTenantId,
        documentKey: publication.documentKey,
        version: publication.version,
      };
      const uploaded: Array<{ kind: string; ref: StorageObjectRef }> = [];
      const sourceRef = storageRefPayload(event.payload.sourceRef);

      if (sourceRef) {
        const sourceBody = await this.storage.read(sourceRef);
        const sourceHash = sha256(sourceBody);
        if (sourceHash !== stringPayload(event, 'sourceHash')) {
          throw new Error('Source hash does not match publication payload');
        }
        const sourceKind = stringPayload(event, 'sourceKind');
        if (sourceKind !== 'pdf' && sourceKind !== 'html' && sourceKind !== 'markdown') {
          throw new Error('Invalid legal source kind');
        }
        const analysis = analyzeLegalSource({
          buffer: sourceBody,
          mimetype: sourceRef.contentType,
          originalname: stringPayload(event, 'sourceFileName') ?? 'source',
          sourceKind,
        });
        if (analysis.contentHash !== publication.contentHash) {
          throw new Error('Content hash does not match publication');
        }

        const finalSource = await this.storage.putImmutable(
          buildPublicationSourceKey(context, sourceKind, sourceHash),
          sourceBody,
          sourceRef.contentType,
        );
        uploaded.push({ kind: 'source', ref: finalSource });

        if (sourceKind === 'pdf') {
          uploaded.push({ kind: 'pdf', ref: finalSource });
        } else {
          const html = sourceKind === 'html'
            ? canonicalHtml(sanitizeHtml(sourceBody.toString('utf8')))
            : renderMarkdown(sourceBody.toString('utf8'));
          const htmlRef = await this.storage.putImmutable(
            buildPublicationArtifactKey(context, 'html'),
            Buffer.from(html, 'utf8'),
            'text/html',
          );
          uploaded.push({ kind: 'html', ref: htmlRef });
        }
      } else {
        throw new Error('Publication source reference is missing');
      }

      const jsonRef = await this.storage.putImmutable(
        buildPublicationArtifactKey(context, 'json'),
        Buffer.from(JSON.stringify({
          publicationId: publication.id,
          documentId: publication.documentId,
          documentVersionId: publication.documentVersionId,
          documentType: publication.documentType,
          applicationId: publication.applicationId,
          locale,
          documentKey: publication.documentKey,
          version: publication.version,
          sourceHash: stringPayload(event, 'sourceHash') ?? publication.sourceHash,
          contentHash: publication.contentHash,
          effectiveFrom: publication.effectiveFrom,
          effectiveUntil: publication.effectiveUntil,
        })),
        'application/json',
      );
      uploaded.push({ kind: 'json', ref: jsonRef });

      const manifestHash = createHash('sha256')
        .update(JSON.stringify(uploaded.map(({ kind, ref }) => ({ kind, ref }))))
        .digest('hex');

      await this.dataSource.transaction(async (manager) => {
        const publications = manager.getRepository(LegalPublication);
        const assets = manager.getRepository(LegalPublicationAsset);
        const versions = manager.getRepository(LegalDocumentVersion);
        const rules = manager.getRepository(LegalAcceptanceRule);
        const audits = manager.getRepository(AuditEvent);
        const outbox = manager.getRepository(OutboxEvent);
        const current = await publications.findOneBy({ id: publicationId });
        if (!current || current.status === 'published') return;

        const previous = await versions.findOne({
          where: { documentId: current.documentId, status: 'published' },
          order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
        });
        if (previous) {
          previous.status = 'superseded';
          await versions.save(previous);
          const previousPublication = await publications.findOneBy({
            documentVersionId: previous.id,
            status: 'published',
          });
          if (previousPublication) {
            previousPublication.status = 'superseded';
            await publications.save(previousPublication);
          }
          await rules.update(
            { documentId: current.documentId, status: 'active' },
            { status: 'expired' },
          );
        }

        const draft = await versions.findOneBy({
          documentId: current.documentId,
          version: 'draft',
          status: 'draft',
        });
        if (draft) {
          draft.status = 'superseded';
          await versions.save(draft);
        }

        const version = await versions.findOneBy({ id: current.documentVersionId });
        if (!version) throw new Error('Publication version not found');
        version.status = 'published';
        version.publishedAt = new Date();
        version.publishedByIdentityIssuer = 'storage-worker';
        version.publishedBySubjectId = current.id;
        const sourceAsset = uploaded.find((asset) => asset.kind === 'source');
        if (sourceAsset) {
          version.sourceS3Bucket = sourceAsset.ref.bucket;
          version.sourceS3ObjectKey = sourceAsset.ref.key;
          version.sourceS3VersionId = sourceAsset.ref.versionId;
          version.sourceS3Etag = sourceAsset.ref.etag;
        }
        await versions.save(version);

        await rules.save(
          current.rulesSnapshot.map((rule) =>
            rules.create({
              documentId: current.documentId,
              versionId: current.documentVersionId,
              issuerId: current.issuerId,
              applicationId: current.applicationId,
              organizationId: stringValue(rule.organizationId),
              productTenantId: stringValue(rule.productTenantId),
              role: stringValue(rule.role),
              acceptanceMode: String(rule.acceptanceMode),
              isBlocking:
                typeof rule.isBlocking === 'boolean'
                  ? rule.isBlocking
                  : rule.acceptanceMode !== 'informational',
              status: 'active',
              startsAt: dateValue(rule.startsAt),
              endsAt: dateValue(rule.endsAt),
            }),
          ),
        );

        await assets.save(
          uploaded.map(({ kind, ref }) =>
            assets.create({
              publicationId: current.id,
              kind,
              s3Bucket: ref.bucket,
              s3ObjectKey: ref.key,
              s3VersionId: ref.versionId,
              contentType: ref.contentType,
              sizeBytes: ref.size,
              sha256: ref.sha256,
            }),
          ),
        );

        current.status = 'published';
        current.manifestHash = manifestHash;
        current.publishedAt = new Date();
        current.publishedByIdentityIssuer = 'storage-worker';
        current.publishedBySubjectId = current.id;
        await publications.save(current);
        await audits.save(
          audits.create({
            issuerId: current.issuerId,
            applicationId: current.applicationId,
            traceId: event.traceId,
            actorIdentityIssuer: 'storage-worker',
            actorSubjectId: current.id,
            actorType: 'service',
            action: 'legal.version.publish',
            entityType: 'legal_document_version',
            entityId: version.id,
            metadata: { publicationId: current.id, manifestHash },
          }),
        );
        await outbox.save(
          outbox.create({
            traceId: event.traceId,
            eventType: 'legal.version.published',
            payload: {
              documentId: current.documentId,
              versionId: current.documentVersionId,
              version: current.version,
              issuerId: current.issuerId,
              applicationId: current.applicationId,
              contentHash: current.contentHash,
              effectiveFrom: current.effectiveFrom.toISOString(),
            },
          }),
        );
      });
    } catch (error) {
      publication.status = 'failed';
      publication.failureReason = error instanceof Error ? error.message : String(error);
      await this.publications.save(publication);
      throw error;
    }
  }

  private async processEvidence(event: OutboxEvent) {
    const evidenceId = stringPayload(event, 'evidenceId');
    const acceptanceId = stringPayload(event, 'acceptanceId');
    if (!evidenceId || !acceptanceId) return;

    const evidence = await this.evidences.findOneBy({ id: evidenceId });
    if (!evidence || evidence.status === 'ready') return;
    const acceptance = await this.acceptances.findOneBy({ id: acceptanceId });
    if (!acceptance) return;

    try {
      const body = Buffer.from(
        JSON.stringify({
          acceptanceId: acceptance.id,
          documentVersionId: acceptance.documentVersionId,
          documentHash: acceptance.contentHash,
          identityIssuer: acceptance.identityIssuer,
          subjectId: acceptance.subjectId,
          organizationId: acceptance.organizationId,
          productTenantId: acceptance.productTenantId,
          acceptedAt: acceptance.acceptedAt,
          ipAddress: acceptance.ipAddress,
          userAgent: acceptance.userAgent,
          authenticationMethod: acceptance.authenticationMethod,
        }),
      );
      const ref = await this.storage.putImmutable(
        buildEvidenceKey(
          acceptance.issuerId,
          acceptance.applicationId,
          acceptance.id,
          acceptance.organizationId,
          acceptance.productTenantId,
        ),
        body,
        'application/json',
      );
      evidence.status = 'ready';
      evidence.s3Bucket = ref.bucket;
      evidence.s3ObjectKey = ref.key;
      evidence.s3VersionId = ref.versionId;
      evidence.sizeBytes = ref.size;
      evidence.sha256 = ref.sha256;
      evidence.failureReason = null;
      await this.evidences.save(evidence);
    } catch (error) {
      evidence.status = 'failed';
      evidence.failureReason = error instanceof Error ? error.message : String(error);
      await this.evidences.save(evidence);
      throw error;
    }
  }

  private async createPublicationNotifications(event: OutboxEvent) {
    const versionId = stringPayload(event, 'versionId');
    if (!versionId) return;

    const rules = await this.rules.find({
      where: { versionId, status: 'active' },
    });

    for (const rule of rules) {
      for (const channel of CHANNELS) {
        const recipientLogicalId = recipientForRule(rule);
        if (
          await this.notifications.existsBy({
            sourceEventId: event.id,
            channel,
            recipientLogicalId,
          })
        ) {
          continue;
        }
        await this.notifications.save(
          this.notifications.create({
            sourceEventId: event.id,
            issuerId: rule.issuerId,
            applicationId: rule.applicationId,
            documentId: rule.documentId,
            documentVersionId: rule.versionId,
            acceptanceRuleId: rule.id,
            organizationId: rule.organizationId,
            productTenantId: rule.productTenantId,
            channel,
            recipientLogicalId,
            status: 'pending',
            attemptCount: 0,
            nextRunAt: null,
            sentAt: null,
            metadata: {
              eventType: event.eventType,
              acceptanceMode: rule.acceptanceMode,
              role: rule.role,
            },
          }),
        );
      }
    }
  }

  private async cancelAcceptanceNotifications(event: OutboxEvent) {
    const documentVersionId = stringPayload(event, 'documentVersionId');
    if (!documentVersionId) return;

    const rows = await this.notifications.find({
      where: { documentVersionId, status: 'pending' },
    });
    for (const row of rows) {
      row.status = 'cancelled';
      row.lastError = null;
      row.nextRunAt = null;
      await this.notifications.save(row);
    }
  }
}

function recipientForRule(rule: LegalAcceptanceRule) {
  return [
    rule.issuerId,
    rule.applicationId,
    rule.organizationId ?? '*',
    rule.productTenantId ?? '*',
    rule.role ?? '*',
    rule.acceptanceMode,
  ].join(':');
}

function stringPayload(event: OutboxEvent, key: string) {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
}

function storageRefPayload(value: unknown): StorageObjectRef | null {
  if (!value || typeof value !== 'object') return null;
  const ref = value as Partial<StorageObjectRef>;
  if (
    typeof ref.bucket !== 'string' ||
    typeof ref.key !== 'string' ||
    (typeof ref.versionId !== 'string' && ref.versionId !== null) ||
    (typeof ref.etag !== 'string' && ref.etag !== null) ||
    typeof ref.contentType !== 'string' ||
    typeof ref.size !== 'number' ||
    typeof ref.sha256 !== 'string'
  ) {
    throw new Error('Invalid PDF storage reference');
  }
  return ref as StorageObjectRef;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length ? value : null;
}

function dateValue(value: unknown) {
  return typeof value === 'string' && value.length ? new Date(value) : null;
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}
