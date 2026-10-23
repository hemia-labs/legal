import { ServiceTokenService } from '../../../auth/service-token.service';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../../common/decorators/permissions.decorator';
import { introspectIdentity } from '../../authorization/identity-introspection';
import type { Request } from 'express';
export type IntegrationRequest = Request & {
  integrationCaller: {
    issuer: string;
    clientId: string;
    role: 'collector' | 'validator';
  };
};
@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<IntegrationRequest>();
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.headers.authorization ?? '',
    )?.[1];
    if (!token) throw new UnauthorizedException();
    const value = await introspectIdentity(this.config, token, this.tokens);
    if (
      !value.active ||
      Number(value.exp) <= Date.now() / 1000 ||
      'sub' in value ||
      'session_id' in value
    )
      throw new UnauthorizedException();
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const scope = required[0];
    if (
      required.length !== 1 ||
      ![
        'legal.integration.acceptances.prepare',
        'legal.integration.acceptances.create',
        'legal.integration.acceptances.validate',
      ].includes(scope) ||
      value.aud !== 'legal-api' ||
      !(value.scope as string).split(/\s+/).includes(scope)
    )
      throw new ForbiddenException();
    req.integrationCaller = {
      issuer: this.config.getOrThrow<string>('sso.issuer'),
      clientId: value.client_id as string,
      role: scope.endsWith('.validate') ? 'validator' : 'collector',
    };
    return true;
  }
}
