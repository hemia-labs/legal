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

export const LegalMapper = {
  issuer(entity: LegalIssuer) {
    return {
      id: entity.id,
      key: entity.key,
      name: entity.name,
      legalName: entity.legalName,
      type: entity.type,
      taxId: entity.taxId,
      countryCode: entity.countryCode,
      defaultLocale: entity.defaultLocale,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  application(entity: LegalApplication) {
    return {
      id: entity.id,
      issuerId: entity.issuerId,
      key: entity.key,
      name: entity.name,
      status: entity.status,
      ...(entity.issuer
        ? {
            issuer: {
              id: entity.issuer.id,
              name: entity.issuer.name,
              status: entity.issuer.status,
            },
          }
        : {}),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  document(entity: LegalDocument) {
    return {
      id: entity.id,
      issuerId: entity.issuerId,
      applicationId: entity.applicationId,
      key: entity.key,
      documentType: entity.documentType,
      documentVariant: entity.documentVariant,
      parentDocumentId: entity.parentDocumentId,
      locale: entity.locale,
      title: entity.title,
      status: entity.status,
      ...(entity.issuer
        ? {
            issuer: {
              id: entity.issuer.id,
              name: entity.issuer.name,
              status: entity.issuer.status,
            },
          }
        : {}),
      ...(entity.application
        ? {
            application: {
              id: entity.application.id,
              key: entity.application.key,
              name: entity.application.name,
              status: entity.application.status,
            },
          }
        : {}),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  draft(entity: LegalDocumentVersion) {
    return {
      id: entity.id,
      documentId: entity.documentId,
      version: entity.version,
      status: entity.status,
      sourceKind: entity.sourceKind,
      sourceContentType: entity.sourceContentType,
      sourceFileName: entity.sourceFileName,
      sourceSizeBytes: entity.sourceSizeBytes,
      sourceHash: entity.sourceHash,
      contentHash: entity.contentHash,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  version(entity: LegalDocumentVersion) {
    return {
      id: entity.id,
      documentId: entity.documentId,
      version: entity.version,
      status: entity.status,
      contentHash: entity.contentHash,
      sourceKind: entity.sourceKind,
      sourceContentType: entity.sourceContentType,
      sourceFileName: entity.sourceFileName,
      sourceSizeBytes: entity.sourceSizeBytes,
      sourceHash: entity.sourceHash,
      effectiveFrom: entity.effectiveFrom,
      acceptanceDeadline: entity.acceptanceDeadline,
      effectiveUntil: entity.effectiveUntil,
      gracePeriodDays: entity.gracePeriodDays,
      publishedAt: entity.publishedAt,
      publishedByIdentityIssuer: entity.publishedByIdentityIssuer,
      publishedBySubjectId: entity.publishedBySubjectId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  rule(entity: LegalAcceptanceRule) {
    return {
      id: entity.id,
      documentId: entity.documentId,
      versionId: entity.versionId,
      issuerId: entity.issuerId,
      applicationId: entity.applicationId,
      organizationId: entity.organizationId,
      role: entity.role,
      acceptanceMode: entity.acceptanceMode,
      isBlocking: entity.isBlocking,
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  acceptance(entity: LegalAcceptance) {
    return {
      id: entity.id,
      issuerId: entity.issuerId,
      applicationId: entity.applicationId,
      organizationId: entity.organizationId,
      identityIssuer: entity.identityIssuer,
      subjectId: entity.subjectId,
      documentId: entity.documentId,
      documentVersionId: entity.documentVersionId,
      acceptanceRuleId: entity.acceptanceRuleId,
      acceptedByIdentityIssuer: entity.acceptedByIdentityIssuer,
      acceptedBySubjectId: entity.acceptedBySubjectId,
      acceptanceMode: entity.acceptanceMode,
      roleAtAcceptance: entity.roleAtAcceptance,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      sessionId: entity.sessionId,
      authenticationMethod: entity.authenticationMethod,
      locale: entity.locale,
      contentHash: entity.contentHash,
      acceptedAt: entity.acceptedAt,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
    };
  },

  notification(entity: LegalNotification) {
    return {
      id: entity.id,
      sourceEventId: entity.sourceEventId,
      issuerId: entity.issuerId,
      applicationId: entity.applicationId,
      documentId: entity.documentId,
      documentVersionId: entity.documentVersionId,
      acceptanceRuleId: entity.acceptanceRuleId,
      organizationId: entity.organizationId,
      channel: entity.channel,
      recipientLogicalId: entity.recipientLogicalId,
      status: entity.status,
      attemptCount: entity.attemptCount,
      lastError: entity.lastError,
      nextRunAt: entity.nextRunAt,
      sentAt: entity.sentAt,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  auditEvent(entity: AuditEvent) {
    return {
      id: entity.id,
      issuerId: entity.issuerId,
      applicationId: entity.applicationId,
      traceId: entity.traceId,
      actorIdentityIssuer: entity.actorIdentityIssuer,
      actorSubjectId: entity.actorSubjectId,
      actorType: entity.actorType,
      action: entity.action,
      entityType: entity.entityType,
      entityId: entity.entityId,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
    };
  },

  publication(entity: LegalPublication) {
    return {
      id: entity.id,
      documentId: entity.documentId,
      documentVersionId: entity.documentVersionId,
      version: entity.version,
      status: entity.status,
      documentType: entity.documentType,
      productId: entity.productId,
      organizationId: entity.organizationId,
      sourceKind: entity.sourceKind,
      sourceHash: entity.sourceHash,
      effectiveFrom: entity.effectiveFrom,
      effectiveUntil: entity.effectiveUntil,
      publishedAt: entity.publishedAt,
      failureReason: entity.failureReason,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  publicationAsset(entity: LegalPublicationAsset) {
    return {
      id: entity.id,
      publicationId: entity.publicationId,
      kind: entity.kind,
      bucket: entity.s3Bucket,
      key: entity.s3ObjectKey,
      versionId: entity.s3VersionId,
      contentType: entity.contentType,
      size: entity.sizeBytes,
      sha256: entity.sha256,
      createdAt: entity.createdAt,
    };
  },
};
