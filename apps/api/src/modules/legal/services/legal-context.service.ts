import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AccessContext } from '@hemia/auth';
import { REDIS } from '../../auth/redis-session-store';
import type { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import type {
  LegalContext,
  LegalRequest,
} from '../../../common/types/legal-request';
import { LegalProductTenant } from '../entities/legal-product-tenant.entity';
import { LegalRole } from '../entities/legal-role.entity';
import { LegalRolePermission } from '../entities/legal-role-permission.entity';
import { LegalTenantMembership } from '../entities/legal-tenant-membership.entity';

type ProductAccess = {
  code?: string;
  status?: string;
  provisioning_status?: string;
  external_tenant_id?: string;
};

type StoredContext = LegalContext;

const contextKey = (sessionId: string) => `legal:session-context:${sessionId}`;
const sessionIndexKey = (issuer: string, subject: string) =>
  `legal:user-sessions:${issuer}:${subject}`;

@Injectable()
export class LegalContextService {
  private readonly productCode: string;
  private readonly sessionTtlSeconds: number;
  private readonly accessRoleMap: Map<string, string>;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectRepository(LegalProductTenant)
    private readonly tenants: Repository<LegalProductTenant>,
    @InjectRepository(LegalTenantMembership)
    private readonly memberships: Repository<LegalTenantMembership>,
    @InjectRepository(LegalRole)
    private readonly roles: Repository<LegalRole>,
    @InjectRepository(LegalRolePermission)
    private readonly rolePermissions: Repository<LegalRolePermission>,
    config: ConfigService,
  ) {
    this.productCode = config.get<string>('sso.productCode') ?? 'legal';
    this.sessionTtlSeconds =
      config.get<number>('sso.sessionTtlSeconds') ?? 604800;
    this.accessRoleMap = parseRoleMap(
      config.get<string>('sso.legalAccessRoleMap'),
    );
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
      productTenantId: context?.productTenantId ?? null,
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

    const product = organization.product;
    if (
      product.code !== this.productCode ||
      product.status !== 'enabled' ||
      !['ready', 'active'].includes(product.provisioningStatus ?? '')
    ) {
      throw new ForbiddenException('Legal product is not enabled');
    }
    if (!product.externalTenantId) {
      throw new ConflictException('Legal tenant is not provisioned');
    }

    const tenant = await this.tenants.findOneBy({
      organizationId,
      externalTenantId: product.externalTenantId,
    });
    if (!tenant || tenant.status !== 'active') {
      throw new ConflictException('Legal tenant is not ready');
    }

    const globalRoles = organization.roles ?? [];
    const membership = await this.ensureMembership(
      tenant.id,
      request.user.iss ?? request.accessContext?.identity.issuer ?? 'sso',
      request.user.sub,
      globalRoles,
    );
    const permissions = await this.permissionsFor(membership.roleId);
    const stored: StoredContext = {
      organizationId,
      externalTenantId: product.externalTenantId,
      productTenantId: tenant.id,
      contextVersion: organization.contextVersion ?? 0,
      globalRoles,
      permissions,
    };
    await this.redis.set(
      contextKey(sessionId),
      JSON.stringify(stored),
      'EX',
      this.sessionTtlSeconds,
    );
    await this.redis.sadd(
      sessionIndexKey(
        request.user.iss ?? request.accessContext?.identity.issuer ?? 'sso',
        request.user.sub,
      ),
      sessionId,
    );
    await this.redis.expire(
      sessionIndexKey(
        request.user.iss ?? request.accessContext?.identity.issuer ?? 'sso',
        request.user.sub,
      ),
      this.sessionTtlSeconds,
    );
    return safeContext(stored);
  }

  async require(request: LegalRequest): Promise<LegalContext> {
    const stored = await this.loadStored(request);
    if (!stored)
      throw new ConflictException('Legal organization context required');
    return this.validateStored(stored, request);
  }

  async invalidateUser(issuer: string, subject: string) {
    const sessions = await this.redis.smembers(
      sessionIndexKey(issuer, subject),
    );
    if (sessions.length) {
      await this.redis.del(
        ...sessions.flatMap((sessionId) => [
          contextKey(sessionId),
          `sso:session:${sessionId}`,
        ]),
      );
    }
    await this.redis.del(sessionIndexKey(issuer, subject));
  }

  async invalidateTenant(tenantId: string) {
    const rows = await this.memberships.findBy({ tenantId });
    await Promise.all(
      rows.map((membership) =>
        this.invalidateUser(membership.identityIssuer, membership.subjectId),
      ),
    );
  }

  async invalidateSession(sessionId: string) {
    await this.redis.del(contextKey(sessionId), `sso:session:${sessionId}`);
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
          roles: organization.roles,
          product: {
            code: product.code ?? null,
            status: product.status ?? null,
            provisioningStatus: product.provisioning_status ?? null,
            externalTenantId: product.external_tenant_id ?? null,
          },
        };
      })
      .filter(
        (organization) =>
          organization.organizationStatus === 'active' &&
          organization.membershipStatus === 'active' &&
          organization.product.code === this.productCode &&
          organization.product.status === 'enabled' &&
          ['ready', 'active'].includes(
            organization.product.provisioningStatus ?? '',
          ),
      );
  }

  private async loadStored(
    request: LegalRequest,
  ): Promise<StoredContext | null> {
    const sessionId = request.ssoAuth?.cookie;
    if (!sessionId) return null;
    const raw = await this.redis.get(contextKey(sessionId));
    return raw ? (JSON.parse(raw) as StoredContext) : null;
  }

  private async validateStored(
    stored: StoredContext,
    request: LegalRequest,
  ): Promise<LegalContext> {
    const organization = this.organizations(request.accessContext).find(
      (item) => item.organizationId === stored.organizationId,
    );
    if (
      !organization ||
      organization.product.externalTenantId !== stored.externalTenantId ||
      (organization.contextVersion ?? 0) !== stored.contextVersion
    ) {
      if (request.ssoAuth?.cookie) {
        await this.redis.del(contextKey(request.ssoAuth.cookie));
      }
      throw new UnauthorizedException('Stale Legal context');
    }
    const tenant = await this.tenants.findOneBy({ id: stored.productTenantId });
    if (!tenant || tenant.status !== 'active') {
      throw new ForbiddenException('Legal tenant is not active');
    }
    const issuer =
      request.user?.iss ?? request.accessContext?.identity.issuer ?? 'sso';
    const membership = await this.memberships.findOneBy({
      tenantId: tenant.id,
      identityIssuer: issuer,
      subjectId: request.user?.sub ?? '',
    });
    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('Legal membership is not active');
    }
    return {
      ...stored,
      permissions: await this.permissionsFor(membership.roleId),
    };
  }

  private async ensureMembership(
    tenantId: string,
    identityIssuer: string,
    subjectId: string,
    globalRoles: string[],
  ) {
    const existing = await this.memberships.findOneBy({
      tenantId,
      identityIssuer,
      subjectId,
    });
    if (existing) {
      const role = await this.roleForGlobalRoles(globalRoles);
      if (existing.status !== 'active' || existing.roleId !== role.id) {
        existing.status = 'active';
        existing.roleId = role.id;
        return this.memberships.save(existing);
      }
      return existing;
    }
    const role = await this.roleForGlobalRoles(globalRoles);
    return this.memberships.save(
      this.memberships.create({
        tenantId,
        identityIssuer,
        subjectId,
        roleId: role.id,
        status: 'active',
      }),
    );
  }

  async syncMembershipRole(
    tenantId: string,
    identityIssuer: string,
    subjectId: string,
    globalRoles: string[],
  ) {
    const membership = await this.memberships.findOneBy({
      tenantId,
      identityIssuer,
      subjectId,
    });
    if (!membership) return;
    const role = await this.roleForGlobalRoles(globalRoles);
    membership.roleId = role.id;
    membership.status = 'active';
    await this.memberships.save(membership);
    await this.invalidateUser(identityIssuer, subjectId);
  }

  private async permissionsFor(roleId: string) {
    return (await this.rolePermissions.findBy({ roleId })).map(
      (permission) => permission.permissionCode,
    );
  }

  private async roleForGlobalRoles(globalRoles: string[]) {
    const roleCode =
      globalRoles.map((role) => this.accessRoleMap.get(role)).find(Boolean) ??
      'legal.viewer';
    const role = await this.roles.findOneBy({ code: roleCode });
    if (!role) throw new ConflictException(`Missing local role: ${roleCode}`);
    return role;
  }
}

function productFrom(value: unknown): ProductAccess {
  if (!value || typeof value !== 'object') return {};
  const product = 'product' in value ? value.product : value;
  return product && typeof product === 'object' ? product : {};
}

function parseRoleMap(value?: string) {
  const result = new Map<string, string>();
  for (const pair of value?.split(',') ?? []) {
    const [globalRole, localRole] = pair.split('=').map((item) => item.trim());
    if (globalRole && localRole) result.set(globalRole, localRole);
  }
  return result;
}

function safeContext(context: StoredContext) {
  return {
    organizationId: context.organizationId,
    externalTenantId: context.externalTenantId,
    productTenantId: context.productTenantId,
    contextVersion: context.contextVersion,
    permissions: context.permissions,
  };
}
