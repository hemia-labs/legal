import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import storageConfig from '../../config/storage.config';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [S3StorageService],
  exports: [S3StorageService],
})
export class StorageModule {}
