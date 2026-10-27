import { registerAs } from '@nestjs/config';

export type AuthorizationMode = 'roles' | 'authenticated';

export default registerAs('authorization', () => {
  const mode = process.env.HEMIA_AUTHORIZATION_MODE ?? 'roles';
  if (mode !== 'roles' && mode !== 'authenticated') {
    throw new Error('HEMIA_AUTHORIZATION_MODE must be roles or authenticated');
  }
  return { mode };
});
