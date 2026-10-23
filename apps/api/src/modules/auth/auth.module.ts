import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { SsoConfig } from '@hemia/auth';
import { SESSION_STORE, SsoModule } from '@hemia/auth/nestjs';
import { RedisModule } from './redis/redis.module';
import { RedisSessionStore } from './redis/redis-session-store';

@Module({
  imports: [
    SsoModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService],
      store: { provide: SESSION_STORE, useExisting: RedisSessionStore },
      useFactoryConfig: (config: ConfigService): SsoConfig =>
        config.getOrThrow<SsoConfig>('sso'),
    }),
  ],
})
export class AuthModule {}
