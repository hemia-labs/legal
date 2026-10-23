import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import {
  IntegrationRegistryService,
  ExternalSource,
} from '../registry/integration-registry.service';
import { ExternalContextService } from './external-context.service';
import {
  PrepareExternalAcceptanceDto,
  AcceptExternalDocumentsDto,
  ValidateExternalEvidenceDto,
} from '../integration.dto';
import { IntegrationRequest } from './integration-auth.guard';
import { LegalService } from '../../services/legal.service';
import {
  LegalAcceptanceValidationService,
  Contract,
} from '../../authorization/legal-acceptance-validation.service';
type Document = {
  documentId: string;
  documentVersionId: string;
  acceptanceRuleId: string;
  version: string;
  contentHash: string;
  title: string;
  documentType: string;
  key: string;
  locale: string;
  acceptanceMode: string;
  role: string | null;
  specificity: number;
};
type Prepared = {
  id: string;
  source_id: string;
  client_id: string;
  subject_id: string;
  organization_id: string;
  session_id: string;
  documents: Document[];
  expires_at: Date;
  idempotency_key: string | null;
  payload_hash: string | null;
  result: Record<string, unknown> | null;
};
export function confirmationHash(dto: AcceptExternalDocumentsDto) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        requestId: dto.requestId,
        confirmations: [...dto.confirmations].sort((a, b) =>
          a.documentVersionId.localeCompare(b.documentVersionId),
        ),
      }),
    )
    .digest('hex');
}
export function documentFingerprint(documents: Document[]) {
  return JSON.stringify(
    documents.map((d) => [
      d.documentId,
      d.documentVersionId,
      d.acceptanceRuleId,
      d.version,
      d.contentHash,
      d.acceptanceMode,
      d.role,
    ]),
  );
}
export function selectDocuments(rows: Document[], ids: string[]): Document[] {
  return ids.map((id) => {
    const candidates = rows.filter((r) => r.documentId === id);
    const max = Math.max(...candidates.map((r) => Number(r.specificity)));
    const best = candidates.filter((r) => Number(r.specificity) === max);
    if (best.length !== 1)
      throw new ConflictException('LEGAL_DOCUMENTS_NOT_CURRENT_OR_AMBIGUOUS');
    return best[0];
  });
}
@Injectable()
export class ExternalAcceptanceService {
  constructor(
    private readonly db: DataSource,
    private readonly registry: IntegrationRegistryService,
    private readonly context: ExternalContextService,
    private readonly legal: LegalService,
    private readonly evidence: LegalAcceptanceValidationService,
  ) {}
  private contract(s: ExternalSource): Contract {
    return {
      issuerId: s.issuer_id,
      applicationId: s.application_id,
      documentIds: s.document_ids,
    };
  }
  private async documents(
    s: ExternalSource,
    organization: string,
    roles: string[],
    m: DataSource | EntityManager = this.db,
  ) {
    const ids = s.document_ids;
    const rows: Document[] = await m.query(
      `SELECT d.id AS "documentId",v.id AS "documentVersionId",r.id AS "acceptanceRuleId",v.version,v.content_hash AS "contentHash",d.title,d.document_type AS "documentType",d.key,d.locale,r.acceptance_mode AS "acceptanceMode",r.role,
 (CASE WHEN r.organization_id IS NULL THEN 0 ELSE 1 END + CASE WHEN r.role IS NULL THEN 0 ELSE 1 END) AS specificity
 FROM documents d JOIN document_versions v ON v.document_id=d.id JOIN acceptance_rules r ON r.version_id=v.id AND r.document_id=d.id AND r.application_id=d.application_id AND r.issuer_id=d.issuer_id
 WHERE d.id=ANY($1::uuid[]) AND d.issuer_id=$2 AND d.application_id=$3 AND d.status='active' AND d.deleted_at IS NULL
 AND v.status='published' AND v.content_hash IS NOT NULL AND (v.effective_from IS NULL OR v.effective_from<=now()) AND (v.effective_until IS NULL OR v.effective_until>now())
 AND r.status='active' AND r.acceptance_mode IN ('individual','organization_representative')
 AND (r.organization_id IS NULL OR r.organization_id=$4) AND (r.role IS NULL OR r.role=ANY($5::text[]))
 AND (r.acceptance_mode<>'organization_representative' OR r.role IS NOT NULL)
 AND (r.starts_at IS NULL OR r.starts_at<=now()) AND (r.ends_at IS NULL OR r.ends_at>now()) ${m instanceof EntityManager ? 'FOR SHARE OF d,v,r' : ''}`,
      [ids, s.issuer_id, s.application_id, organization, roles],
    );
    return selectDocuments(rows, ids);
  }
  private async pinned(
    m: EntityManager,
    caller: IntegrationRequest['integrationCaller'],
    org: string,
    source: ExternalSource,
  ) {
    await m.query(
      'SELECT id FROM external_identity_sources WHERE id=$1 FOR SHARE',
      [source.id],
    );
    await m.query('SELECT id FROM systems WHERE id=$1 FOR SHARE', [
      source.system_id,
    ]);
    const fresh = await this.registry.authorize(caller, org, source.id, m);
    if (
      JSON.stringify(this.contract(fresh)) !==
        JSON.stringify(this.contract(source)) ||
      fresh.context_url !== source.context_url
    )
      throw new ConflictException('Integration changed; prepare again');
    return fresh;
  }
  async prepare(
    caller: IntegrationRequest['integrationCaller'],
    dto: PrepareExternalAcceptanceDto,
  ) {
    const source = await this.registry.authorize(caller, dto.organizationId);
    const roles = await this.context.resolve(
      source,
      dto.subjectId,
      dto.organizationId,
      'acceptance',
      dto.sessionId,
    );
    const docs = await this.documents(source, dto.organizationId, roles);
    // Signed published artifacts are obtained before opening the reservation transaction.
    const publicDocs = await Promise.all(
      docs.map((d) =>
        this.legal.getPublicDocument(
          source.application_id,
          d.key,
          d.locale,
          d.version,
        ),
      ),
    );
    if (
      publicDocs.some(
        (d, i) =>
          d.version.id !== docs[i].documentVersionId ||
          d.contentHash !== docs[i].contentHash,
      )
    )
      throw new ConflictException('LEGAL_DOCUMENTS_CHANGED');
    const request = await this.db.transaction(async (m) => {
      await this.pinned(m, caller, dto.organizationId, source);
      const current = await this.documents(
        source,
        dto.organizationId,
        roles,
        m,
      );
      if (documentFingerprint(current) !== documentFingerprint(docs))
        throw new ConflictException('LEGAL_DOCUMENTS_CHANGED');
      await m.query(
        `INSERT INTO external_acceptance_requests(source_id,client_id,subject_id,organization_id,session_id,preparation_key,documents) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(source_id,client_id,preparation_key) DO NOTHING`,
        [
          source.id,
          source.client_record_id,
          dto.subjectId,
          dto.organizationId,
          dto.sessionId,
          dto.idempotencyKey,
          JSON.stringify(docs),
        ],
      );
      const [row]: Prepared[] = await m.query(
        'SELECT * FROM external_acceptance_requests WHERE source_id=$1 AND client_id=$2 AND preparation_key=$3',
        [source.id, source.client_record_id, dto.idempotencyKey],
      );
      if (
        row.subject_id !== dto.subjectId ||
        row.organization_id !== dto.organizationId ||
        row.session_id !== dto.sessionId
      )
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      if (
        row.expires_at.getTime() <= Date.now() ||
        documentFingerprint(row.documents) !== documentFingerprint(docs)
      )
        throw new ConflictException('LEGAL_REQUEST_EXPIRED_OR_CHANGED');
      return row;
    });
    return {
      requestId: request.id,
      identitySourceId: source.id,
      productCode: source.product_code,
      expiresAt: request.expires_at.toISOString(),
      documents: docs.map((d, i) => ({
        documentId: d.documentId,
        documentVersionId: d.documentVersionId,
        contentHash: d.contentHash,
        title: d.title,
        version: d.version,
        kind: d.documentType,
        artifacts: publicDocs[i].artifacts,
      })),
    };
  }
  async accept(
    caller: IntegrationRequest['integrationCaller'],
    dto: AcceptExternalDocumentsDto,
  ) {
    const [prepared]: Prepared[] = await this.db.query(
      'SELECT * FROM external_acceptance_requests WHERE id=$1',
      [dto.requestId],
    );
    if (!prepared) throw new ForbiddenException('Unknown acceptance request');
    const source = await this.registry.authorize(
      caller,
      prepared.organization_id,
      prepared.source_id,
    );
    if (
      prepared.subject_id !== dto.subjectId ||
      prepared.organization_id !== dto.organizationId ||
      prepared.session_id !== dto.sessionId ||
      prepared.client_id !== source.client_record_id
    )
      throw new ForbiddenException();
    const roles = await this.context.resolve(
      source,
      prepared.subject_id,
      prepared.organization_id,
      'acceptance',
      prepared.session_id,
    );
    const hash = confirmationHash(dto);
    return this.db.transaction(async (m) => {
      await this.pinned(m, caller, prepared.organization_id, source);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        source.id + source.client_record_id + dto.idempotencyKey,
      ]);
      const [replay]: Prepared[] = await m.query(
        'SELECT * FROM external_acceptance_requests WHERE source_id=$1 AND client_id=$2 AND idempotency_key=$3',
        [source.id, source.client_record_id, dto.idempotencyKey],
      );
      if (replay) {
        if (replay.payload_hash !== hash)
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return replay.result;
      }
      const [row]: Prepared[] = await m.query(
        'SELECT * FROM external_acceptance_requests WHERE id=$1 FOR UPDATE',
        [dto.requestId],
      );
      if (row.result)
        throw new ConflictException('Acceptance request already consumed');
      if (row.expires_at.getTime() <= Date.now())
        throw new ConflictException('LEGAL_REQUEST_EXPIRED');
      const docs = await this.documents(source, row.organization_id, roles, m);
      if (
        documentFingerprint(docs) !== documentFingerprint(row.documents) ||
        dto.confirmations.length !== docs.length ||
        !docs.every((d) =>
          dto.confirmations.some(
            (c) =>
              c.documentVersionId === d.documentVersionId &&
              c.contentHash === d.contentHash &&
              c.accepted === true,
          ),
        )
      )
        throw new ConflictException('LEGAL_DOCUMENTS_CHANGED');
      const ids: string[] = [];
      for (const d of docs) {
        const [accepted]: { id: string }[] = await m.query(
          `INSERT INTO acceptances(issuer_id,application_id,organization_id,identity_issuer,subject_id,document_id,document_version_id,acceptance_rule_id,accepted_by_identity_issuer,accepted_by_subject_id,acceptance_mode,role_at_acceptance,authentication_method,locale,content_hash,accepted_at,metadata,external_identity_source_id,registering_client_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$4,$5,$9,$10,'external_local_mfa',$11,$12,now(),$13::jsonb,$14,$15)
 ON CONFLICT(identity_issuer,subject_id,organization_id,document_version_id,acceptance_rule_id) WHERE organization_id IS NOT NULL DO UPDATE SET identity_issuer=acceptances.identity_issuer RETURNING id`,
          [
            source.issuer_id,
            source.application_id,
            row.organization_id,
            source.identity_issuer,
            row.subject_id,
            d.documentId,
            d.documentVersionId,
            d.acceptanceRuleId,
            d.acceptanceMode,
            d.role,
            d.locale,
            d.contentHash,
            JSON.stringify({
              requestId: row.id,
              roles,
              explicitConfirmation: true,
            }),
            source.id,
            source.client_record_id,
          ],
        );
        ids.push(accepted.id);
      }
      await m.query(
        `INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,'service','legal.external_acceptance.create','external_identity_source',$6,$7::jsonb)`,
        [
          source.issuer_id,
          source.application_id,
          randomUUID(),
          caller.issuer,
          caller.clientId,
          source.id,
          JSON.stringify({
            requestId: row.id,
            subjectId: row.subject_id,
            organizationId: row.organization_id,
            acceptanceIds: ids,
          }),
        ],
      );
      const result = {
        requestId: row.id,
        legalAcceptanceId: ids[0],
        identitySourceId: source.id,
        productCode: source.product_code,
        accepted: true,
      };
      await m.query(
        'UPDATE external_acceptance_requests SET idempotency_key=$2,payload_hash=$3,result=$4::jsonb WHERE id=$1',
        [row.id, dto.idempotencyKey, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
  async validate(
    caller: IntegrationRequest['integrationCaller'],
    dto: ValidateExternalEvidenceDto,
  ) {
    const [acceptance]: { source_id: string }[] = await this.db.query(
      `SELECT external_identity_source_id AS source_id FROM acceptances
       WHERE id=$1 AND organization_id=$2 AND subject_id=$3
       AND external_identity_source_id IS NOT NULL`,
      [dto.legalAcceptanceId, dto.organizationId, dto.subjectId],
    );
    if (!acceptance)
      throw new ForbiddenException('Acceptance outside integration context');
    const source = await this.registry.authorize(
      caller,
      dto.organizationId,
      acceptance.source_id,
    );
    if (dto.productCode !== source.product_code) throw new ForbiddenException();
    const roles = await this.context.resolve(
      source,
      dto.subjectId,
      dto.organizationId,
      'checkout_validation',
    );
    return this.db.transaction(async (m) => {
      await this.pinned(m, caller, dto.organizationId, source);
      const result = await this.evidence.validate(
        {
          ...dto,
          identityIssuer: source.identity_issuer,
          issuerId: source.issuer_id,
          applicationId: source.application_id,
        },
        roles,
        { contract: this.contract(source), sourceId: source.id },
        m,
      );
      if (
        !result.valid ||
        !('evidence' in result) ||
        result.evidence[0].acceptanceId !== dto.legalAcceptanceId
      )
        return {
          contractVersion: 2,
          valid: false,
          reason: 'acceptance_not_current_or_incomplete',
        };
      const registrars: {
        acceptance_id: string;
        oauth_issuer: string;
        client_id: string;
      }[] = await m.query(
        `SELECT a.id AS acceptance_id,c.oauth_issuer,c.client_id FROM acceptances a JOIN external_identity_source_clients c ON c.id=a.registering_client_id AND c.source_id=a.external_identity_source_id WHERE a.id=ANY($1::uuid[]) AND a.external_identity_source_id=$2`,
        [result.evidence.map((e) => e.acceptanceId), source.id],
      );
      if (registrars.length !== result.evidence.length)
        return {
          contractVersion: 2,
          valid: false,
          reason: 'unverifiable_registering_clients',
        };
      const externalEvidence = result.evidence.map((e) => {
        const registrar = registrars.find(
          (c) => c.acceptance_id === e.acceptanceId,
        )!;
        return {
          ...e,
          registeringClient: {
            oauthIssuer: registrar.oauth_issuer,
            clientId: registrar.client_id,
          },
        };
      });
      const snapshot = {
        contractVersion: 2,
        identitySourceId: source.id,
        issuerId: source.issuer_id,
        applicationId: source.application_id,
        organizationId: dto.organizationId,
        identityIssuer: source.identity_issuer,
        subjectId: dto.subjectId,
        productCode: dto.productCode,
        legalAcceptanceId: dto.legalAcceptanceId,
        evidence: externalEvidence,
      };
      return {
        ...result,
        ...snapshot,
        legalSnapshotHash: createHash('sha256')
          .update(JSON.stringify(snapshot))
          .digest('hex'),
      };
    });
  }
}
