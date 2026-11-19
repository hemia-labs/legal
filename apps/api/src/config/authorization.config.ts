import { registerAs } from '@nestjs/config';

export default registerAs('authorization', () => {
  const mode = process.env.HEMIA_AUTHORIZATION_MODE ?? 'roles';
  if (mode !== 'roles') {
    throw new Error('HEMIA_AUTHORIZATION_MODE must be roles');
  }
  return { mode };
});
