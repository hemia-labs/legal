import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import { createHash } from 'node:crypto';

export interface ValidateCheckoutAcceptance {
  organizationId: string;
  identityIssuer: string;
  subjectId: string;
  issuerId: string;
  applicationId: string;
  productCode: string;
  legalAcceptanceId: string;
}
export type Contract = {
  issuerId: string;
  applicationId: string;
  documentIds?: string[];
  termsDocumentId?: string;
  privacyDocumentId?: string;
  refundPolicyDocumentId?: string;
};
type Evidence = {
  document_id: string;
  version_id: string;
  version: string;
  rule_id: string;
  specificity: number;
  acceptance_id: string | null;
  accepted_at: Date | null;
  content_hash: string;
};
@Injectable()
export class LegalAcceptanceValidationService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DataSource,
  ) {}
  async validate(
    input: ValidateCheckoutAcceptance,
    roles: string[],
    external?: { contract: Contract; sourceId: string },
    database: DataSource | import('typeorm').EntityManager = this.db,
  ) {
    let contract: Contract;
    try {
      if (external) {
        contract = external.contract;
      } else {
        const contracts = JSON.parse(
          this.config.getOrThrow<string>('LEGAL_CHECKOUT_CONTRACTS'),
        ) as Record<string, Contract>;
        if (!Object.hasOwn(contracts, input.productCode)) throw new Error();
        contract = contracts[input.productCode];
      }
      const ids = contract?.documentIds ?? [
        contract?.termsDocumentId,
        contract?.privacyDocumentId,
        contract?.refundPolicyDocumentId,
      ];
      if (
        !contract ||
        ![contract.issuerId, contract.applicationId].every(
          (id) => typeof id === 'string' && isUUID(id),
        ) ||
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 100 ||
        !ids.every((id) => typeof id === 'string' && isUUID(id)) ||
        new Set(ids).size !== ids.length
      )
        throw new Error();
    } catch {
      throw new ServiceUnavailableException(
        'Checkout legal contract is not configured',
      );
    }
    const invalid = {
      contractVersion: 1,
      valid: false,
      reason: 'acceptance_not_current_or_incomplete',
    };
    if (
      contract.issuerId !== input.issuerId ||
      contract.applicationId !== input.applicationId
    )
      return invalid;
    const documents = contract.documentIds ?? [
      contract.termsDocumentId!,
      contract.privacyDocumentId!,
      contract.refundPolicyDocumentId!,
    ];
    // One PostgreSQL snapshot: active resources, applicable current rules and exact persisted evidence.
    const rows: Evidence[] = await database.query(
      `SELECT d.id AS document_id,v.id AS version_id,v.version,r.id AS rule_id,
      (CASE WHEN r.organization_id IS NULL THEN 0 ELSE 1 END + CASE WHEN r.role IS NULL THEN 0 ELSE 1 END) AS specificity,
      a.id AS acceptance_id,a.accepted_at,v.content_hash
      FROM documents d JOIN applications app ON app.id=d.application_id AND app.issuer_id=d.issuer_id
      JOIN issuers i ON i.id=app.issuer_id JOIN document_versions v ON v.document_id=d.id
      JOIN acceptance_rules r ON r.document_id=d.id AND r.version_id=v.id AND r.application_id=app.id AND r.issuer_id=i.id
      LEFT JOIN acceptances a ON a.document_id=d.id AND a.document_version_id=v.id AND a.acceptance_rule_id=r.id
        AND a.application_id=app.id AND a.issuer_id=i.id AND a.organization_id=$4
        AND a.identity_issuer=$5 AND a.subject_id=$6 AND a.accepted_by_identity_issuer=$5 AND a.accepted_by_subject_id=$6
        AND ($8::uuid IS NULL OR (a.external_identity_source_id=$8 AND a.registering_client_id IS NOT NULL))
        AND a.content_hash=v.content_hash AND a.acceptance_mode=r.acceptance_mode AND a.accepted_at<=now()
        AND (r.acceptance_mode<>'organization_representative' OR a.role_at_acceptance=r.role)
      WHERE d.id=ANY($1::uuid[]) AND i.id=$2 AND app.id=$3
        AND d.status='active' AND d.deleted_at IS NULL AND app.status='active' AND app.deleted_at IS NULL AND i.status='active' AND i.deleted_at IS NULL
        AND v.status='published' AND v.content_hash IS NOT NULL AND (v.effective_from IS NULL OR v.effective_from<=now()) AND (v.effective_until IS NULL OR v.effective_until>now())
        AND r.status='active' AND r.acceptance_mode IN ('individual','organization_representative')
        AND (r.organization_id IS NULL OR r.organization_id=$4) AND (r.role IS NULL OR r.role=ANY($7::text[]))
        AND (r.acceptance_mode<>'organization_representative' OR r.role IS NOT NULL)
        AND (r.starts_at IS NULL OR r.starts_at<=now()) AND (r.ends_at IS NULL OR r.ends_at>now())`,
      [
        documents,
        input.issuerId,
        input.applicationId,
        input.organizationId,
        input.identityIssuer,
        input.subjectId,
        roles,
        external?.sourceId ?? null,
      ],
    );
    const evidence: Evidence[] = [];
    for (const document of documents) {
      const candidates = rows.filter((row) => row.document_id === document);
      const best = Math.max(...candidates.map((row) => row.specificity));
      const selected = candidates.filter((row) => row.specificity === best);
      if (
        selected.length !== 1 ||
        !selected[0].acceptance_id ||
        !selected[0].accepted_at
      )
        return invalid;
      evidence.push(selected[0]);
    }
    if (!evidence.some((row) => row.acceptance_id === input.legalAcceptanceId))
      return invalid;
    const snapshot = {
      contractVersion: 1,
      issuerId: input.issuerId,
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      identityIssuer: input.identityIssuer,
      subjectId: input.subjectId,
      productCode: input.productCode,
      legalAcceptanceId: input.legalAcceptanceId,
      evidence: evidence.map((row) => ({
        documentId: row.document_id,
        documentVersionId: row.version_id,
        acceptanceRuleId: row.rule_id,
        acceptanceId: row.acceptance_id,
        version: row.version,
        contentHash: row.content_hash,
        acceptedAt: row.accepted_at!.toISOString(),
      })),
    };
    return {
      ...snapshot,
      valid: true,
      ...(!contract.documentIds
        ? {
            termsVersion: evidence[0].version,
            privacyVersion: evidence[1].version,
            refundPolicyVersion: evidence[2].version,
          }
        : {}),
      acceptedAt: new Date(
        Math.max(...evidence.map((row) => row.accepted_at!.getTime())),
      ).toISOString(),
      legalSnapshotHash: createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex'),
    };
  }
}
