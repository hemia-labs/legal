import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SecretsModule as HemiaSecretsModule } from '@hemia/secrets/nestjs';
import type { Category, Environment } from '@hemia/secrets';
import secretsConfig from '../../config/secrets.config';

const secretsConfigModule = ConfigModule.forFeature(secretsConfig);
const secretsProviderModule = HemiaSecretsModule.forRootAsync<[ConfigService]>({
  imports: [secretsConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    scope: {
      environment: config.get<Environment>('secrets.environment', 'dev'),
      category: config.get<Category>('secrets.category', 'internal'),
      owner: config.get<string>('secrets.owner', 'hemia'),
      system: config.get<string>('secrets.system', 'legal'),
    },
    provider: {
      type: 'hashicorp-vault' as const,
      options: {
        baseUrl: config.get<string>('secrets.baseUrl', ''),
        roleId: config.get<string>('secrets.roleId', ''),
        secretId: config.get<string>('secrets.secretId', ''),
        authPath: config.get<string>('secrets.authPath', 'approle'),
        mountPrefix: config.get<string>('secrets.mountPrefix', 'kv-'),
        timeoutMs: config.get<number>('secrets.timeoutMs', 5000),
      },
    },
    cache: {
      enabled: config.get<boolean>('secrets.cacheEnabled', false),
      ttlMs: config.get<number>('secrets.cacheTtlMs', 60000),
    },
  }),
});

@Module({
  imports: [secretsConfigModule, secretsProviderModule],
  exports: [secretsProviderModule],
})
export class SecretsModule {}
