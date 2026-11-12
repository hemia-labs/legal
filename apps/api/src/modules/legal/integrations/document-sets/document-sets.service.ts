import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { LegalService } from '../../services/legal.service';
import { IntegrationRegistryService } from '../registry/integration-registry.service';
import {
  resolveVerificationService,
  type SystemService,
} from '../../systems/system-services';
import { ServiceTokenService } from '../../../auth/service-token.service';
import { postVerificationContext } from '../acceptance/verification-http';
import type { IntegrationRequest } from '../acceptance/integration-auth.guard';
import type { LegalActor } from '../../../../common/types/legal-request';
import { scopePredicate } from '../../authorization/legal-scope';
import {
  AccountCatalogDto,
  RecordEvidenceDto,
  SaveDocumentSetDto,
  EvaluateSetDto,
  ValidateSetEvidenceDto,
  EvidenceHistoryDto,
} from './document-sets.dto';

type Caller = IntegrationRequest['integrationCaller'];
type SetRow = {
  id: string;
  source_id: string;
  application_id: string;
  key: string;
  revision: string;
  name: string;
  configuration: SaveDocumentSetDto;
  effective_from: Date;
};
type Source = {
  id: string;
  client_record_id: string;
  identity_issuer: string;
  issuer_id: string;
  application_id: string;
  product_code: string;
  context_url: string;
  system_configuration?: { legalAcceptances?: { contextService?: string } };
  services: SystemService[];
  context_resource: string;
  context_audience: string;
};
type Doc = {
  documentId: string;
  documentVersionId: string;
  documentKey: string;
  title: string;
  version: string;
  contentHash: string;
  requiredAction: string;
  blocking: boolean;
  requireReacceptance: boolean;
  deadline: string | null;
};
type PendingReviewOwner = {
  clientId: string;
  subjectId: string;
  organizationId: string | null;
  sessionId: string | null;
};
type Snapshot = {
  id: string;
  set_id: string;
  source_id: string;
  application_id: string;
  set_key: string;
  set_revision: string;
  locale: string;
  configuration: SaveDocumentSetDto & {
    pendingReviewOwner?: PendingReviewOwner;
  };
  documents: Doc[];
  created_at: Date;
  expires_at: Date;
};
type Receipt = {
  id: string;
  source_id: string;
  client_id: string;
  payload_hash: string;
  subject_id: string;
  organization_id: string | null;
  snapshot_id: string;
  occurred_at: Date;
  received_at: Date;
  authentication_method: string;
  assurance: { mfaVerified: boolean; verification: string };
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const valid = (date: Date | string | null) =>
  date === null || Number.isFinite(new Date(date).getTime());

@Injectable()
export class DocumentSetsService {
  constructor(
    private readonly db: DataSource,
    private readonly legal: LegalService,
    private readonly registry: IntegrationRegistryService,
    private readonly tokens: ServiceTokenService,
  ) {}
  private async admin(
    applicationId: string,
    actor: LegalActor,
    permission: string,
  ) {
    // A consumer-organization assignment cannot edit an application-wide policy.
    if (actor.authorization?.authenticatedOrganizationId)
      throw new ForbiddenException(
        'Application-wide policy management required',
      );
    const scope = scopePredicate(
      actor.authorization,
      permission,
      'applications',
    );
    const row: { id: string } | undefined = await this.db
      .createQueryBuilder()
      .select('t.id')
      .from('applications', 't')
      .where('t.id=:id', { id: applicationId })
      .andWhere(scope.sql, scope.parameters)
      .getRawOne();
    if (!row)
      throw new ForbiddenException('Application outside permission scope');
  }
  async list(applicationId: string, actor: LegalActor) {
    await this.admin(applicationId, actor, 'legal.documents.view');
    const rows: SetRow[] = await this.db.query(
      'SELECT * FROM legal_document_sets WHERE application_id=$1 ORDER BY key',
      [applicationId],
    );
    return rows.map((r) => ({
      applicationId: r.application_id,
      key: r.key,
      name: r.name,
      revision: r.revision,
      configuration: r.configuration,
      effectiveFrom: r.effective_from,
    }));
  }
  async save(
    applicationId: string,
    key: string,
    dto: SaveDocumentSetDto,
    actor: LegalActor,
  ) {
    if (!/^[a-z][a-z0-9_-]{1,79}$/.test(key))
      throw new BadRequestException('Invalid document set key');
    await this.admin(applicationId, actor, 'legal.documents.edit');
    if (
      key === 'registration' &&
      (dto.usage || dto.evidenceScope === 'organization')
    )
      throw new BadRequestException(
        'Registration requires an individual public set',
      );
    if (
      dto.documents.some(
        (doc) =>
          doc.requiredAction === 'informational' &&
          (dto.usage !== 'account' ||
            doc.blocking ||
            doc.requireReacceptance ||
            doc.deadline),
      )
    ) {
      throw new BadRequestException(
        'Informational documents require an account set without acceptance rules',
      );
    }
    if (dto.requiresMfa && dto.verification !== 'verified_session')
      throw new BadRequestException('MFA requires a verified session policy');
    if (
      dto.evidenceScope === 'organization' &&
      (!dto.requiresOrganization || dto.verification !== 'verified_session')
    ) {
      throw new BadRequestException(
        'Organization evidence requires an organization and a verified session',
      );
    }
    const result = await this.db.transaction(async (m) => {
      // The application lock serializes first creation as well as optimistic updates.
      await m.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [
        applicationId,
      ]);
      const [source]: Source[] = await m.query(
        `SELECT s.*,sy.configuration AS system_configuration,sy.services FROM external_identity_sources s JOIN systems sy ON sy.id=s.system_id AND sy.enabled WHERE s.id=$1 AND s.application_id=$2 AND s.enabled FOR SHARE OF s,sy`,
        [dto.sourceId, applicationId],
      );
      if (!source)
        throw new BadRequestException(
          'Enabled integration for this application required',
        );
      if (dto.verification === 'verified_session') {
        const service = resolveVerificationService(
          source.services,
          source.system_configuration?.legalAcceptances?.contextService,
        );
        this.registry.contextUrl(service.url);
      }
      const ids = dto.documents.map((d) => d.documentId);
      const docs: Array<{ id: string }> = await m.query(
        `SELECT d.id FROM documents d JOIN external_identity_source_documents x ON x.document_id=d.id AND x.source_id=$2 WHERE d.id=ANY($1::uuid[]) AND d.application_id=$3 AND d.status='active' AND d.deleted_at IS NULL FOR SHARE OF d,x`,
        [ids, dto.sourceId, applicationId],
      );
      if (docs.length !== ids.length)
        throw new BadRequestException(
          'Documents must belong to this application and integration',
        );
      const [old]: SetRow[] = await m.query(
        'SELECT * FROM legal_document_sets WHERE application_id=$1 AND key=$2 FOR UPDATE',
        [applicationId, key],
      );
      if (
        (old && dto.expectedRevision !== old.revision) ||
        (!old && dto.expectedRevision)
      )
        throw new ConflictException('DOCUMENT_SET_CHANGED');
      if (
        old &&
        (old.configuration.evidenceScope ?? 'individual') !==
          (dto.evidenceScope ?? 'individual')
      ) {
        throw new ConflictException(
          'Use a new document set to change evidence scope',
        );
      }
      const configuration = { ...dto };
      delete configuration.expectedRevision;
      const [saved]: SetRow[] = await m.query(
        `INSERT INTO legal_document_sets(application_id,source_id,key,name,enabled,configuration,effective_from) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)
        ON CONFLICT(application_id,key) DO UPDATE SET source_id=EXCLUDED.source_id,revision=gen_random_uuid(),name=EXCLUDED.name,enabled=EXCLUDED.enabled,configuration=EXCLUDED.configuration,effective_from=EXCLUDED.effective_from,updated_at=now() RETURNING *`,
        [
          applicationId,
          dto.sourceId,
          key,
          dto.name,
          dto.enabled,
          JSON.stringify(configuration),
          dto.effectiveFrom,
        ],
      );
      await m.query(
        `INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6,'legal.document_set.save','legal_document_set',$7,$8::jsonb)`,
        [
          source.issuer_id,
          applicationId,
          actor.traceId,
          actor.identityIssuer,
          actor.subjectId,
          actor.actorType,
          saved.id,
          JSON.stringify({ key, revision: saved.revision }),
        ],
      );
      return saved;
    });
    return { key: result.key, revision: result.revision, applicationId };
  }
  private async set(
    applicationId: string,
    key: string,
    m: DataSource | EntityManager = this.db,
    lock = false,
  ) {
    const [set]: SetRow[] = await m.query(
      `SELECT ds.* FROM legal_document_sets ds JOIN external_identity_sources s ON s.id=ds.source_id AND s.application_id=ds.application_id AND s.enabled
      JOIN systems sy ON sy.id=s.system_id AND sy.enabled
      JOIN applications a ON a.id=ds.application_id AND a.status='active' AND a.deleted_at IS NULL
      JOIN issuers i ON i.id=a.issuer_id AND i.status='active' AND i.deleted_at IS NULL
      WHERE ds.application_id=$1 AND ds.key=$2 AND ds.enabled AND ds.effective_from<=now()${lock ? ' FOR SHARE OF ds,s,sy,a,i' : ''}`,
      [applicationId, key],
    );
    if (!set) throw new NotFoundException('Published document set not found');
    return set;
  }
  private async source(
    caller: Caller,
    sourceId: string,
    organizationId?: string,
    m: DataSource | EntityManager = this.db,
    lock = false,
  ) {
    const [s]: Source[] = await m.query(
      `SELECT s.*,c.id AS client_record_id,sy.configuration->'legalAcceptances'->>'identityIssuer' AS identity_issuer,sy.configuration->'legalAcceptances'->>'productCode' AS product_code,
      svc.value->>'url' AS context_url,svc.value->>'resource' AS context_resource,svc.value->>'audience' AS context_audience
      FROM external_identity_sources s JOIN systems sy ON sy.id=s.system_id AND sy.enabled
      JOIN external_identity_source_clients c ON c.source_id=s.id AND c.enabled AND c.oauth_issuer=$2 AND c.client_id=$3 AND $4=ANY(c.roles)
      JOIN applications a ON a.id=s.application_id AND a.issuer_id=s.issuer_id AND a.status='active' AND a.deleted_at IS NULL
      JOIN issuers i ON i.id=s.issuer_id AND i.status='active' AND i.deleted_at IS NULL
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(sy.services) WHERE value->>'code'=sy.configuration->'legalAcceptances'->>'contextService' AND value->>'enabled'='true' LIMIT 1) svc ON true
      WHERE s.id=$1 AND s.enabled AND sy.configuration ? 'legalAcceptances'
      AND (NOT EXISTS(SELECT 1 FROM external_identity_source_organizations o WHERE o.source_id=s.id)
        OR EXISTS(SELECT 1 FROM external_identity_source_organizations o WHERE o.source_id=s.id AND o.organization_id::text=$5 AND o.enabled))${lock ? ' FOR SHARE OF s,sy,c,a,i' : ''}`,
      [
        sourceId,
        caller.issuer,
        caller.clientId,
        caller.role,
        organizationId ?? null,
      ],
    );
    if (!s?.identity_issuer || !s.product_code)
      throw new ForbiddenException('Integration outside client policy');
    return s;
  }
  private async documents(set: SetRow, locale: string): Promise<Doc[]> {
    const docs: Doc[] = [];
    for (const item of set.configuration.documents) {
      const [v]: Array<{ key: string; version: string }> = await this.db.query(
        `SELECT d.key,v.version FROM documents d JOIN document_versions v ON v.document_id=d.id
        JOIN external_identity_source_documents x ON x.document_id=d.id AND x.source_id=$3
        WHERE d.id=$1 AND d.application_id=$2 AND d.locale=$4 AND d.status='active' AND d.deleted_at IS NULL
          AND v.status='published' AND v.content_hash IS NOT NULL AND (v.effective_from IS NULL OR v.effective_from<=now()) AND (v.effective_until IS NULL OR v.effective_until>now())
        ORDER BY v.effective_from DESC NULLS LAST,v.created_at DESC LIMIT 1`,
        [item.documentId, set.application_id, set.source_id, locale],
      );
      if (!v && set.configuration.usage === 'account') continue;
      if (!v)
        throw new NotFoundException(
          'Document set has no current publication for this locale',
        );
      const published = await this.legal.getPublicDocument(
        set.application_id,
        v.key,
        locale,
        v.version,
      );
      if (
        !valid(published.version.effectiveFrom) ||
        !valid(published.version.effectiveUntil) ||
        !published.contentHash
      )
        throw new ConflictException('Invalid publication');
      docs.push({
        documentId: item.documentId,
        documentVersionId: published.version.id,
        documentKey: v.key,
        title: published.document.title,
        version: v.version,
        contentHash: published.contentHash,
        requiredAction: item.requiredAction,
        blocking: item.blocking,
        requireReacceptance: item.requireReacceptance,
        deadline: item.deadline ?? null,
      });
    }
    return docs;
  }
  async published(applicationId: string, key: string, locale: string) {
    const set = await this.set(applicationId, key);
    if (
      set.configuration.evidenceScope === 'organization' ||
      set.configuration.usage === 'account'
    )
      throw new NotFoundException('Public document set not found');
    return this.prepareSnapshot(set, locale, await this.documents(set, locale));
  }
  async accountCatalog(caller: Caller, dto: AccountCatalogDto) {
    if (caller.role !== 'collector') throw new ForbiddenException();
    const rows: Array<{ key: string }> = await this.db.query(
      `SELECT key FROM legal_document_sets WHERE application_id=$1 AND enabled AND effective_from<=now() AND configuration->>'usage'='account' ORDER BY key`,
      [dto.applicationId],
    );
    const sets: Array<{
      documentSetKey: string;
      name: string;
      revision: string;
      evidenceScope: NonNullable<SaveDocumentSetDto['evidenceScope']>;
      verification: SaveDocumentSetDto['verification'];
      documents: Doc[];
    }> = [];
    for (const { key } of rows) {
      let set: SetRow;
      try {
        set = await this.set(dto.applicationId, key);
        await this.source(caller, set.source_id, dto.organizationId);
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        )
          continue;
        throw error;
      }
      if (
        set.configuration.usage !== 'account' ||
        (set.configuration.requiresOrganization && !dto.organizationId)
      )
        continue;
      sets.push({
        documentSetKey: key,
        name: set.name,
        revision: set.revision,
        evidenceScope: set.configuration.evidenceScope ?? 'individual',
        verification: set.configuration.verification,
        documents: await this.documents(set, dto.locale),
      });
    }
    return { sets };
  }
  async preparePending(caller: Caller, dto: EvaluateSetDto) {
    if (caller.role !== 'collector') throw new ForbiddenException();
    const set = await this.set(dto.applicationId, dto.documentSetKey);
    const source = await this.source(caller, set.source_id, dto.organizationId);
    if (set.configuration.evidenceScope === 'organization' && !dto.sessionId)
      throw new ForbiddenException('Verified session required by document set');
    const pending = await this.evaluatePending(set, source, dto);
    const documents =
      set.configuration.usage === 'account'
        ? pending.documents.slice(0, 10)
        : pending.documents;
    if (!documents.length) {
      return { documentSetKey: set.key, revision: set.revision, documents: [] };
    }
    return this.prepareSnapshot(set, dto.locale, documents, {
      clientId: source.client_record_id,
      subjectId: dto.subjectId,
      organizationId: dto.organizationId ?? null,
      sessionId: dto.sessionId ?? null,
    });
  }
  private async prepareSnapshot(
    set: SetRow,
    locale: string,
    documents: Doc[],
    pendingReviewOwner?: PendingReviewOwner,
  ) {
    const { application_id: applicationId, key } = set;
    const fingerprint = hash({
      revision: set.revision,
      locale,
      documents,
      pendingReviewOwner,
    });
    const snapshot = await this.db.transaction(async (m) => {
      const current = await this.set(applicationId, key, m, true);
      if (current.revision !== set.revision)
        throw new ConflictException('DOCUMENT_SET_CHANGED');
      // Reuse identical snapshots within their validity window.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        set.id + fingerprint,
      ]);
      const [existing]: Snapshot[] = await m.query(
        'SELECT * FROM legal_document_set_snapshots WHERE set_id=$1 AND fingerprint=$2 AND expires_at>now() ORDER BY created_at DESC LIMIT 1',
        [set.id, fingerprint],
      );
      if (existing) return existing;
      const [created]: Snapshot[] = await m.query(
        `INSERT INTO legal_document_set_snapshots(set_id,source_id,application_id,set_key,set_revision,locale,fingerprint,configuration,documents) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`,
        [
          set.id,
          set.source_id,
          applicationId,
          key,
          set.revision,
          locale,
          fingerprint,
          JSON.stringify({ ...set.configuration, pendingReviewOwner }),
          JSON.stringify(documents),
        ],
      );
      return created;
    });
    const publicDocs: Array<
      Doc & {
        artifacts: Awaited<
          ReturnType<LegalService['getPublicDocument']>
        >['artifacts'];
      }
    > = [];
    for (const d of snapshot.documents) {
      const publication = await this.legal.getPublicDocument(
        applicationId,
        d.documentKey,
        locale,
        d.version,
      );
      publicDocs.push({ ...d, artifacts: publication.artifacts });
    }
    return {
      applicationId,
      documentSetKey: key,
      revision: set.revision,
      snapshotToken: snapshot.id,
      expiresAt: snapshot.expires_at.toISOString(),
      documents: publicDocs,
    };
  }
  private async assurance(
    source: Source,
    configuration: SaveDocumentSetDto,
    input: { subjectId: string; organizationId?: string; sessionId?: string },
    operation: string,
    key: string,
  ) {
    if (configuration.requiresOrganization && !input.organizationId)
      throw new ForbiddenException('Organization required by document set');
    if (configuration.verification === 'collector_attested')
      return {
        authenticationMethod: 'collector_attested',
        mfaVerified: false,
        verification: 'collector_attested',
      };
    if (operation === 'record' && !input.sessionId)
      throw new ForbiddenException('Verified session required by document set');
    const url = this.registry.contextUrl(source.context_url);
    if (!source.context_audience || source.context_resource !== url.origin)
      throw new ForbiddenException('Verification service not configured');
    let data: Record<string, unknown>;
    try {
      const token = await this.tokens.get(
        source.context_resource,
        ['legal.consumer_context.read'],
        source.context_audience,
      );
      data = (await postVerificationContext(
        url,
        this.registry.production,
        token,
        JSON.stringify({
          ...input,
          purpose: 'document_acceptance',
          operation,
          documentSetKey: key,
        }),
      )) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException(
        'Consumer verification unavailable',
      );
    }
    if (
      data.subjectId !== input.subjectId ||
      (data.organizationId ?? null) !== (input.organizationId ?? null) ||
      data.sessionId !== input.sessionId ||
      data.canAcceptDocuments !== true ||
      typeof data.authenticationMethod !== 'string' ||
      !data.authenticationMethod.trim() ||
      data.authenticationMethod.length > 80 ||
      typeof data.mfaVerified !== 'boolean'
    )
      throw new ForbiddenException('Invalid acceptance context');
    if (
      operation === 'record' &&
      configuration.requiresMfa &&
      !data.mfaVerified
    )
      throw new ForbiddenException('MFA required by document set');
    return {
      authenticationMethod: data.authenticationMethod,
      mfaVerified: data.mfaVerified,
      verification: 'verified_session',
    };
  }
  async record(caller: Caller, dto: RecordEvidenceDto) {
    if (caller.role !== 'collector') throw new ForbiddenException();
    const [snapshot]: Snapshot[] = await this.db.query(
      'SELECT * FROM legal_document_set_snapshots WHERE id=$1',
      [dto.snapshotToken],
    );
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    const source = await this.source(
      caller,
      snapshot.source_id,
      dto.organizationId,
    );
    const owner = snapshot.configuration.pendingReviewOwner;
    if (snapshot.configuration.evidenceScope === 'organization' && !owner)
      throw new ForbiddenException('Organization review context required');
    if (
      owner &&
      (owner.clientId !== source.client_record_id ||
        owner.subjectId !== dto.subjectId ||
        owner.organizationId !== (dto.organizationId ?? null) ||
        owner.sessionId !== (dto.sessionId ?? null))
    ) {
      throw new ForbiddenException('Snapshot outside review context');
    }
    // Canonical fields make a replay independent of JSON property order.
    const confirmations = dto.confirmations
      .map((c) => ({
        documentVersionId: c.documentVersionId.toLowerCase(),
        contentHash: c.contentHash,
        action: c.action,
        confirmed: c.confirmed,
      }))
      .sort((a, b) => a.documentVersionId.localeCompare(b.documentVersionId));
    const payloadHash = hash({
      snapshotToken: snapshot.id,
      subjectId: dto.subjectId,
      organizationId: dto.organizationId ?? null,
      sessionId: dto.sessionId ?? null,
      occurredAt: new Date(dto.occurredAt).toISOString(),
      confirmations,
    });
    const replay = async (m: DataSource | EntityManager) => {
      const [row]: Receipt[] = await m.query(
        'SELECT * FROM legal_evidence_receipts WHERE source_id=$1 AND client_id=$2 AND idempotency_key=$3',
        [source.id, source.client_record_id, dto.idempotencyKey],
      );
      if (row && row.payload_hash !== payloadHash)
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return row;
    };
    const previous = await replay(this.db);
    if (previous) return this.receipt(previous);
    const occurred = new Date(dto.occurredAt);
    if (
      !Number.isFinite(occurred.getTime()) ||
      occurred < snapshot.created_at ||
      occurred >= snapshot.expires_at ||
      occurred.getTime() > Date.now() + 30000
    )
      throw new ConflictException('EVIDENCE_OUTSIDE_SNAPSHOT_WINDOW');
    if (
      confirmations.length !== snapshot.documents.length ||
      !snapshot.documents.every((d) =>
        confirmations.some(
          (c) =>
            c.documentVersionId === d.documentVersionId &&
            c.contentHash === d.contentHash &&
            c.action === d.requiredAction &&
            c.confirmed === true,
        ),
      )
    )
      throw new ConflictException('DOCUMENT_CONFIRMATIONS_MISMATCH');
    const assurance = await this.assurance(
      source,
      snapshot.configuration,
      dto,
      'record',
      snapshot.set_key,
    );
    return this.db.transaction(async (m) => {
      await this.source(
        caller,
        snapshot.source_id,
        dto.organizationId,
        m,
        true,
      );
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        source.id + source.client_record_id + dto.idempotencyKey,
      ]);
      const existing = await replay(m);
      if (existing) return this.receipt(existing);
      const [row]: Receipt[] = await m.query(
        `INSERT INTO legal_evidence_receipts(snapshot_id,source_id,client_id,idempotency_key,payload_hash,identity_issuer,subject_id,organization_id,session_id,authentication_method,assurance,occurred_at,confirmations) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb) RETURNING *`,
        [
          snapshot.id,
          source.id,
          source.client_record_id,
          dto.idempotencyKey,
          payloadHash,
          source.identity_issuer,
          dto.subjectId,
          dto.organizationId ?? null,
          dto.sessionId ?? null,
          assurance.authenticationMethod,
          JSON.stringify(assurance),
          occurred,
          JSON.stringify(confirmations),
        ],
      );
      await m.query(
        `INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,'service','legal.evidence.record','legal_evidence_receipt',$6,$7::jsonb)`,
        [
          source.issuer_id,
          snapshot.application_id,
          randomUUID(),
          caller.issuer,
          caller.clientId,
          row.id,
          JSON.stringify({
            snapshotId: snapshot.id,
            subjectId: dto.subjectId,
            documentSetKey: snapshot.set_key,
          }),
        ],
      );
      return this.receipt(row);
    });
  }
  private receipt(row: Receipt) {
    return {
      evidenceId: row.id,
      snapshotToken: row.snapshot_id,
      recorded: true,
      occurredAt: row.occurred_at.toISOString(),
      receivedAt: row.received_at.toISOString(),
      authenticationMethod: row.authentication_method,
    };
  }
  async pending(caller: Caller, dto: EvaluateSetDto, evidenceId?: string) {
    const set = await this.set(dto.applicationId, dto.documentSetKey);
    const source = await this.source(caller, set.source_id, dto.organizationId);
    const { documents, acceptedDocumentIds } = await this.evaluatePending(
      set,
      source,
      dto,
      evidenceId,
    );
    return {
      documentSetKey: set.key,
      revision: set.revision,
      pendingDocuments: documents.map((doc) => ({
        ...doc,
        reason: acceptedDocumentIds.has(doc.documentId)
          ? 'new_version'
          : 'new_document',
      })),
      allowed: !documents.some(
        (d) =>
          d.blocking && (!d.deadline || new Date(d.deadline) <= new Date()),
      ),
    };
  }
  private async evaluatePending(
    set: SetRow,
    source: Source,
    dto: EvaluateSetDto,
    evidenceId?: string,
  ) {
    if (set.configuration.requiresOrganization && !dto.organizationId)
      throw new ForbiddenException('Organization required');
    const docs = (await this.documents(set, dto.locale)).filter(
      (doc) => doc.requiredAction !== 'informational',
    );
    const rows: Array<{ documents: Doc[]; assurance: Receipt['assurance'] }> =
      await this.db.query(
        `SELECT s.documents,r.assurance FROM legal_evidence_receipts r JOIN legal_document_set_snapshots s ON s.id=r.snapshot_id WHERE r.source_id=$1 AND (r.subject_id=$2 OR $7::boolean) AND r.organization_id IS NOT DISTINCT FROM $3 AND s.set_id=$4 AND s.locale=$5 AND ($6::uuid IS NULL OR r.id=$6)`,
        [
          source.id,
          dto.subjectId,
          dto.organizationId ?? null,
          set.id,
          dto.locale,
          evidenceId ?? null,
          set.configuration.evidenceScope === 'organization',
        ],
      );
    const accepted = rows
      .filter(
        (r) =>
          (set.configuration.verification !== 'verified_session' ||
            r.assurance.verification === 'verified_session') &&
          (!set.configuration.requiresMfa || r.assurance.mfaVerified),
      )
      .flatMap((r) => r.documents);
    return {
      acceptedDocumentIds: new Set(accepted.map((a) => a.documentId)),
      documents: docs.filter(
        (d) =>
          !accepted.some(
            (a) =>
              a.documentId === d.documentId &&
              a.requiredAction === d.requiredAction &&
              (!d.requireReacceptance ||
                (a.documentVersionId === d.documentVersionId &&
                  a.contentHash === d.contentHash)),
          ),
      ),
    };
  }
  async history(caller: Caller, dto: EvidenceHistoryDto) {
    const set = await this.set(dto.applicationId, dto.documentSetKey);
    const source = await this.source(caller, set.source_id, dto.organizationId);
    const organizationScope =
      set.configuration.evidenceScope === 'organization';
    if (organizationScope && !dto.organizationId)
      throw new ForbiddenException('Organization required');
    const parameters = [
      source.id,
      dto.subjectId,
      dto.organizationId ?? null,
      set.id,
      dto.locale,
      organizationScope,
    ];
    let cursor: Receipt | undefined;
    if (dto.cursor) {
      [cursor] = await this.db.query(
        `SELECT r.* FROM legal_evidence_receipts r JOIN legal_document_set_snapshots s ON s.id=r.snapshot_id WHERE r.source_id=$1 AND (r.subject_id=$2 OR $6::boolean) AND r.organization_id IS NOT DISTINCT FROM $3 AND s.set_id=$4 AND s.locale=$5 AND r.id=$7`,
        [...parameters, dto.cursor],
      );
      if (!cursor) throw new BadRequestException('Invalid evidence cursor');
    }
    const rows: Array<Receipt & { documents: Doc[]; confirmations: unknown }> =
      await this.db.query(
        `SELECT r.*,s.documents FROM legal_evidence_receipts r JOIN legal_document_set_snapshots s ON s.id=r.snapshot_id WHERE r.source_id=$1 AND (r.subject_id=$2 OR $6::boolean) AND r.organization_id IS NOT DISTINCT FROM $3 AND s.set_id=$4 AND s.locale=$5 AND ($7::timestamptz IS NULL OR (r.received_at,r.id)<($7::timestamptz,$8::uuid)) ORDER BY r.received_at DESC,r.id DESC LIMIT 101`,
        [...parameters, cursor?.received_at ?? null, cursor?.id ?? null],
      );
    return {
      items: rows.slice(0, 100).map((r) => ({
        ...this.receipt(r),
        ...(organizationScope ? { signerSubjectId: r.subject_id } : {}),
        documents: r.documents,
        confirmations: r.confirmations,
      })),
      nextCursor: rows.length > 100 ? rows[99].id : null,
    };
  }
  async validate(caller: Caller, dto: ValidateSetEvidenceDto) {
    if (caller.role !== 'validator') throw new ForbiddenException();
    const set = await this.set(dto.applicationId, dto.documentSetKey),
      source = await this.source(caller, set.source_id, dto.organizationId);
    const [row]: Receipt[] = await this.db.query(
      `SELECT r.* FROM legal_evidence_receipts r JOIN legal_document_set_snapshots s ON s.id=r.snapshot_id WHERE r.id=$1 AND r.source_id=$2 AND r.subject_id=$3 AND r.organization_id IS NOT DISTINCT FROM $4 AND s.set_id=$5 AND s.locale=$6`,
      [
        dto.evidenceId,
        source.id,
        dto.subjectId,
        dto.organizationId ?? null,
        set.id,
        dto.locale,
      ],
    );
    if (!row)
      throw new ForbiddenException('Evidence does not match consumer context');
    if (set.configuration.requiresMfa && !row.assurance.mfaVerified)
      throw new ForbiddenException('Evidence assurance insufficient');
    if (
      set.configuration.verification === 'verified_session' &&
      row.assurance.verification !== 'verified_session'
    )
      throw new ForbiddenException('Verified evidence required');
    await this.assurance(source, set.configuration, dto, 'validate', set.key);
    const pending = await this.pending(caller, dto, dto.evidenceId);
    return {
      ...this.receipt(row),
      applicationId: dto.applicationId,
      documentSetKey: set.key,
      productCode: source.product_code,
      subjectId: dto.subjectId,
      organizationId: dto.organizationId ?? null,
      valid: pending.pendingDocuments.length === 0,
      pendingDocuments: pending.pendingDocuments,
    };
  }
}
