import { randomUUID } from 'node:crypto';
import authorizationConfig from '../../../../apps/api/src/config/authorization.config';
import {
  grantsFor,
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
function assignment(role = 'legal.viewer') {
  return {
    assignment_id: randomUUID(),
    assignment_version: 1,
    role_code: role,
    resource_scope: { type: 'legal_global', ids: [] },
    consumer_scope: { type: 'not_applicable', organization_ids: [] },
    valid_from: 1,
    expires_at: null,
  };
}
function assigned(role = 'legal.viewer') {
  return { ...claims(), assignments: [assignment(role)] };
}
describe('Legal role authorization', () => {
  it('denies assignment-free signed contexts and never synthesizes grants', () => {
    expect(() => validateLegalContext(claims(), expected)).toThrow();
    const auth = {
      assignments: [],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
    expect(() => grantsFor(auth, 'legal.issuers.create')).toThrow();
    expect(permissionsForAuthorization(auth)).toEqual([]);
  });
  it('allows assigned reads and denies viewer mutations', () => {
    const auth = validateLegalContext(assigned(), expected);
    expect(grantsFor(auth, 'legal.documents.view')).toHaveLength(1);
    expect(permissionsForAuthorization(auth)).toContain('legal.documents.view');
    for (const permission of [
      'legal.documents.create',
      'legal.integrations.edit',
      'legal.notifications.retry',
    ]) {
      expect(() => grantsFor(auth, permission)).toThrow();
      expect(permissionsForAuthorization(auth)).not.toContain(permission);
    }
  });
  it.each([
    'sub',
    'aud',
    'identity_issuer',
    'identity_reference_id',
    'organization_id',
    'membership_id',
    'product_code',
  ])('denies wrong %s bindings with otherwise valid grants', (key) => {
    expect(() =>
      validateLegalContext({ ...assigned(), [key]: randomUUID() }, expected),
    ).toThrow();
  });
  it('denies expired, extended, malformed and revoked contexts', () => {
    for (const patch of [
      { exp: 1 },
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      { assignments: [{}] },
      { extra: true },
      { assignments: [] },
    ]) {
      expect(() =>
        validateLegalContext({ ...assigned(), ...patch }, expected),
      ).toThrow();
    }
    const auth = validateLegalContext(assigned(), expected);
    expect(() =>
      grantsFor({ ...auth, expiresAt: 1 }, 'legal.documents.view'),
    ).toThrow();
    expect(() =>
      permissionsForAuthorization({ ...auth, expiresAt: 1 }),
    ).toThrow();
    const expired = {
      ...auth,
      assignments: auth.assignments.map((a) => ({ ...a, expires_at: 1 })),
    };
    expect(() => grantsFor(expired, 'legal.documents.view')).toThrow();
    expect(permissionsForAuthorization(expired)).toEqual([]);
  });
  it('requires explicit consumer grants and keeps evidence organization scoped', () => {
    const context = assigned('legal.auditor');
    context.assignments[0].consumer_scope = {
      type: 'organizations',
      organization_ids: [expected.organizationId],
    };
    const auth = validateLegalContext(context, expected);
    const audit = scopePredicate(auth, 'legal.audit.view', 'audit_events');
    expect(audit.sql).toContain('ev.organization_id = ANY');
    expect(audit.parameters.lc0).toEqual([expected.organizationId]);
  });
  it('accepts only roles in every environment and defaults to roles', () => {
    const original = process.env.HEMIA_AUTHORIZATION_MODE;
    try {
      delete process.env.HEMIA_AUTHORIZATION_MODE;
      expect(authorizationConfig().mode).toBe('roles');
      process.env.HEMIA_AUTHORIZATION_MODE = 'roles';
      expect(authorizationConfig().mode).toBe('roles');
      for (const mode of ['authenticated', 'invalid', '']) {
        process.env.HEMIA_AUTHORIZATION_MODE = mode;
        expect(() => authorizationConfig()).toThrow('HEMIA_AUTHORIZATION_MODE');
      }
    } finally {
      if (original === undefined) delete process.env.HEMIA_AUTHORIZATION_MODE;
      else process.env.HEMIA_AUTHORIZATION_MODE = original;
    }
  });
});
