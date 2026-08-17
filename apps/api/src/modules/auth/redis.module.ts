import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SecretsService } from '@hemia/secrets/nestjs';
import IORedis, { type RedisOptions } from 'ioredis';
import { SecretsModule } from '../secrets/secrets.module';
import { REDIS, RedisSessionStore } from './redis-session-store';
import { isRedisSecret, type RedisSecret } from './types/redis.types';

@Module({
  imports: [ConfigModule, SecretsModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService, SecretsService],
      useFactory: async (config: ConfigService, secrets: SecretsService) => {
        const redis = config.getOrThrow<RedisOptions>('redis');

        if (!config.get<boolean>('secrets.enabled', false)) {
          return new IORedis(redis);
        }

        const secret = await secrets.getRequired<RedisSecret>('cache/redis');
        if (!isRedisSecret(secret)) {
          throw new Error(
            'Secret cache/redis must contain redis_db, redis_host, redis_password and redis_port',
          );
        }

        return new IORedis({
          ...redis,
          host: secret.redis_host || redis.host,
          port: secret.redis_port,
          password: secret.redis_password || undefined,
          db: secret.redis_db,
        });
      },
    },
    RedisSessionStore,
  ],
  exports: [REDIS, RedisSessionStore],
})
export class RedisModule {}
