import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PermanentError,
  type EventEnvelope,
} from '@hemia/event-bus';
import {
  QueryFailedError,
  DataSource,
  EntityManager,
  Repository,
} from 'typeorm';
import { LegalContextService } from './legal-context.service';
import {
  AccessEventData,
  validateAccessEventData,
} from '../contracts/access-event.contracts';
import { LegalConsumedAccessEvent } from '../entities/legal-consumed-access-event.entity';
import { LegalProductTenant } from '../entities/legal-product-tenant.entity';
import { LegalRole } from '../entities/legal-role.entity';
import { LegalTenantMembership } from '../entities/legal-tenant-membership.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';

const CONSUMER = 'legal-identity-access-v1';
const PRODUCT = 'legal';

const PRODUCT_STATES: Record<string, string> = {
  'access.organization_product.enable_requested.v1': 'provisioning',
  'access.organization_product.provisioning.v1': 'provisioning',
  'access.organization_product.enabled.v1': 'active',
  'access.organization_product.suspended.v1': 'suspended',
  'access.organization_product.disabled.v1': 'archived',
  'access.organization_product.failed.v1': 'failed',
};

const ORGANIZATION_STATES: Record<string, string> = {
  'access.organization.suspended.v1': 'suspended',
  'access.organization.archived.v1': 'archived',
};

const MEMBERSHIP_EVENTS = new Set([
  'access.membership.suspended.v1',
  'access.membership.revoked.v1',
  'access.membership.role_assigned.v1',
  'access.membership.role_revoked.v1',
]);

export type AccessEvent = Partial<EventEnvelope<AccessEventData>> & {
  event_id?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
};

type Invalidation =
  | { kind: 'tenant'; organizationId: string }
  | { kind: 'user'; issuer: string; subjectId: string };

type OutboundEvent = {
  type: string;
  data: Record<string, unknown>;
  traceId: string;
  correlationId: string | null;
  traceParent: string | null;
  subject: string | null;
};

@Injectable()
export class AccessEventsService {
  private readonly logger = new Logger(AccessEventsService.name);
  private readonly roleMap: Map<string, string>;

  constructor(
    @InjectRepository(LegalConsumedAccessEvent)
    private readonly consumed: Repository<LegalConsumedAccessEvent>,
    @InjectRepository(LegalProductTenant)
    private readonly tenants: Repository<LegalProductTenant>,
    @InjectRepository(LegalTenantMembership)
    private readonly memberships: Repository<LegalTenantMembership>,
    @InjectRepository(LegalRole)
    private readonly roles: Repository<LegalRole>,
    private readonly context: LegalContextService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.roleMap = parseRoleMap(config.get<string>('sso.legalAccessRoleMap'));
  }

  async consume(event: AccessEvent) {
    const eventId = event.id ?? event.event_id;
    const eventType = event.type ?? event.event_type;
    if (!eventId || !eventType) {
      throw new PermanentError('Invalid Access event envelope');
    }

    const rawData = event.data ?? event.payload;
    const data = validateAccessEventData(eventType, rawData);
    const invalidations: Invalidation[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      const consumed = manager.getRepository(LegalConsumedAccessEvent);
      if (!(await this.markStarted(consumed, eventId, eventType))) {
        return { processed: false, duplicate: true };
      }

      if (eventType in PRODUCT_STATES) {
        const invalidation = await this.handleProduct(
          manager,
          eventType,
          data,
          event,
        );
        if (invalidation) invalidations.push(invalidation);
      } else if (eventType in ORGANIZATION_STATES) {
        const invalidation = await this.handleOrganization(
          manager,
          eventType,
          data,
        );
        if (invalidation) invalidations.push(invalidation);
      } else if (MEMBERSHIP_EVENTS.has(eventType)) {
        const invalidation = await this.handleMembership(
          manager,
          eventType,
          data,
        );
        if (invalidation) invalidations.push(invalidation);
      }

      return { processed: true, duplicate: false };
    });

    if (result.duplicate) {
      const duplicateInvalidation = this.invalidationForEvent(eventType, data);
      if (duplicateInvalidation) invalidations.push(duplicateInvalidation);
    }
    await this.invalidate(invalidations);
    return result;
  }

  private async markStarted(
    consumed: Repository<LegalConsumedAccessEvent>,
    eventId: string,
    eventType: string,
  ) {
    try {
      await consumed.insert(
        consumed.create({
          eventId,
          eventType,
          consumerName: CONSUMER,
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { driverError?: { code?: string } }).driverError?.code ===
          '23505'
      ) {
        return false;
      }
      throw error;
    }
  }

  private async handleProduct(
    manager: EntityManager,
    type: string,
    data: AccessEventData,
    event: AccessEvent,
  ): Promise<Invalidation | null> {
    if (!isProductData(data) || data.product_code !== PRODUCT) return null;

    const tenants = manager.getRepository(LegalProductTenant);
    const tenant =
      (await tenants.findOneBy({ organizationId: data.organization_id })) ??
      tenants.create({
        organizationId: data.organization_id,
        externalTenantId: data.external_tenant_id ?? null,
        code: PRODUCT,
        name: data.organization_name ?? data.organization_id,
        status: 'pending',
        configuration: {},
      });

    if (data.external_tenant_id) {
      tenant.externalTenantId = data.external_tenant_id;
    }
    tenant.code = PRODUCT;
    tenant.name = data.organization_name ?? tenant.name ?? data.organization_id;
    tenant.status = PRODUCT_STATES[type];
    const version = nextTenantVersion(
      tenant.configuration,
      data.context_version,
    );
    tenant.configuration = {
      ...tenant.configuration,
      contextVersion: version,
      accessContextVersion: data.context_version ?? null,
      lastAccessEvent: type,
    };

    const saved = await tenants.save(tenant);
    if (
      type === 'access.organization_product.enable_requested.v1' &&
      !saved.externalTenantId
    ) {
      saved.externalTenantId = saved.id;
      await tenants.save(saved);
    }

    if (type === 'access.organization_product.enable_requested.v1') {
      await this.queueOutbound(
        manager,
        provisioningEvent(saved, version, event),
      );
    }

    if (type === 'access.organization_product.failed.v1') {
      await this.queueOutbound(
        manager,
        failedProvisioningEvent(saved, version, event),
      );
    }

    return ['suspended', 'archived', 'failed', 'active'].includes(saved.status)
      ? { kind: 'tenant', organizationId: saved.organizationId }
      : null;
  }

  private async queueOutbound(manager: EntityManager, event: OutboundEvent) {
    const outbox = manager.getRepository(OutboxEvent);
    await outbox.save(
      outbox.create({
        traceId: event.traceId,
        correlationId: event.correlationId,
        traceParent: event.traceParent,
        subject: event.subject,
        eventType: event.type,
        payload: event.data,
        status: 'pending',
        attemptCount: 0,
        nextRunAt: null,
        processedAt: null,
      }),
    );
  }

  private async handleOrganization(
    manager: EntityManager,
    type: string,
    data: AccessEventData,
  ): Promise<Invalidation | null> {
    if (!isOrganizationData(data)) return null;
    const tenants = manager.getRepository(LegalProductTenant);
    const tenant = await tenants.findOneBy({
      organizationId: data.organization_id,
    });
    if (!tenant) return null;
    tenant.status = ORGANIZATION_STATES[type];
    await tenants.save(tenant);
    return { kind: 'tenant', organizationId: tenant.organizationId };
  }

  private async handleMembership(
    manager: EntityManager,
    type: string,
    data: AccessEventData,
  ): Promise<Invalidation | null> {
    if (!isMembershipData(data)) return null;
    const tenants = manager.getRepository(LegalProductTenant);
    const memberships = manager.getRepository(LegalTenantMembership);
    const tenant = await tenants.findOneBy({
      organizationId: data.organization_id,
    });
    if (!tenant) return null;

    const existing = await memberships.findOneBy({
      tenantId: tenant.id,
      identityIssuer: data.identity_issuer,
      subjectId: data.subject_id,
    });
    const role =
      data.role_codes || !existing
        ? await this.roleForGlobalRoles(manager, data.role_codes ?? [])
        : null;
    const membership =
      existing ??
      memberships.create({
        tenantId: tenant.id,
        identityIssuer: data.identity_issuer,
        subjectId: data.subject_id,
        roleId: role!.id,
        status: 'active',
      });

    if (role) membership.roleId = role.id;
    membership.status = type.endsWith('revoked.v1')
      ? 'revoked'
      : type.endsWith('suspended.v1')
        ? 'suspended'
        : (data.membership_status ?? 'active');
    await memberships.save(membership);

    return {
      kind: 'user',
      issuer: data.identity_issuer,
      subjectId: data.subject_id,
    };
  }

  private async roleForGlobalRoles(
    manager: EntityManager,
    globalRoles: string[],
  ) {
    const roleCode =
      globalRoles.map((role) => this.roleMap.get(role)).find(Boolean) ??
      'legal.viewer';
    const role = await manager
      .getRepository(LegalRole)
      .findOneBy({ code: roleCode });
    if (!role) throw new Error(`Missing local role: ${roleCode}`);
    return role;
  }

  private async invalidate(invalidations: Invalidation[]) {
    const unique = new Map<string, Invalidation>();
    for (const invalidation of invalidations) {
      const key =
        invalidation.kind === 'tenant'
          ? `tenant:${invalidation.organizationId}`
          : `user:${invalidation.issuer}:${invalidation.subjectId}`;
      unique.set(key, invalidation);
    }

    for (const invalidation of unique.values()) {
      if (invalidation.kind === 'user') {
        await this.context.invalidateUser(
          invalidation.issuer,
          invalidation.subjectId,
        );
        continue;
      }
      const tenant = await this.tenants.findOneBy({
        organizationId: invalidation.organizationId,
      });
      if (tenant) await this.context.invalidateTenant(tenant.id);
    }
  }

  private invalidationForEvent(
    type: string,
    data: AccessEventData,
  ): Invalidation | null {
    if (isMembershipData(data)) {
      return {
        kind: 'user',
        issuer: data.identity_issuer,
        subjectId: data.subject_id,
      };
    }
    if (type in PRODUCT_STATES || type in ORGANIZATION_STATES) {
      return { kind: 'tenant', organizationId: data.organization_id };
    }
    return null;
  }
}

function isProductData(
  data: AccessEventData,
): data is Extract<AccessEventData, { product_code: string }> {
  return 'product_code' in data;
}

function isMembershipData(
  data: AccessEventData,
): data is Extract<AccessEventData, { identity_issuer: string }> {
  return 'identity_issuer' in data && 'subject_id' in data;
}

function isOrganizationData(
  data: AccessEventData,
): data is Extract<AccessEventData, { organization_id: string }> {
  return (
    !isProductData(data) && !isMembershipData(data) && 'organization_id' in data
  );
}

function nextTenantVersion(
  configuration: Record<string, unknown> | undefined,
  requestedVersion?: number,
) {
  const current =
    typeof configuration?.contextVersion === 'number'
      ? configuration.contextVersion
      : 0;
  return Math.max(current + 1, requestedVersion ?? 0);
}

function provisioningEvent(
  tenant: LegalProductTenant,
  version: number,
  event: AccessEvent,
): OutboundEvent {
  return {
    type: 'product.organization_product.provisioned.v1',
    ...eventMetadata(event),
    data: {
      organization_id: tenant.organizationId,
      product_code: PRODUCT,
      external_tenant_id: tenant.externalTenantId ?? tenant.id,
      provisioning_status: 'ready',
      tenant_status: 'provisioning',
      tenant_version: version,
    },
  };
}

function failedProvisioningEvent(
  tenant: LegalProductTenant,
  version: number,
  event: AccessEvent,
): OutboundEvent {
  return {
    type: 'product.organization_product.provisioning_failed.v1',
    ...eventMetadata(event),
    data: {
      organization_id: tenant.organizationId,
      product_code: PRODUCT,
      external_tenant_id: tenant.externalTenantId ?? tenant.id,
      provisioning_status: 'failed',
      tenant_status: 'failed',
      tenant_version: version,
    },
  };
}

function eventMetadata(event: AccessEvent) {
  const traceId = event.id ?? event.event_id ?? 'access-event';
  return {
    traceId,
    correlationId: event.correlationId ?? traceId,
    traceParent: event.traceParent ?? null,
    subject: event.subject ?? null,
  };
}

function parseRoleMap(value?: string) {
  const result = new Map<string, string>();
  for (const pair of value?.split(',') ?? []) {
    const [globalRole, localRole] = pair.split('=').map((item) => item.trim());
    if (globalRole && localRole) result.set(globalRole, localRole);
  }
  return result;
}
