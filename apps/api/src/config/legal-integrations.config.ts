import { registerAs } from '@nestjs/config';
export default registerAs('legalIntegrations', () => ({
  directoryUrl:
    process.env.LEGAL_IDENTITY_CLIENTS_URL ??
    `${process.env.SSO_ISSUER ?? 'http://localhost:4000'}/api/v1/oauth-clients`,
  production: process.env.NODE_ENV === 'production',
}));
