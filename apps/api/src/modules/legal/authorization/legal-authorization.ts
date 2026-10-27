import type { AuthorizationMode } from '../../../config/authorization.config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LEGAL_ROLES } from './legal-role-catalog';

export type LegalAssignment = {
  assignment_id: string;
  assignment_version: number;
  role_code: string;
  resource_scope: { type: string; ids: string[] };
  consumer_scope: { type: string; organization_ids: string[] };
  valid_from: number;
  expires_at: number | null;
};
export type LegalGrant = Pick<
  LegalAssignment,
  'resource_scope' | 'consumer_scope'
> & {
  role_code?: string;
  managesCatalog?: boolean;
};
export type LegalAuthorization = {
  authenticatedOrganizationId?: string;
  assignments: LegalAssignment[];
  expiresAt: number;
};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
function deny(): never {
  throw new ForbiddenException('Invalid Legal authorization context');
}

/** Called only after SDK signature/issuer/audience/type verification. */
export function validateLegalContext(
  claims: Record<string, unknown>,
  expected: {
    subject: string;
    issuer: string;
    identityReferenceId: string;
    organizationId: string;
    membershipId: string;
  },
  mode: AuthorizationMode = 'roles',
): LegalAuthorization {
  if (
    claims.contract_version !== 1 ||
    ![1, 2].includes(claims.catalog_version as number)
  )
    throw new ConflictException('LEGAL_AUTHORIZATION_CONTRACT_MISMATCH');
  const now = Math.floor(Date.now() / 1000);
  if (
    !exact(claims, [
      'iss',
      'aud',
      'sub',
      'identity_issuer',
      'identity_reference_id',
      'organization_id',
      'membership_id',
      'product_code',
      'contract_version',
      'catalog_version',
      'context_version',
      'jti',
      'iat',
      'nbf',
      'exp',
      'assignments',
    ]) ||
    claims.sub !== expected.subject ||
    claims.identity_issuer !== expected.issuer ||
    claims.identity_reference_id !== expected.identityReferenceId ||
    claims.organization_id !== expected.organizationId ||
    claims.membership_id !== expected.membershipId ||
    !uuid(claims.identity_reference_id) ||
    !uuid(claims.organization_id) ||
    !uuid(claims.membership_id) ||
    !uuid(claims.jti) ||
    claims.product_code !== 'legal' ||
    claims.aud !== 'legal-api' ||
    !integer(claims.context_version) ||
    !integer(claims.iat) ||
    !integer(claims.nbf) ||
    !integer(claims.exp) ||
    claims.iat > now ||
    claims.nbf > now ||
    claims.exp <= now ||
    claims.exp <= claims.iat ||
    claims.exp > claims.iat + 300 ||
    !Array.isArray(claims.assignments) ||
    (mode === 'roles'
      ? !claims.assignments.length
      : claims.assignments.length !== 0) ||
    claims.assignments.length > 64
  )
    deny();
  if (mode === 'authenticated') {
    if (claims.catalog_version !== 2) deny();
    return {
      assignments: [],
      expiresAt: claims.exp,
      authenticatedOrganizationId: expected.organizationId,
    };
  }
  const assignments: LegalAssignment[] = [];
  const seen = new Set<string>();
  let targetCount = 0;
  for (const value of claims.assignments as unknown[]) {
    if (
      !record(value) ||
      !exact(value, [
        'assignment_id',
        'assignment_version',
        'role_code',
        'resource_scope',
        'consumer_scope',
        'valid_from',
        'expires_at',
      ]) ||
      !uuid(value.assignment_id) ||
      seen.has(value.assignment_id) ||
      !integer(value.assignment_version) ||
      !integer(value.valid_from) ||
      value.valid_from > now ||
      !(
        value.expires_at === null ||
        (integer(value.expires_at) &&
          value.expires_at > now &&
          value.expires_at > value.valid_from &&
          claims.exp <= value.expires_at)
      ) ||
      !record(value.resource_scope) ||
      !record(value.consumer_scope)
    )
      deny();
    const role = LEGAL_ROLES.find((r) => r.code === value.role_code);
    if (
      !role ||
      (role.code === 'legal.integration_manager' &&
        claims.catalog_version !== 2) ||
      !(role.allowedResourceScopeTypes as readonly string[]).includes(
        value.resource_scope.type as string,
      ) ||
      !(role.allowedConsumerScopeTypes as readonly string[]).includes(
        value.consumer_scope.type as string,
      )
    )
      deny();
    for (const [scope, key, selected] of [
      [
        value.resource_scope,
        'ids',
        value.resource_scope.type !== 'legal_global',
      ],
      [
        value.consumer_scope,
        'organization_ids',
        value.consumer_scope.type === 'organizations',
      ],
    ] as const) {
      const ids = scope[key];
      if (
        !exact(scope, ['type', key]) ||
        !Array.isArray(ids) ||
        !ids.every(uuid) ||
        new Set(ids.map((id) => id.toLowerCase())).size !== ids.length ||
        (selected ? !ids.length : ids.length !== 0)
      )
        deny();
      targetCount += ids.length;
    }
    seen.add(value.assignment_id);
    assignments.push(value as unknown as LegalAssignment);
  }
  if (targetCount > 1000) deny();
  return { assignments, expiresAt: claims.exp };
}

export function grantsFor(
  auth: LegalAuthorization | undefined,
  permission: string,
): LegalGrant[] {
  const now = Date.now() / 1000;
  if (!auth || auth.expiresAt <= now) deny();
  if (auth.authenticatedOrganizationId) {
    if (
      !uuid(auth.authenticatedOrganizationId) ||
      !allPermissions().includes(permission)
    )
      deny();
    return [
      {
        resource_scope: { type: 'legal_global', ids: [] },
        consumer_scope: {
          type: 'organizations',
          organization_ids: [auth.authenticatedOrganizationId],
        },
        managesCatalog: true,
      },
    ];
  }
  const grants = auth.assignments.filter(
    (a) =>
      a.valid_from <= now &&
      (a.expires_at === null || a.expires_at > now) &&
      LEGAL_ROLES.some(
        (r) =>
          r.code === a.role_code &&
          (r.permissions as readonly string[]).includes(permission),
      ),
  );
  if (!grants.length) deny();
  return grants;
}
export function permissionsForAuthorization(
  auth: LegalAuthorization,
): string[] {
  if (auth.authenticatedOrganizationId) {
    if (
      !uuid(auth.authenticatedOrganizationId) ||
      auth.expiresAt <= Date.now() / 1000
    )
      deny();
    return allPermissions();
  }
  return [
    ...new Set(
      auth.assignments.flatMap(
        (a) =>
          LEGAL_ROLES.find((r) => r.code === a.role_code)?.permissions ?? [],
      ),
    ),
  ];
}

function allPermissions(): string[] {
  return [...new Set(LEGAL_ROLES.flatMap((role) => [...role.permissions]))];
}

// Authenticated-mode humans may not delegate broader consumer access to a machine.
export function consumerOrganizationsAllowed(
  auth: LegalAuthorization | undefined,
  organizationIds: string[],
): boolean {
  const selected = auth?.authenticatedOrganizationId;
  return (
    !selected ||
    (organizationIds.length > 0 &&
      organizationIds.every(
        (id) => id.toLowerCase() === selected.toLowerCase(),
      ))
  );
}
