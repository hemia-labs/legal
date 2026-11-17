import type { RedisOptions } from 'ioredis';

export type RedisSecret = {
  redis_db: number;
  redis_host: string;
  redis_password: string;
  redis_port: number;
};

export function isRedisSecret(value: unknown): value is RedisSecret {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const secret = value as Record<string, unknown>;

  return (
    typeof secret.redis_db === 'number' &&
    Number.isInteger(secret.redis_db) &&
    secret.redis_db >= 0 &&
    typeof secret.redis_host === 'string' &&
    typeof secret.redis_password === 'string' &&
    typeof secret.redis_port === 'number' &&
    Number.isInteger(secret.redis_port) &&
    secret.redis_port > 0
  );
}

// Development may change transport only; Vault still owns credentials and DB.
export function redisConnectionOptions(
  redis: RedisOptions,
  secret: RedisSecret | undefined,
  localTransport = false,
  environment = process.env.NODE_ENV ?? 'development',
): RedisOptions {
  if (
    localTransport &&
    (!['development', 'test'].includes(environment) ||
      !['localhost', '127.0.0.1', '::1'].includes(redis.host ?? '') ||
      !Number.isInteger(redis.port) ||
      redis.port! < 1 ||
      redis.port! > 65535)
  ) {
    throw new Error(
      'Local Redis transport requires development/test and a loopback host with a valid port',
    );
  }
  if (!secret) return redis;
  return {
    ...redis,
    host: localTransport ? redis.host : secret.redis_host || redis.host,
    port: localTransport ? redis.port : secret.redis_port,
    password: secret.redis_password || undefined,
    db: secret.redis_db,
  };
}
