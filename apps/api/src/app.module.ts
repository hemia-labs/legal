import authorizationConfig from './config/authorization.config';
import { envFilePath } from './config/env-file';
import legalServiceConfig from './config/legal-service.config';
import legalIntegrationsConfig from './config/legal-integrations.config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import ssoConfig from './config/sso.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { LegalModule } from './modules/legal/legal.module';
import storageConfig from './config/storage.config';
import { StorageModule } from './modules/storage/storage.module';
import eventBusConfig from './config/event-bus.config';
import { SecretsModule } from './modules/secrets/secrets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      load: [
        authorizationConfig,
        legalServiceConfig,
        legalIntegrationsConfig,
        databaseConfig,
        redisConfig,
        ssoConfig,
        storageConfig,
        eventBusConfig,
      ],
    }),
    AuthModule,
    StorageModule,
    SecretsModule,
    DatabaseModule,
    LegalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
