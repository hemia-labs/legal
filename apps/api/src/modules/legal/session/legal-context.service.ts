import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SystemContextCache, type AccessContext } from '@hemia/auth';
import { AccessClient } from '@hemia/auth/nestjs';
import {
  validateLegalContext,
  permissionsForAuthorization,
} from '../authorization/legal-authorization';
import { REDIS, RedisSessionStore } from '../../auth/redis/redis-session-store';
import type { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import type {
  LegalContext,
  LegalRequest,
} from '../../../common/types/legal-request';

type ProductAccess = {
  code?: string;
  status?: string;
};

type StoredContext = Pick<LegalContext, 'organizationId'>;

type StoredSsoSession = {
  user?: { iss?: string; sub?: string };
  accessContext?: { identity?: { issuer?: string } };
  legalContext?: StoredContext;
};

const sessionKey = (sessionId: string) => `sso:session:${sessionId}`;
const STORE_CONTEXT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local session = cjson.decode(raw)
session.legalContext = cjson.decode(ARGV[1])
redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
return 1
`;

@Injectable()
export class LegalContextService {
  private readonly productCode: string;
  private readonly contexts: SystemContextCache;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly accessClient: AccessClient,
    private readonly config: ConfigService,
    store: RedisSessionStore,
  ) {
    this.productCode = 'legal';
    this.contexts = new SystemContextCache(store);
  }

  async session(request: LegalRequest) {
    const organizations = this.organizations(request.accessContext);
    const stored = await this.loadStored(request);
    const context = stored
      ? await this.validateStored(stored, request)
      : organizations.length === 1
        ? await this.select(request, organizations[0].organizationId)
        : null;

    return {
      authenticated: true,
      user: request.user,
      organizations,
      activeOrganizationId: context?.organizationId ?? null,
      permissions: context?.permissions ?? [],
    };
  }

  async select(request: LegalRequest, organizationId: string) {
    const organization = this.organizations(request.accessContext).find(
      (row) => row.organizationId === organizationId,
    );
    if (!organization) {
      throw new ForbiddenException('Organization is not available for Legal');
    }

    const sessionId = request.ssoAuth?.cookie;
    if (!sessionId || !request.user?.sub) {
      throw new UnauthorizedException('Missing authenticated session');
    }

    const stored: StoredContext = { organizationId };
    const resolved = await this.validateStored(stored, request);
    const saved = await this.redis.eval(
      STORE_CONTEXT_SCRIPT,
      1,
      sessionKey(sessionId),
      JSON.stringify(stored),
    );
    if (Number(saved) !== 1) {
      throw new UnauthorizedException('Invalid session');
    }
    return resolved;
  }

  async require(request: LegalRequest): Promise<LegalContext> {
    const stored = await this.loadStored(request);
    if (!stored)
      throw new ConflictException('Legal organization context required');
    return this.validateStored(stored, request);
  }

  async invalidateUser(issuer: string, subject: string) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'sso:session:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (!keys.length) continue;

      const sessions = await this.redis.mget(...keys);
      const matchingKeys = keys.filter((_, index) =>
        belongsToUser(sessions[index], issuer, subject),
      );
      if (matchingKeys.length) await this.redis.del(...matchingKeys);
    } while (cursor !== '0');
  }

  async invalidateOrganization(organizationId: string) {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'sso:session:*',
        'COUNT',
        100,
      );
      cursor = next;
      if (!keys.length) continue;
      const sessions = await this.redis.mget(...keys);
      for (let index = 0; index < keys.length; index++) {
        const raw = sessions[index];
        if (!raw) continue;
        const session = JSON.parse(raw) as StoredSsoSession;
        if (session.legalContext?.organizationId === organizationId)
          await this.redis.del(keys[index]);
      }
    } while (cursor !== '0');
  }

  async invalidateSession(sessionId: string) {
    await this.redis.del(sessionKey(sessionId));
  }

  private organizations(context?: AccessContext) {
    return (context?.organizations ?? [])
      .map((organization) => {
        const product = productFrom(organization);
        return {
          organizationId: organization.organization_id,
          code: organization.organization_code,
          name: organization.organization_name,
          organizationStatus: organization.organization_status,
          membershipStatus: organization.membership_status,
          contextVersion: organization.context_version,
          membershipId: organization.membership_id,
          product: {
            code: product.code ?? null,
            status: product.status ?? null,
          },
        };
      })
      .filter(
        (organization) =>
          organization.organizationStatus === 'active' &&
          organization.membershipStatus === 'active' &&
          organization.product.code === this.productCode &&
          organization.product.status === 'enabled',
      );
  }

  private async loadStored(
    request: LegalRequest,
  ): Promise<StoredContext | null> {
    const sessionId = request.ssoAuth?.cookie;
    if (!sessionId) return null;
    const raw = await this.redis.get(sessionKey(sessionId));
    return raw
      ? ((JSON.parse(raw) as StoredSsoSession).legalContext ?? null)
      : null;
  }

  private async validateStored(
    stored: StoredContext,
    request: LegalRequest,
  ): Promise<LegalContext> {
    const organization = this.organizations(request.accessContext).find(
      (item) => item.organizationId === stored.organizationId,
    );
    if (!organization)
      throw new ForbiddenException('Organization is not available for Legal');
    const expected = {
      issuer: this.config.getOrThrow<string>('sso.issuer'),
      subject: request.user?.sub ?? '',
      identityReferenceId:
        request.accessContext!.identity.identity_reference_id,
      organizationId: stored.organizationId,
      membershipId: organization.membershipId,
    };
    try {
      const claims = await this.contexts.resolve(
        {
          sessionId: request.ssoAuth?.cookie ?? '',
          ...expected,
          product: 'legal',
          audience: 'legal-api',
        },
        !['GET', 'HEAD'].includes(request.method),
        async () => {
          const token = await this.accessClient.exchangeUserToken(
            request.ssoAuth?.accessToken ?? '',
          );
          const fresh = await this.accessClient.resolveSystemContext(token, {
            organization_id: stored.organizationId,
            product_code: 'legal',
            audience: 'legal-api',
          });
          validateLegalContext(fresh, expected);
          return fresh;
        },
      );
      const authorization = validateLegalContext(claims, expected);
      return {
        ...stored,
        contextVersion: claims.context_version as number,
        authorization,
        permissions: permissionsForAuthorization(authorization),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        error instanceof Error &&
        error.name === 'AccessContextError' &&
        'status' in error &&
        typeof error.status === 'number' &&
        [401, 403, 409, 503].includes(error.status)
      )
        throw new HttpException(error.message, error.status);
      throw new ServiceUnavailableException('Access authorization unavailable');
    }
  }
}

function productFrom(value: unknown): ProductAccess {
  if (!value || typeof value !== 'object') return {};
  const product = 'product' in value ? value.product : value;
  return product && typeof product === 'object' ? product : {};
}

function belongsToUser(raw: string | null, issuer: string, subject: string) {
  if (!raw) return false;
  try {
    const session = JSON.parse(raw) as StoredSsoSession;
    return (
      session.user?.sub === subject &&
      (session.user.iss ?? session.accessContext?.identity?.issuer) === issuer
    );
  } catch {
    return false;
  }
}
