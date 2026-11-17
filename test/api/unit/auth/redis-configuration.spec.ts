import { redisConnectionOptions } from '../../../../apps/api/src/modules/auth/redis/redis.types';

const secret = {
  redis_host: 'vault-cache',
  redis_port: 6380,
  redis_password: 'synthetic-vault-password',
  redis_db: 3,
};
const local = {
  host: '127.0.0.1',
  port: 6381,
  password: 'must-not-override-vault',
  db: 9,
};

test('Vault remains authoritative unless local development transport is explicitly enabled', () => {
  expect(redisConnectionOptions(local, secret)).toMatchObject({
    host: secret.redis_host,
    port: secret.redis_port,
    password: secret.redis_password,
    db: secret.redis_db,
  });
  expect(redisConnectionOptions(local, undefined)).toEqual(local);
});
test('local transport preserves the Vault password and database', () => {
  expect(redisConnectionOptions(local, secret, true, 'development')).toEqual({
    ...local,
    password: secret.redis_password,
    db: secret.redis_db,
  });
});
test('local transport cannot override production or connect outside loopback', () => {
  for (const environment of ['production', 'staging'])
    expect(() =>
      redisConnectionOptions(local, secret, true, environment),
    ).toThrow('Local Redis transport');
  for (const host of ['remote-cache', '0.0.0.0', '127.0.0.1.evil.test', ''])
    expect(() =>
      redisConnectionOptions({ ...local, host }, secret, true, 'development'),
    ).toThrow('Local Redis transport');
  for (const port of [0, -1, 65536, 1.5, NaN])
    expect(() =>
      redisConnectionOptions({ ...local, port }, secret, true, 'development'),
    ).toThrow('Local Redis transport');
});
