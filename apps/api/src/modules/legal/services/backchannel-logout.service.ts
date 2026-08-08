import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { LegalContextService } from './legal-context.service';

const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

@Injectable()
export class BackchannelLogoutService {
  constructor(
    private readonly context: LegalContextService,
    private readonly config: ConfigService,
  ) {}

  async consume(logoutToken: string) {
    const issuer = this.config.get<string>('sso.issuer');
    const jwksUrl = this.config.get<string>('sso.jwksUrl');
    const audience = this.config.get<string>('sso.clientId');
    if (!issuer || !jwksUrl || !audience) {
      throw new UnauthorizedException('SSO logout validation is not configured');
    }

    try {
      const { payload } = await jwtVerify(
        logoutToken,
        createRemoteJWKSet(new URL(jwksUrl)),
        { issuer, audience },
      );
      const events = payload.events;
      if (!events || typeof events !== 'object' || !(BACKCHANNEL_EVENT in events)) {
        throw new Error('Invalid back-channel logout event');
      }
      const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
      const sessionId = typeof payload.sid === 'string' ? payload.sid : undefined;
      if (!subject && !sessionId) throw new Error('Logout token has no subject or sid');
      if (subject) await this.context.invalidateUser(String(payload.iss ?? issuer), subject);
      if (sessionId) await this.context.invalidateSession(sessionId);
      return { invalidated: true };
    } catch {
      throw new UnauthorizedException('Invalid back-channel logout token');
    }
  }
}
