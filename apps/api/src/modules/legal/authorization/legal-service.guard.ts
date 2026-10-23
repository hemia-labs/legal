import { ServiceClientsService } from '../service-clients/service-clients.service';
import { ServiceTokenService } from '../../auth/service-token.service';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { LegalRequest } from '../../../common/types/legal-request';
import { introspectIdentity } from './identity-introspection';
import { LegalConsumerAccessService } from './legal-consumer-access.service';
@Injectable()
export class LegalServiceGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
    private readonly db: DataSource,
    private readonly access: LegalConsumerAccessService,
    private readonly reflector: Reflector,
    private readonly clients: ServiceClientsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<LegalRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException();
    const value = await introspectIdentity(this.config, match[1], this.tokens);
    if (
      !value.active ||
      Number(value.exp) <= Date.now() / 1000 ||
      'sub' in value ||
      'session_id' in value
    )
      throw new UnauthorizedException();
    const scopes =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const scope = scopes[0];
    if (
      scopes.length !== 1 ||
      !['legal.pending.evaluate', 'legal.acceptances.validate'].includes(scope)
    )
      throw new ForbiddenException();
    const validation = scope === 'legal.acceptances.validate';
    if (
      value.aud !== 'legal-api' ||
      !(value.scope as string).split(/\s+/).includes(scope)
    )
      throw new ForbiddenException();
    const body = request.body as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) =>
          ![
            'issuerId',
            'applicationId',
            'organizationId',
            'identityIssuer',
            'subjectId',
            ...(validation ? ['productCode', 'legalAcceptanceId'] : ['locale']),
          ].includes(key),
      )
    )
      throw new BadRequestException('Invalid evaluation request');
    if (
      validation &&
      (typeof body.productCode !== 'string' ||
        !body.productCode ||
        body.productCode.length > 80 ||
        typeof body.legalAcceptanceId !== 'string' ||
        !isUUID(body.legalAcceptanceId))
    )
      throw new BadRequestException('Invalid acceptance validation request');
    if (
      typeof body.applicationId !== 'string' ||
      typeof body.organizationId !== 'string' ||
      typeof body.issuerId !== 'string' ||
      !isUUID(body.issuerId) ||
      !isUUID(body.applicationId) ||
      !isUUID(body.organizationId)
    )
      throw new ForbiddenException('Target outside service grant');
    await this.clients.authorize(
      this.config.getOrThrow<string>('sso.issuer'),
      value.client_id as string,
      scope,
      body.issuerId,
      body.applicationId,
      body.organizationId,
    );
    const rows: unknown[] = await this.db.query(
      "SELECT a.id FROM applications a JOIN issuers i ON i.id=a.issuer_id WHERE a.id=$1 AND i.id=$2 AND a.deleted_at IS NULL AND i.deleted_at IS NULL AND a.status='active' AND i.status='active'",
      [body.applicationId, body.issuerId],
    );
    if (rows.length !== 1)
      throw new ForbiddenException('Inactive evaluation target');
    if (
      typeof body.identityIssuer !== 'string' ||
      typeof body.subjectId !== 'string'
    )
      throw new BadRequestException('Consumer identity is required');
    request.personalContext = await this.access.resolve(
      body.organizationId,
      body.identityIssuer,
      body.subjectId,
    );
    request.actor = {
      identityIssuer: this.config.getOrThrow<string>('sso.issuer'),
      subjectId: value.client_id as string,
      actorType: 'service',
      permissions: [scope],
      traceId: randomUUID(),
    };
    return true;
  }
}
