import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SecretsService } from '@hemia/secrets/nestjs';
import IORedis, { type RedisOptions } from 'ioredis';
import { SecretsModule } from '../../secrets/secrets.module';
import { REDIS, RedisSessionStore } from './redis-session-store';
import {
  isRedisSecret,
  redisConnectionOptions,
  type RedisSecret,
} from './redis.types';

@Module({
  imports: [ConfigModule, SecretsModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService, SecretsService],
      useFactory: async (config: ConfigService, secrets: SecretsService) => {
        const { localTransport, ...redis } = config.getOrThrow<
          RedisOptions & { localTransport?: boolean }
        >('redis');

        if (!config.get<boolean>('secrets.enabled', false)) {
          return new IORedis(
            redisConnectionOptions(redis, undefined, localTransport),
          );
        }

        const secret = await secrets.getRequired<RedisSecret>('cache/redis');
        if (!isRedisSecret(secret)) {
          throw new Error(
            'Secret cache/redis must contain redis_db, redis_host, redis_password and redis_port',
          );
        }

        return new IORedis(
          redisConnectionOptions(redis, secret, localTransport),
        );
      },
    },
    RedisSessionStore,
  ],
  exports: [REDIS, RedisSessionStore],
})
export class RedisModule {}
