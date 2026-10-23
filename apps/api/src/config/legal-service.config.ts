import { registerAs } from '@nestjs/config';
export default registerAs('legalService', () => ({
  clientId: process.env.LEGAL_SERVICE_CLIENT_ID ?? '',
  catalogClientId:
    process.env.LEGAL_CATALOG_CLIENT_ID ?? 'console-identity-admin',
  clientSecret: process.env.LEGAL_SERVICE_CLIENT_SECRET ?? '',
  introspectionUrl:
    process.env.LEGAL_INTROSPECTION_URL ??
    `${process.env.SSO_ISSUER ?? 'http://localhost:4000'}/oauth/introspect`,
  production: process.env.NODE_ENV === 'production',
}));
