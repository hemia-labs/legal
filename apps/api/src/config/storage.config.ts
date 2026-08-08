import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? '',
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  signedUrlTtlSeconds: Math.min(
    Math.max(Number(process.env.S3_SIGNED_URL_TTL_SECONDS) || 300, 60),
    900,
  ),
  nodeEnv: process.env.NODE_ENV ?? 'development',
}));
