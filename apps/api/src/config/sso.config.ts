import { registerAs } from '@nestjs/config';
import { validateConfig, type SsoConfig } from '@hemia/auth';

const env = (name: string) => process.env[name] || undefined;
const trimSlash = (value: string) =>
  value.endsWith('/') ? value.slice(0, -1) : value;

export default registerAs('sso', (): SsoConfig => {
  const issuer = trimSlash(env('SSO_ISSUER') ?? 'http://localhost:4000');
  const accessApiUrl = trimSlash(
    env('ACCESS_API_URL') ?? 'http://localhost:3019',
  );
  const productCode = env('PRODUCT_CODE') ?? 'legal';

  const config = validateConfig({
    issuer,
    clientId: env('SSO_CLIENT_ID') ?? 'legal',
    clientSecret: env('SSO_CLIENT_SECRET'),
    audience: env('SSO_AUDIENCE') ?? 'legal-api',
    jwksUrl: env('SSO_JWKS_URL') ?? `${issuer}/.well-known/jwks.json`,
    authorizationUrl:
      env('SSO_AUTHORIZATION_URL') ?? `${issuer}/oauth/authorize`,
    tokenUrl: env('SSO_TOKEN_URL') ?? `${issuer}/oauth/token`,
    revocationUrl: env('SSO_REVOCATION_URL') ?? `${issuer}/oauth/revoke`,
    logoutUrl: env('SSO_LOGOUT_URL') ?? `${issuer}/oauth/logout`,
    redirectUri:
      env('SSO_REDIRECT_URI') ?? 'http://localhost:3017/auth/callback',
    frontendUrl: env('SSO_FRONTEND_URL') ?? 'http://localhost:5180',
    scope:
      env('SSO_SCOPE') ??
      `openid profile email offline_access ${productCode}.access`,
    cookieName: env('SSO_COOKIE_NAME') ?? `${productCode}_session`,
    sessionTtlSeconds: Number(env('SSO_SESSION_TTL_SECONDS') ?? 600),
    cookieSecure:
      process.env.SSO_COOKIE_SECURE === 'true' ||
      process.env.NODE_ENV === 'production',
    access: {
      apiBaseUrl: accessApiUrl,
      jwksUrl:
        env('ACCESS_JWKS_URI') ?? `${accessApiUrl}/.well-known/jwks.json`,
      audience: env('ACCESS_AUDIENCE') ?? 'access-api',
    },
    service: {
      apiBaseUrl: accessApiUrl,
      clientId: env('ACCESS_SERVICE_CLIENT_ID') ?? '',
      clientSecret: env('ACCESS_SERVICE_CLIENT_SECRET') ?? '',
      scopes: env('ACCESS_SERVICE_SCOPE') ?? 'product_instances.write',
    },
    productCode: productCode,
    requireDistributedRefreshLock: true,
    onUserResolved: (user) => Promise.resolve({ internalUserId: user.sub }),
  });
  return {
    ...config,
    accessEventScope: env('ACCESS_EVENT_SCOPE') ?? 'events.consume',
    legalAccessRoleMap:
      env('LEGAL_ACCESS_ROLE_MAP') ??
      'organization_owner=legal.admin,organization_admin=legal.admin',
  } as SsoConfig & {
    accessEventScope: string;
    legalAccessRoleMap: string;
  };
});
