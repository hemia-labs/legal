import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import type { LegalRequest } from '../../../../common/types/legal-request';
import {
  LegalAuthorization,
  grantsFor,
  consumerOrganizationsAllowed,
} from '../../authorization/legal-authorization';
import {
  serviceUrl,
  resolveVerificationService,
} from '../../systems/system-services';
import { SystemsService } from '../../systems/systems.service';
import { legalAcceptanceConfiguration } from '../../systems/capability-schema';
import { SaveIntegrationDto } from '../integration.dto';
import { LEGAL_DOCUMENT_TYPES } from '../../constants/document-types';
import type { IntegrationRequest } from '../acceptance/integration-auth.guard';
const publicDocumentTypes = LEGAL_DOCUMENT_TYPES.filter(
  (type) => type.workflow === 'public',
).map((type) => type.code);
// Organization and role eligibility are checked against the actual user at runtime.
const acceptableDocumentSql = `EXISTS (
 SELECT 1 FROM document_versions v
 JOIN acceptance_rules r ON r.version_id=v.id AND r.document_id=d.id
  AND r.application_id=d.application_id AND r.issuer_id=d.issuer_id
 JOIN publications p ON p.document_version_id=v.id AND p.status='published'
 JOIN publication_assets asset ON asset.publication_id=p.id AND asset.kind='html'
 WHERE v.document_id=d.id AND v.status='published' AND v.content_hash IS NOT NULL
 AND (v.effective_from IS NULL OR v.effective_from<=now())
 AND (v.effective_until IS NULL OR v.effective_until>now())
 AND r.status='active' AND r.acceptance_mode IN ('individual','organization_representative')
 AND (r.acceptance_mode<>'organization_representative' OR r.role IS NOT NULL)
 AND (r.starts_at IS NULL OR r.starts_at<=now()) AND (r.ends_at IS NULL OR r.ends_at>now())
)`;
export type ExternalSource = {
  id: string;
  code: string;
  name: string;
  identity_issuer: string;
  issuer_id: string;
  application_id: string;
  product_code: string;
  context_url: string;
  context_audience: string;
  context_resource: string;
  enabled: boolean;
  document_ids: string[];
  client_record_id: string;
  system_id: string;
  system_enabled?: boolean;
};
@Injectable()
export class IntegrationRegistryService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly systems: SystemsService,
  ) {}
  get production() {
    return this.config.get<boolean>('legalIntegrations.production', true);
  }
  contextUrl(value: string) {
    return serviceUrl(this.config, value);
  }
  async authorize(
    caller: IntegrationRequest['integrationCaller'],
    organizationId: string,
    sourceId?: string,
    manager: DataSource | EntityManager = this.db,
  ): Promise<ExternalSource> {
    const rows: ExternalSource[] = await manager.query(
      `SELECT s.*,sy.enabled AS system_enabled,sy.configuration->'legalAcceptances'->>'identityIssuer' AS identity_issuer,sy.configuration->'legalAcceptances'->>'productCode' AS product_code,(SELECT service->>'url' FROM jsonb_array_elements(sy.services) service WHERE service->>'code'=sy.configuration->'legalAcceptances'->>'contextService' AND service->>'enabled'='true' AND length(service->>'audience')>0) AS context_url,(SELECT service->>'audience' FROM jsonb_array_elements(sy.services) service WHERE service->>'code'=sy.configuration->'legalAcceptances'->>'contextService') AS context_audience,(SELECT service->>'resource' FROM jsonb_array_elements(sy.services) service WHERE service->>'code'=sy.configuration->'legalAcceptances'->>'contextService') AS context_resource, ARRAY(SELECT document_id FROM external_identity_source_documents sd WHERE sd.source_id=s.id ORDER BY position) AS document_ids,c.id AS client_record_id FROM external_identity_sources s
 JOIN systems sy ON sy.id=s.system_id AND sy.enabled AND sy.configuration ? 'legalAcceptances'
 JOIN external_identity_source_clients c ON c.source_id=s.id AND c.enabled AND c.oauth_issuer=$1 AND c.client_id=$2 AND  $3=ANY(c.roles)
 JOIN applications a ON a.id=s.application_id AND a.issuer_id=s.issuer_id AND a.status='active' AND a.deleted_at IS NULL
 JOIN issuers i ON i.id=s.issuer_id AND i.status='active' AND i.deleted_at IS NULL
 WHERE s.enabled AND ($5::uuid IS NULL OR s.id=$5)
 AND (NOT EXISTS (SELECT 1 FROM external_identity_source_organizations configured WHERE configured.source_id=s.id)
 OR EXISTS (SELECT 1 FROM external_identity_source_organizations permitted WHERE permitted.source_id=s.id AND permitted.organization_id=$4 AND permitted.enabled))`,
      [
        caller.issuer,
        caller.clientId,
        caller.role,
        organizationId,
        sourceId ?? null,
      ],
    );
    if (
      rows.length !== 1 ||
      !rows[0].document_ids.length ||
      !rows[0].context_url
    )
      throw new ForbiddenException('Integration target outside client policy');
    this.contextUrl(rows[0].context_url);
    return rows[0];
  }
  private allowed(req: LegalRequest, permission: string, row: ExternalSource) {
    return grantsFor(req.actor?.authorization, permission).some(
      (g) =>
        g.resource_scope.type === 'legal_global' ||
        (g.resource_scope.type === 'issuers' &&
          g.resource_scope.ids.includes(row.issuer_id)) ||
        (g.resource_scope.type === 'applications' &&
          g.resource_scope.ids.includes(row.application_id)),
    );
  }
  private async consumerAllowed(
    req: LegalRequest,
    row: ExternalSource,
    manager: DataSource | EntityManager = this.db,
    lock = false,
  ) {
    if (!req.actor?.authorization?.authenticatedOrganizationId) return true;
    const organizations = await manager.query<
      Array<{ organization_id: string }>
    >(
      `SELECT organization_id FROM external_identity_source_organizations WHERE source_id=$1${lock ? ' FOR SHARE' : ''}`,
      [row.id],
    );
    return consumerOrganizationsAllowed(
      req.actor.authorization,
      organizations.map((organization) => organization.organization_id),
    );
  }

  async list(req: LegalRequest) {
    if (!grantsFor(req.actor?.authorization, 'legal.integrations.view').length)
      throw new ForbiddenException();
    const rows: ExternalSource[] = await this.db.query(
      `SELECT s.*,sy.enabled AS system_enabled,sy.configuration->'legalAcceptances'->>'identityIssuer' AS identity_issuer,sy.configuration->'legalAcceptances'->>'productCode' AS product_code,(SELECT service->>'url' FROM jsonb_array_elements(sy.services) service WHERE service->>'code'=sy.configuration->'legalAcceptances'->>'contextService' AND service->>'enabled'='true') AS context_url FROM external_identity_sources s JOIN systems sy ON sy.id=s.system_id ORDER BY s.name,s.id`,
    );
    const visible = await Promise.all(
      rows
        .filter((row) => this.allowed(req, 'legal.integrations.view', row))
        .map(async (row) =>
          (await this.consumerAllowed(req, row))
            ? this.project(row, this.db, req.actor.authorization)
            : null,
        ),
    );
    return visible.filter((row) => row !== null);
  }
  private async project(
    row: ExternalSource,
    manager: DataSource | EntityManager = this.db,
    authorization?: LegalAuthorization,
  ) {
    const clients: Record<string, unknown>[] = await manager.query(
      'SELECT oauth_issuer AS "oauthIssuer",client_id AS "clientId",roles,enabled FROM external_identity_source_clients WHERE source_id=$1 ORDER BY oauth_issuer,client_id',
      [row.id],
    );
    const organizations: Record<string, unknown>[] = await manager.query(
      'SELECT organization_id AS "organizationId",enabled FROM external_identity_source_organizations WHERE source_id=$1 ORDER BY organization_id',
      [row.id],
    );
    if (
      !consumerOrganizationsAllowed(
        authorization,
        organizations.map((organization) =>
          String(organization.organizationId),
        ),
      )
    )
      throw new ForbiddenException('Integration outside consumer scope');
    const documents: { document_id: string }[] = await manager.query(
      'SELECT document_id FROM external_identity_source_documents WHERE source_id=$1 ORDER BY position',
      [row.id],
    );
    return {
      id: row.id,
      systemId: row.system_id,
      code: row.code,
      name: row.name,
      identityIssuer: row.identity_issuer,
      issuerId: row.issuer_id,
      applicationId: row.application_id,
      productCode: row.product_code,
      contextUrl: row.context_url,
      enabled: row.enabled && row.system_enabled !== false,
      documentIds: documents.map((d) => d.document_id),
      clients,
      organizations,
    };
  }
  async catalogOptions(req: LegalRequest) {
    this.assertCatalogActor(req, 'legal.systems.read');
    const [applications, documents, integrations] = await Promise.all([
      this.db.query<
        { id: string; name: string; issuerId: string; issuerName: string }[]
      >(
        `SELECT a.id,a.name,a.issuer_id AS "issuerId",i.name AS "issuerName" FROM applications a JOIN issuers i ON i.id=a.issuer_id WHERE a.status='active' AND a.deleted_at IS NULL AND i.status='active' AND i.deleted_at IS NULL ORDER BY a.name,a.id`,
      ),
      this.db.query<{ id: string; name: string; applicationId: string }[]>(
        `SELECT d.id,d.title AS name,d.application_id AS "applicationId" FROM documents d JOIN applications a ON a.id=d.application_id JOIN issuers i ON i.id=a.issuer_id WHERE d.status='active' AND d.deleted_at IS NULL AND a.status='active' AND a.deleted_at IS NULL AND i.status='active' AND i.deleted_at IS NULL AND d.document_type=ANY($1::text[]) AND ${acceptableDocumentSql} ORDER BY d.title,d.id`,
        [publicDocumentTypes],
      ),
      this.db.query<
        {
          id: string;
          systemId: string;
          applicationId: string;
          enabled: boolean;
          documentIds: string[];
        }[]
      >(
        `SELECT s.id,s.system_id AS "systemId",s.application_id AS "applicationId",s.enabled,ARRAY(SELECT document_id FROM external_identity_source_documents d WHERE d.source_id=s.id ORDER BY position) AS "documentIds" FROM external_identity_sources s ORDER BY s.name,s.id`,
      ),
    ]);
    return { applications, documents, integrations };
  }
  private assertCatalogActor(req: LegalRequest, permission: string) {
    if (!req.actor?.permissions.includes(permission))
      throw new ForbiddenException('Verified Console catalog actor required');
  }
  saveFromCatalog(req: LegalRequest, dto: SaveIntegrationDto) {
    this.assertCatalogActor(req, 'legal.systems.write');
    return this.persist(req, dto, undefined, true);
  }
  save(req: LegalRequest, dto: SaveIntegrationDto, id?: string) {
    return this.persist(req, dto, id, false);
  }
  private async persist(
    req: LegalRequest,
    dto: SaveIntegrationDto,
    id: string | undefined,
    catalog: boolean,
  ) {
    return this.db.transaction(async (m) => {
      await m.query('SELECT id FROM systems WHERE id=$1 FOR UPDATE', [
        dto.systemId,
      ]);
      if (catalog) {
        const [existing]: { id: string }[] = await m.query(
          'SELECT id FROM external_identity_sources WHERE system_id=$1',
          [dto.systemId],
        );
        id = existing?.id;
      }
      const system = await this.systems.get(dto.systemId, m);
      if (!system.enabled)
        throw new BadRequestException('El sistema está deshabilitado.');
      const legalSettings = system.configuration.legalAcceptances as
        Record<string, unknown> | undefined;
      resolveVerificationService(
        system.services,
        legalSettings?.contextService,
      );
      const settings = legalAcceptanceConfiguration(
        system.configuration.legalAcceptances,
        system.services,
      );
      this.contextUrl(settings.contextUrl);
      const clients = (await this.systems.clients(system.id, m)).filter(
        (c) =>
          c.capabilityCode === 'legalAcceptances' &&
          c.roles.some((role) => ['collector', 'validator'].includes(role)),
      );
      if (!clients.some((c) => c.enabled && c.roles.includes('collector')))
        throw new BadRequestException(
          'Configura un cliente que registre aceptaciones en Console.',
        );
      const [application]: { id: string; issuer_id: string; name: string }[] =
        await m.query(
          "SELECT a.id,a.issuer_id,a.name FROM applications a JOIN issuers i ON i.id=a.issuer_id WHERE a.id=$1 AND a.status='active' AND a.deleted_at IS NULL AND i.status='active' AND i.deleted_at IS NULL",
          [dto.applicationId],
        );
      if (!application)
        throw new BadRequestException('Aplicación legal no disponible.');
      const [old]: ExternalSource[] = id
        ? await m.query(
            'SELECT * FROM external_identity_sources WHERE id=$1 FOR UPDATE',
            [id],
          )
        : [];
      if (id && !old)
        throw new ForbiddenException('Integration outside operator scope');
      if (old && !(await this.consumerAllowed(req, old, m, true)))
        throw new ForbiddenException('Integration outside consumer scope');
      const permission = id
        ? 'legal.integrations.edit'
        : 'legal.integrations.create';
      const target = {
        issuer_id: application.issuer_id,
        application_id: application.id,
      } as ExternalSource;
      if (
        !catalog &&
        (!this.allowed(req, permission, target) ||
          (old && !this.allowed(req, permission, old)))
      )
        throw new ForbiddenException('Integration outside operator scope');
      if (old && old.system_id !== dto.systemId)
        throw new ConflictException(
          'El sistema de una integración existente es fijo.',
        );
      const enabled = dto.enabled ?? old?.enabled ?? true;
      if (
        old?.enabled &&
        !enabled &&
        !catalog &&
        !this.allowed(req, 'legal.integrations.disable', old)
      )
        throw new ForbiddenException();
      const docs: unknown[] = await m.query(
        `SELECT d.id FROM documents d WHERE d.id=ANY($1::uuid[]) AND d.application_id=$2 AND d.issuer_id=$3 AND d.deleted_at IS NULL AND d.status='active'`,
        [dto.documentIds, application.id, application.issuer_id],
      );
      if (
        docs.length !== dto.documentIds.length ||
        new Set(dto.documentIds).size !== dto.documentIds.length
      )
        throw new BadRequestException(
          'Documents outside integration application',
        );
      if (catalog && enabled) {
        const ready: { id: string }[] = await m.query(
          `SELECT d.id FROM documents d WHERE d.id=ANY($1::uuid[])
           AND d.document_type=ANY($2::text[]) AND ${acceptableDocumentSql}`,
          [dto.documentIds, publicDocumentTypes],
        );
        if (ready.length !== dto.documentIds.length)
          throw new BadRequestException(
            'Selecciona documentos públicos publicados con HTML y una regla de aceptación vigente.',
          );
      }
      const before = old
        ? await this.project(old, m, req.actor.authorization)
        : null;
      let saved: ExternalSource;
      try {
        [saved] = old
          ? await m.query(
              'WITH updated AS (UPDATE external_identity_sources SET issuer_id=$1,application_id=$2,enabled=$3,updated_at=now() WHERE id=$4 RETURNING *) SELECT * FROM updated',
              [application.issuer_id, application.id, enabled, old.id],
            )
          : await m.query(
              'INSERT INTO external_identity_sources(code,name,system_id,issuer_id,application_id,enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
              [
                system.code,
                `${system.name} · ${application.name}`.slice(0, 200),
                system.id,
                application.issuer_id,
                application.id,
                enabled,
              ],
            );
      } catch (e) {
        if ((e as { code?: string }).code === '23505')
          throw new ConflictException(
            'El sistema ya tiene una integración. Edita la existente.',
          );
        throw e;
      }
      const selectedOrganizationId =
        req.actor?.authorization?.authenticatedOrganizationId;
      if (!old && selectedOrganizationId) {
        await m.query(
          'INSERT INTO external_identity_source_organizations(source_id,organization_id,enabled) VALUES($1,$2,true)',
          [saved.id, selectedOrganizationId],
        );
      }
      await m.query(
        'DELETE FROM external_identity_source_documents WHERE source_id=$1',
        [saved.id],
      );
      for (const [position, documentId] of dto.documentIds.entries())
        await m.query(
          'INSERT INTO external_identity_source_documents(source_id,document_id,position) VALUES($1,$2,$3)',
          [saved.id, documentId, position],
        );
      await m.query(
        'UPDATE external_identity_source_clients SET enabled=false WHERE source_id=$1',
        [saved.id],
      );
      for (const c of clients)
        await m.query(
          'INSERT INTO external_identity_source_clients(source_id,oauth_issuer,client_id,roles,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,oauth_issuer,client_id) DO UPDATE SET roles=excluded.roles,enabled=excluded.enabled',
          [
            saved.id,
            c.oauthIssuer,
            c.clientId,
            c.roles.filter((role) => ['collector', 'validator'].includes(role)),
            c.enabled,
          ],
        );
      Object.assign(saved, {
        identity_issuer: settings.identityIssuer,
        product_code: settings.productCode,
        context_url: settings.contextUrl,
      });
      const after = await this.project(saved, m, req.actor.authorization);
      await this.audit(
        m,
        req,
        saved,
        old ? 'legal.integration.edit' : 'legal.integration.create',
        { before, after },
      );
      return after;
    });
  }
  async disable(req: LegalRequest, id: string) {
    return this.db.transaction(async (m) => {
      const [row]: ExternalSource[] = await m.query(
        'SELECT * FROM external_identity_sources WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (
        !row ||
        !this.allowed(req, 'legal.integrations.disable', row) ||
        !(await this.consumerAllowed(req, row, m, true))
      )
        throw new ForbiddenException();
      await m.query(
        'UPDATE external_identity_sources SET enabled=false,updated_at=now() WHERE id=$1',
        [id],
      );
      await this.audit(m, req, row, 'legal.integration.disable', {
        before: { enabled: row.enabled },
        after: { enabled: false },
      });
      return { id, enabled: false };
    });
  }
  private async audit(
    m: EntityManager,
    req: LegalRequest,
    row: ExternalSource,
    action: string,
    metadata: unknown,
  ) {
    await m.query(
      `INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'external_identity_source',$8,$9::jsonb)`,
      [
        row.issuer_id,
        row.application_id,
        req.actor.traceId,
        req.actor.identityIssuer,
        req.actor.subjectId,
        req.actor.actorType,
        action,
        row.id,
        JSON.stringify(metadata),
      ],
    );
  }
}
