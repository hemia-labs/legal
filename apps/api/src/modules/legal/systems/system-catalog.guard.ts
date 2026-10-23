import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { ServiceTokenService } from '../../auth/service-token.service';
import { introspectIdentity } from '../authorization/identity-introspection';
import type { LegalRequest } from '../../../common/types/legal-request';
@Injectable()
export class SystemCatalogGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<LegalRequest>();
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.headers.authorization ?? '',
    )?.[1];
    if (!token) throw new UnauthorizedException();
    const v = await introspectIdentity(this.config, token, this.tokens);
    if (
      !v.active ||
      Number(v.exp) <= Date.now() / 1000 ||
      'sub' in v ||
      'session_id' in v
    )
      throw new UnauthorizedException();
    const permission =
      req.method === 'GET' ? 'legal.systems.read' : 'legal.systems.write';
    if (
      v.aud !== 'legal-api' ||
      v.client_id !==
        this.config.get(
          'legalService.catalogClientId',
          'console-identity-admin',
        ) ||
      !(v.scope as string).split(/\s+/).includes(permission)
    )
      throw new ForbiddenException();
    const subject = req.header('x-console-actor-subject');
    const issuer = req.header('x-console-actor-issuer');
    if (
      !subject ||
      !isUUID(subject) ||
      issuer !== this.config.getOrThrow<string>('sso.issuer')
    )
      throw new ForbiddenException('Verified Console actor required');
    // Only the dedicated Console service may attest its already-authorized platform administrator.
    req.actor = {
      identityIssuer: issuer,
      subjectId: subject,
      actorType: 'user',
      permissions: [permission],
      traceId: randomUUID(),
    };
    return true;
  }
}
