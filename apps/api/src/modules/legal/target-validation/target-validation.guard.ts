import { ServiceTokenService } from '../../auth/service-token.service';
import { introspectIdentity } from '../authorization/identity-introspection';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class TargetValidationGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request<Record<string, string>, unknown, unknown>>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException();
    const value = await introspectIdentity(this.config, match[1], this.tokens);
    if (
      !value.active ||
      (value.exp as number) <= Date.now() / 1000 ||
      'sub' in value ||
      'session_id' in value
    )
      throw new UnauthorizedException();
    if (
      value.aud !== 'legal-api' ||
      value.client_id !== 'access-legal-validator' ||
      !(value.scope as string)
        .split(/\s+/)
        .includes('legal.authorization.targets.validate')
    )
      throw new ForbiddenException();
    if (
      !request.body ||
      typeof request.body !== 'object' ||
      Array.isArray(request.body) ||
      Object.keys(request.body).some(
        (key) => !['target_type', 'ids'].includes(key),
      )
    )
      throw new BadRequestException('Invalid validation request');
    return true;
  }
}
