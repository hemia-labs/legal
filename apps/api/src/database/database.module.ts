import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';
import { SecretsModule } from '../modules/secrets/secrets.module';
import { SecretsService } from '@hemia/secrets/nestjs';
import type { DataSourceOptions } from 'typeorm';
import databaseConfig from '../config/database.config';
import { isDatabaseSecret, type DatabaseSecret } from './types/database.types';

@Module({
  imports: [
    SecretsModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forFeature(databaseConfig), SecretsModule],
      inject: [ConfigService, SecretsService],
      useFactory: async (
        config: ConfigService,
        secrets: SecretsService,
      ): Promise<DataSourceOptions> => {
        const options: DataSourceOptions = {
          type: 'postgres',
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
          logging: config.get<boolean>('database.logging'),
          extra: { options: '-c timezone=America/Mexico_City' },
          entities: [
            path.join(__dirname, '..', '**', '*.entity.ts'),
            path.join(__dirname, '..', '**', '*.entity.js'),
          ],
          synchronize: false,
        };

        if (!config.get<boolean>('secrets.enabled', false)) {
          return options;
        }

        const secret = await secrets.getRequired<DatabaseSecret>(
          'database/postgres',
        );

        if (!isDatabaseSecret(secret)) {
          throw new Error(
            'Secret database/postgres must contain db_host, db_port, db_username, db_password, db_database and db_logging',
          );
        }

        return {
          ...options,
          host: secret.db_host,
          port: secret.db_port,
          username: secret.db_username,
          password: secret.db_password,
          database: secret.db_database,
          logging: secret.db_logging,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
