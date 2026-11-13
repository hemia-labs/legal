import { registerAs } from '@nestjs/config';

export type AuthorizationMode = 'roles' | 'authenticated';

export type PlatformOperatorBinding = {
  identityIssuer: string;
  subjectId: string;
  organizationId: string;
  applicationIds: string[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Organizations whose members operate system-wide Legal policies in authenticated mode. */
export function platformOrganizationIds(value: string | undefined): string[] {
  const ids = (value ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  if (ids.some((id) => !UUID.test(id)) || new Set(ids).size !== ids.length)
    throw new Error(
      'LEGAL_PLATFORM_ORGANIZATION_IDS must be a comma-separated list of distinct UUIDs',
    );
  return ids;
}

/** Explicit identities allowed to manage shared policies for selected applications. */
export function platformOperatorBindings(
  value: string | undefined,
  organizationIds: readonly string[] = [],
): PlatformOperatorBinding[] {
  if (!value?.trim()) return [];
  const invalid = () => {
    throw new Error('Invalid LEGAL_PLATFORM_OPERATOR_BINDINGS configuration');
  };
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    return invalid();
  }
  if (!Array.isArray(input) || input.length > 100) return invalid();
  const seen = new Set<string>();
  const broadOrganizations = new Set(
    organizationIds.map((id) => id.toLowerCase()),
  );
  return input.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      return invalid();
    const row = entry as Record<string, unknown>;
    const keys = [
      'identityIssuer',
      'subjectId',
      'organizationId',
      'applicationIds',
    ];
    if (
      Object.keys(row).length !== keys.length ||
      !keys.every((key) => Object.hasOwn(row, key)) ||
      typeof row.identityIssuer !== 'string' ||
      !row.identityIssuer.length ||
      row.identityIssuer.length > 2048 ||
      /[\s\p{Cc}]/u.test(row.identityIssuer) ||
      typeof row.subjectId !== 'string' ||
      !row.subjectId.length ||
      row.subjectId.length > 255 ||
      /[\s\p{Cc}]/u.test(row.subjectId) ||
      typeof row.organizationId !== 'string' ||
      !UUID.test(row.organizationId) ||
      !Array.isArray(row.applicationIds) ||
      !row.applicationIds.length ||
      row.applicationIds.length > 1000 ||
      !row.applicationIds.every((id) => typeof id === 'string' && UUID.test(id))
    )
      return invalid();
    let issuer: URL;
    try {
      issuer = new URL(row.identityIssuer);
    } catch {
      return invalid();
    }
    if (
      issuer.protocol !== 'https:' ||
      !/^https:\/\//i.test(row.identityIssuer) ||
      /^https:\/\/[^/?#]*@/i.test(row.identityIssuer) ||
      row.identityIssuer.includes('\\') ||
      !issuer.hostname ||
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash ||
      row.identityIssuer.includes('?') ||
      row.identityIssuer.includes('#')
    )
      return invalid();
    const organizationId = row.organizationId.toLowerCase();
    const applicationIds = row.applicationIds.map((id: string) =>
      id.toLowerCase(),
    );
    const key = JSON.stringify([
      row.identityIssuer,
      row.subjectId,
      organizationId,
    ]);
    if (new Set(applicationIds).size !== applicationIds.length || seen.has(key))
      return invalid();
    if (broadOrganizations.has(organizationId))
      throw new Error(
        'LEGAL_PLATFORM_OPERATOR_BINDINGS cannot overlap LEGAL_PLATFORM_ORGANIZATION_IDS',
      );
    seen.add(key);
    return {
      identityIssuer: row.identityIssuer,
      subjectId: row.subjectId,
      organizationId,
      applicationIds,
    };
  });
}

export default registerAs('authorization', () => {
  const mode = process.env.HEMIA_AUTHORIZATION_MODE ?? 'roles';
  if (mode !== 'roles' && mode !== 'authenticated') {
    throw new Error('HEMIA_AUTHORIZATION_MODE must be roles or authenticated');
  }
  const organizationIds = platformOrganizationIds(
    process.env.LEGAL_PLATFORM_ORGANIZATION_IDS,
  );
  return {
    mode,
    platformOrganizationIds: organizationIds,
    platformOperatorBindings: platformOperatorBindings(
      process.env.LEGAL_PLATFORM_OPERATOR_BINDINGS,
      organizationIds,
    ),
  };
});
