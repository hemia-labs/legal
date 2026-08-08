import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { REDIS, RedisSessionStore } from './redis-session-store';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.getOrThrow('redis')),
    },
    RedisSessionStore,
  ],
  exports: [REDIS, RedisSessionStore],
})
export class RedisModule {}
