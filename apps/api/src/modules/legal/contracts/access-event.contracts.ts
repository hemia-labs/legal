import { PermanentError, type EventEnvelope } from '@hemia/event-bus';

export const ACCESS_EVENT_TYPES = [
  'access.organization_product.enable_requested.v1',
  'access.organization_product.provisioning.v1',
  'access.organization_product.enabled.v1',
  'access.organization_product.suspended.v1',
  'access.organization_product.disabled.v1',
  'access.organization_product.failed.v1',
  'access.organization.suspended.v1',
  'access.organization.archived.v1',
  'access.membership.suspended.v1',
  'access.membership.revoked.v1',
  'access.membership.role_assigned.v1',
  'access.membership.role_revoked.v1',
] as const;

export type AccessEventType = (typeof ACCESS_EVENT_TYPES)[number];

export const ACCESS_EVENT_QUEUE = 'hemia-legal.access';

export const ACCESS_EVENT_BINDINGS = [
  'access.organization_product.*.*',
  'access.organization.*.*',
  'access.membership.*.*',
] as const;

export type AccessOrganizationProductData = {
  organization_id: string;
  product_code: string;
  organization_name?: string;
  status?: 'pending' | 'provisioning' | 'enabled' | 'suspended' | 'disabled';
  provisioning_status?: 'pending' | 'ready' | 'failed';
  external_tenant_id?: string;
  context_version?: number;
};

export type AccessMembershipData = {
  organization_id: string;
  identity_issuer: string;
  subject_id: string;
  membership_status?: 'active' | 'suspended' | 'revoked';
  role_codes?: string[];
  context_version?: number;
};

export type AccessOrganizationData = {
  organization_id: string;
};

export type AccessEventData =
  AccessOrganizationProductData | AccessMembershipData | AccessOrganizationData;

export type AccessEventEnvelope = EventEnvelope<AccessEventData>;

const PRODUCT_EVENT_TYPES = new Set<string>([
  'access.organization_product.enable_requested.v1',
  'access.organization_product.provisioning.v1',
  'access.organization_product.enabled.v1',
  'access.organization_product.suspended.v1',
  'access.organization_product.disabled.v1',
  'access.organization_product.failed.v1',
]);

const MEMBERSHIP_EVENT_TYPES = new Set<string>([
  'access.membership.suspended.v1',
  'access.membership.revoked.v1',
  'access.membership.role_assigned.v1',
  'access.membership.role_revoked.v1',
]);

export function validateAccessEventData(
  type: string,
  value: unknown,
): AccessEventData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PermanentError(`Invalid payload for ${type}`);
  }

  const data = value as Record<string, unknown>;
  requireString(data, 'organization_id', type);

  if (PRODUCT_EVENT_TYPES.has(type)) {
    requireString(data, 'product_code', type);
    if (
      (type.endsWith('enabled.v1') ||
        data.provisioning_status === 'ready' ||
        data.status === 'enabled') &&
      !isString(data.external_tenant_id)
    ) {
      throw new PermanentError(`${type} requires external_tenant_id`);
    }
    if (
      data.context_version !== undefined &&
      typeof data.context_version !== 'number'
    ) {
      throw new PermanentError(`${type} has invalid context_version`);
    }
    return data as unknown as AccessOrganizationProductData;
  }

  if (MEMBERSHIP_EVENT_TYPES.has(type)) {
    requireString(data, 'identity_issuer', type);
    requireString(data, 'subject_id', type);
    if (
      (type.endsWith('role_assigned.v1') || type.endsWith('role_revoked.v1')) &&
      (!Array.isArray(data.role_codes) ||
        data.role_codes.some((role) => typeof role !== 'string'))
    ) {
      throw new PermanentError(`${type} requires role_codes`);
    }
    return data as unknown as AccessMembershipData;
  }

  return data as AccessOrganizationData;
}

function requireString(
  value: Record<string, unknown>,
  field: string,
  type: string,
): asserts value is Record<string, unknown> & Record<typeof field, string> {
  if (!isString(value[field])) {
    throw new PermanentError(`${type} requires ${field}`);
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
