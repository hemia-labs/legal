import { registerAs } from '@nestjs/config';

export type AuthorizationMode = 'roles' | 'authenticated';

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

export default registerAs('authorization', () => {
  const mode = process.env.HEMIA_AUTHORIZATION_MODE ?? 'roles';
  if (mode !== 'roles' && mode !== 'authenticated') {
    throw new Error('HEMIA_AUTHORIZATION_MODE must be roles or authenticated');
  }
  return {
    mode,
    platformOrganizationIds: platformOrganizationIds(
      process.env.LEGAL_PLATFORM_ORGANIZATION_IDS,
    ),
  };
});
