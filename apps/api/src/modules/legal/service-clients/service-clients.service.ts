import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import type { LegalRequest } from '../../../common/types/legal-request';
import {
  grantsFor,
  consumerOrganizationsAllowed,
} from '../authorization/legal-authorization';
import { LegalServiceClient } from '../entities/legal-service-client.entity';
import {
  parseServicePolicy,
  SaveServiceClientDto,
  ServicePolicyDto,
} from './service-client.dto';
@Injectable()
export class ServiceClientsService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}
  private allowed(
    req: LegalRequest,
    permission: string,
    policy: ServicePolicyDto,
  ) {
    const assignments = grantsFor(req.actor?.authorization, permission);
    return policy.grants.every(
      (g) =>
        consumerOrganizationsAllowed(
          req.actor?.authorization,
          g.organizationIds,
        ) &&
        assignments.some(
          (a) =>
            a.resource_scope.type === 'legal_global' ||
            (a.resource_scope.type === 'issuers' &&
              a.resource_scope.ids.includes(g.issuerId)) ||
            (a.resource_scope.type === 'applications' &&
              a.resource_scope.ids.includes(g.applicationId)),
        ),
    );
  }
  async list(req: LegalRequest) {
    grantsFor(req.actor?.authorization, 'legal.integrations.view');
    const rows = await this.db
      .getRepository(LegalServiceClient)
      .find({ order: { clientId: 'ASC' } });
    return rows
      .filter((row) =>
        this.allowed(
          req,
          'legal.integrations.view',
          parseServicePolicy(row.policy),
        ),
      )
      .map((row) => ({
        id: row.id,
        oauthIssuer: row.oauthIssuer,
        clientId: row.clientId,
        enabled: row.enabled,
        policy: row.policy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  }
  async authorize(
    issuer: string,
    clientId: string,
    operation: string,
    issuerId: string,
    applicationId: string,
    organizationId: string,
  ) {
    const row = await this.db
      .getRepository(LegalServiceClient)
      .findOneBy({ oauthIssuer: issuer, clientId, enabled: true });
    if (
      !row ||
      !parseServicePolicy(row.policy).grants.some(
        (g) =>
          g.operation === operation &&
          g.issuerId === issuerId &&
          g.applicationId === applicationId &&
          (!g.organizationIds.length ||
            g.organizationIds.includes(organizationId)),
      )
    )
      throw new ForbiddenException('Target outside service grant');
  }
  async save(req: LegalRequest, dto: SaveServiceClientDto) {
    if (dto.oauthIssuer !== this.config.getOrThrow<string>('sso.issuer'))
      throw new BadRequestException('Untrusted OAuth issuer');
    const policy = parseServicePolicy(dto.policy);
    return this.db.transaction(async (m) => {
      // Serialize updates for the same identity, including the first insert.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        JSON.stringify([dto.oauthIssuer, dto.clientId]),
      ]);
      const repository = m.getRepository(LegalServiceClient);
      const old = await repository.findOne({
        where: { oauthIssuer: dto.oauthIssuer, clientId: dto.clientId },
        lock: { mode: 'pessimistic_write' },
      });
      const permission = old
        ? 'legal.integrations.edit'
        : 'legal.integrations.create';
      if (
        !this.allowed(req, permission, policy) ||
        (old && !this.allowed(req, permission, parseServicePolicy(old.policy)))
      )
        throw new ForbiddenException('Service client outside operator scope');
      for (const grant of policy.grants) {
        const rows: unknown[] = await m.query(
          'SELECT a.id FROM applications a JOIN issuers i ON i.id=a.issuer_id WHERE a.id=$1 AND i.id=$2 AND a.deleted_at IS NULL AND i.deleted_at IS NULL',
          [grant.applicationId, grant.issuerId],
        );
        if (rows.length !== 1)
          throw new BadRequestException('Invalid service client target');
      }
      const saved = await repository.save(
        repository.create({ ...old, ...dto, policy }),
      );
      await this.audit(m, req, saved);
      return {
        id: saved.id,
        oauthIssuer: saved.oauthIssuer,
        clientId: saved.clientId,
        enabled: saved.enabled,
        policy: saved.policy,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    });
  }
  private async audit(
    m: EntityManager,
    req: LegalRequest,
    row: LegalServiceClient,
  ) {
    for (const grant of row.policy.grants.filter(
      (g, i, all) =>
        all.findIndex((v) => v.applicationId === g.applicationId) === i,
    ))
      await m.query(
        `INSERT INTO audit_events(issuer_id,application_id,trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6,'legal.service_client.save','legal_service_client',$7,$8::jsonb)`,
        [
          grant.issuerId,
          grant.applicationId,
          req.actor.traceId,
          req.actor.identityIssuer,
          req.actor.subjectId,
          req.actor.actorType,
          row.id,
          JSON.stringify({
            clientId: row.clientId,
            enabled: row.enabled,
            policy: {
              grants: row.policy.grants.filter(
                (g) => g.applicationId === grant.applicationId,
              ),
            },
          }),
        ],
      );
  }
}
