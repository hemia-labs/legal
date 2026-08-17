import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SecretsService } from '@hemia/secrets/nestjs';
import storageConfig from '../../config/storage.config';
import { SecretsModule } from '../secrets/secrets.module';
import { S3StorageService } from './s3-storage.service';
import { isS3Secret, type S3Secret } from './types/s3.types';
import type { StorageConfig } from './types/storage.types';

@Module({
  imports: [ConfigModule.forFeature(storageConfig), SecretsModule],
  providers: [
    {
      provide: S3StorageService,
      inject: [ConfigService, SecretsService],
      useFactory: async (config: ConfigService, secrets: SecretsService) => {
        const storage = config.getOrThrow<StorageConfig>('storage');

        if (!config.get<boolean>('secrets.enabled', false)) {
          return new S3StorageService(storage);
        }

        const secret = await secrets.getRequired<S3Secret>('storage/s3');
        if (!isS3Secret(secret)) {
          throw new Error(
            'Secret storage/s3 must contain s3_access_key_id, s3_bucket, s3_endpoint, s3_force_path_style, s3_region, s3_secret_access_key and s3_signed_url_ttl_seconds',
          );
        }

        return new S3StorageService({
          ...storage,
          region: secret.s3_region,
          bucket: secret.s3_bucket,
          endpoint: secret.s3_endpoint || undefined,
          accessKeyId: secret.s3_access_key_id || undefined,
          secretAccessKey: secret.s3_secret_access_key || undefined,
          forcePathStyle: secret.s3_force_path_style,
          signedUrlTtlSeconds: Math.min(
            Math.max(secret.s3_signed_url_ttl_seconds, 60),
            900,
          ),
        });
      },
    },
  ],
  exports: [S3StorageService],
})
export class StorageModule {}
