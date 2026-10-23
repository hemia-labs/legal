import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser } from '@hemia/auth';
import { SsoAuthGuard } from '@hemia/auth/nestjs';
import type { LegalRequest } from '../types/legal-request';
import { LegalContextService } from '../../modules/legal/session/legal-context.service';

@Injectable()
export class LegalAuthGuard implements CanActivate {
  constructor(
    private readonly ssoAuthGuard: SsoAuthGuard,
    private readonly contextService: LegalContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.ssoAuthGuard.canActivate(context);

    const request = context.switchToHttp().getRequest<
      LegalRequest & {
        user?: AuthenticatedUser;
      }
    >();
    const user = request.user as AuthenticatedUser;
    const legalContext = await this.contextService.require(request);

    request.actor = {
      identityIssuer:
        user.iss ?? request.accessContext?.identity.issuer ?? 'sso',
      subjectId: user.sub,
      actorType: 'user',
      permissions: legalContext.permissions,
      authorization: legalContext.authorization,
      traceId: request.header('x-trace-id') || randomUUID(),
    };
    request.legalContext = legalContext;

    return true;
  }
}
