import { resolveEnvFilePath } from '../../../apps/api/src/config/env-file';

test.each(['production', 'test'])(
  '%s ignores developer environment files',
  (environment) => {
    expect(resolveEnvFilePath(environment)).toEqual([]);
  },
);
test('development keeps explicit local environment loading', () => {
  expect(resolveEnvFilePath('development')).toEqual(['.env', '.env.local']);
});
