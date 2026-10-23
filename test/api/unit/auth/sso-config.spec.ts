import ssoConfig from '../../../../apps/api/src/config/sso.config';

const previousEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...previousEnvironment };
});

function defaults() {
  delete process.env.SSO_SCOPE;
  delete process.env.PRODUCT_CODE;
  process.env.SSO_CLIENT_SECRET = 'synthetic-test-only';
}

describe('SSO scopes', () => {
  it('requests the eight existing login and personal scopes exactly once by default', () => {
    defaults();
    const scopes = ssoConfig().scope.split(/\s+/);
    expect(scopes).toEqual([
      'openid',
      'profile',
      'email',
      'offline_access',
      'legal.access',
      'legal.self.pending.read',
      'legal.self.acceptances.create',
      'legal.self.acceptances.read',
    ]);
    expect(new Set(scopes).size).toBe(8);
  });

  it('preserves an explicit scope override', () => {
    defaults();
    process.env.SSO_SCOPE = 'openid profile legal.access';
    expect(ssoConfig().scope).toBe('openid profile legal.access');
  });
});
