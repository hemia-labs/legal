import { randomUUID } from 'node:crypto';
import authorizationConfig, {
  platformOrganizationIds,
} from '../../../../apps/api/src/config/authorization.config';
import {
  consumerOrganizationsAllowed,
  grantsFor,
  isPlatformOperator,
  permissionsForAuthorization,
  validateLegalContext,
} from '../../../../apps/api/src/modules/legal/authorization/legal-authorization';
import { scopePredicate } from '../../../../apps/api/src/modules/legal/authorization/legal-scope';

const expected = {
  subject: 'person',
  issuer: 'https://id.test',
  identityReferenceId: randomUUID(),
  organizationId: randomUUID(),
  membershipId: randomUUID(),
};
function claims() {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://access.test',
    aud: 'legal-api',
    sub: expected.subject,
    identity_issuer: expected.issuer,
    identity_reference_id: expected.identityReferenceId,
    organization_id: expected.organizationId,
    membership_id: expected.membershipId,
    product_code: 'legal',
    contract_version: 1,
    catalog_version: 2,
    context_version: 1,
    jti: randomUUID(),
    iat: now,
    nbf: now,
    exp: now + 300,
    assignments: [],
  };
}
describe('Authenticated Legal action policy', () => {
  it('requires an explicit flag; the default still denies empty role assignments', () => {
    expect(() => validateLegalContext(claims(), expected)).toThrow();
    const auth = validateLegalContext(claims(), expected, 'authenticated');
    expect(auth.assignments).toEqual([]);
    expect(grantsFor(auth, 'legal.issuers.create')[0]).toEqual({
      resource_scope: { type: 'legal_global', ids: [] },
      consumer_scope: {
        type: 'organizations',
        organization_ids: [expected.organizationId],
      },
      managesCatalog: true,
    });
    expect(grantsFor(auth, 'legal.issuers.create')[0]).not.toHaveProperty(
      'role_code',
    );
    expect(permissionsForAuthorization(auth)).toContain(
      'legal.integrations.create',
    );
    expect(() => grantsFor(auth, 'legal.unknown.permission')).toThrow();
  });
  it.each([
    'sub',
    'aud',
    'identity_issuer',
    'identity_reference_id',
    'organization_id',
    'membership_id',
    'product_code',
  ])('still denies wrong %s bindings without roles', (key) => {
    expect(() =>
      validateLegalContext(
        { ...claims(), [key]: randomUUID() },
        expected,
        'authenticated',
      ),
    ).toThrow();
  });
  it('denies expired, extended, malformed and old-mode contexts', () => {
    for (const patch of [
      { exp: 1 },
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      { catalog_version: 1 },
      { assignments: [{}] },
      { extra: true },
      { assignments: null },
    ]) {
      expect(() =>
        validateLegalContext(
          { ...claims(), ...patch },
          expected,
          'authenticated',
        ),
      ).toThrow();
    }
    const auth = validateLegalContext(claims(), expected, 'authenticated');
    expect(() =>
      grantsFor({ ...auth, expiresAt: 1 }, 'legal.issuers.create'),
    ).toThrow();
  });
  it('keeps consumer evidence in the selected organization without exposing all_organizations', () => {
    const auth = validateLegalContext(claims(), expected, 'authenticated');
    const scoped = scopePredicate(
      auth,
      'legal.notifications.view',
      'notifications',
    );
    expect(scoped.sql).toContain('t.organization_id = ANY');
    expect(scoped.parameters.lc0).toEqual([expected.organizationId]);
    const audit = scopePredicate(auth, 'legal.audit.view', 'audit_events');
    expect(audit.sql).toContain('ev.organization_id = ANY');
  });
  it('uses a validated explicit mode in development and production and defaults to roles', () => {
    const old = process.env.HEMIA_AUTHORIZATION_MODE;
    const oldNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.HEMIA_AUTHORIZATION_MODE;
      expect(authorizationConfig().mode).toBe('roles');
      process.env.HEMIA_AUTHORIZATION_MODE = 'authenticated';
      for (const environment of ['development', 'production']) {
        process.env.NODE_ENV = environment;
        expect(authorizationConfig().mode).toBe('authenticated');
      }
      process.env.HEMIA_AUTHORIZATION_MODE = 'invalid';
      expect(() => authorizationConfig()).toThrow('HEMIA_AUTHORIZATION_MODE');
    } finally {
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
      if (old === undefined) delete process.env.HEMIA_AUTHORIZATION_MODE;
      else process.env.HEMIA_AUTHORIZATION_MODE = old;
    }
  });
  it('parses platform organizations and limits them to unrestricted policies', () => {
    const platform = randomUUID();
    expect(platformOrganizationIds(undefined)).toEqual([]);
    expect(
      platformOrganizationIds(' ' + platform.toUpperCase() + ' , '),
    ).toEqual([platform]);
    expect(() => platformOrganizationIds('not-a-uuid')).toThrow(
      'LEGAL_PLATFORM_ORGANIZATION_IDS',
    );
    expect(() => platformOrganizationIds(platform + ',' + platform)).toThrow(
      'LEGAL_PLATFORM_ORGANIZATION_IDS',
    );
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const own = {
      assignments: [],
      expiresAt,
      authenticatedOrganizationId: platform,
    };
    const foreign = { ...own, authenticatedOrganizationId: randomUUID() };
    expect(isPlatformOperator(own, [platform])).toBe(true);
    expect(isPlatformOperator(foreign, [platform])).toBe(false);
    expect(isPlatformOperator({ ...own, expiresAt: 1 }, [platform])).toBe(
      false,
    );
    expect(isPlatformOperator({ assignments: [], expiresAt }, [platform])).toBe(
      false,
    );
    expect(consumerOrganizationsAllowed(own, [], true)).toBe(true);
    expect(consumerOrganizationsAllowed(own, [], false)).toBe(false);
    expect(consumerOrganizationsAllowed(foreign, [], false)).toBe(false);
    expect(consumerOrganizationsAllowed(own, [randomUUID()], true)).toBe(false);
    expect(consumerOrganizationsAllowed(own, [platform], true)).toBe(true);
    expect(
      consumerOrganizationsAllowed({ assignments: [], expiresAt }, [], false),
    ).toBe(true);
  });
});
