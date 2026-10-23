import { ServiceTokenService } from '../../auth/service-token.service';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SsoAuthGuard } from '@hemia/auth/nestjs';
import { randomUUID } from 'node:crypto';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import type { LegalRequest } from '../../../common/types/legal-request';
import { introspectIdentity } from './identity-introspection';
import { LegalConsumerAccessService } from './legal-consumer-access.service';
@Injectable()
export class LegalPersonalGuard implements CanActivate {
  constructor(
    private readonly sso: SsoAuthGuard,
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
    private readonly reflector: Reflector,
    private readonly access: LegalConsumerAccessService,
    private readonly db: DataSource,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<LegalRequest>();
    let token: string;
    if (request.headers.authorization !== undefined) {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization);
      if (!match) throw new UnauthorizedException();
      token = match[1];
    } else {
      await this.sso.canActivate(context);
      token = request.ssoAuth?.accessToken ?? '';
    }
    if (!token) throw new UnauthorizedException();
    const value = await introspectIdentity(this.config, token, this.tokens);
    if (
      !value.active ||
      Number(value.exp) <= Date.now() / 1000 ||
      typeof value.sub !== 'string' ||
      !value.sub ||
      typeof value.session_id !== 'string' ||
      !value.session_id
    )
      throw new UnauthorizedException();
    let applications: string[];
    try {
      const clients = JSON.parse(
        this.config.getOrThrow<string>('LEGAL_PERSONAL_CLIENTS'),
      ) as Record<string, { application_ids: string[] }>;
      if (!Object.hasOwn(clients, value.client_id as string))
        throw new ForbiddenException('Personal client not allowed');
      applications = clients[value.client_id as string]?.application_ids;
      if (
        !Array.isArray(applications) ||
        !applications.length ||
        applications.length > 1000 ||
        !applications.every((id) => isUUID(id))
      )
        throw new Error();
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException(
        'Personal clients are not configured',
      );
    }
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (
      value.aud !== 'legal-api' ||
      !required.length ||
      !required.every(
        (scope) =>
          scope.startsWith('legal.self.') &&
          (value.scope as string).split(/\s+/).includes(scope),
      )
    )
      throw new ForbiddenException();
    const input = (
      request.method === 'GET' ? request.query : request.body
    ) as Record<string, unknown>;
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Invalid personal request');
    if (
      'productTenantId' in input ||
      'identityIssuer' in input ||
      'subjectId' in input ||
      'roles' in input
    )
      throw new BadRequestException(
        'Consumer identity is server-derived; tenant parameters are not accepted',
      );
    if (typeof input.organizationId !== 'string')
      throw new BadRequestException('organizationId is required');
    if (request.method === 'POST') {
      if (
        typeof input.documentVersionId !== 'string' ||
        !isUUID(input.documentVersionId) ||
        typeof input.acceptanceRuleId !== 'string' ||
        !isUUID(input.acceptanceRuleId)
      )
        throw new BadRequestException('Invalid acceptance target');
      const rows: { application_id: string }[] = await this.db.query(
        "SELECT r.application_id FROM acceptance_rules r JOIN document_versions v ON v.id=r.version_id JOIN documents d ON d.id=r.document_id AND d.id=v.document_id JOIN applications a ON a.id=r.application_id AND a.issuer_id=r.issuer_id JOIN issuers i ON i.id=a.issuer_id WHERE r.id=$1 AND v.id=$2 AND d.application_id=a.id AND d.issuer_id=i.id AND r.status='active' AND v.status='published' AND d.status='active' AND d.deleted_at IS NULL AND a.status='active' AND a.deleted_at IS NULL AND i.status='active' AND i.deleted_at IS NULL",
        [input.acceptanceRuleId, input.documentVersionId],
      );
      if (rows.length !== 1 || !applications.includes(rows[0].application_id))
        throw new ForbiddenException(
          'Acceptance outside personal client scope',
        );
    } else if (
      input.applicationId !== undefined &&
      (typeof input.applicationId !== 'string' ||
        !applications.includes(input.applicationId))
    )
      throw new ForbiddenException('Application outside personal client scope');
    const issuer = this.config.getOrThrow<string>('sso.issuer');
    request.personalContext = {
      ...(await this.access.resolve(input.organizationId, issuer, value.sub)),
      applicationIds: applications,
    };
    request.actor = {
      identityIssuer: issuer,
      subjectId: value.sub,
      actorType: 'user',
      permissions: required,
      traceId: randomUUID(),
    };
    return true;
  }
}
