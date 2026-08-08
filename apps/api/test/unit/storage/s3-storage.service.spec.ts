import { ConflictException } from '@nestjs/common';
import { S3StorageService } from '../../../src/modules/storage/s3-storage.service';

function storage() {
  return new S3StorageService({
    getOrThrow: () => ({
      nodeEnv: 'test',
      bucket: 'legal-test',
      region: 'us-east-1',
      forcePathStyle: false,
      signedUrlTtlSeconds: 300,
    }),
  } as never);
}

describe('S3StorageService', () => {
  it('returns hash, MIME, size and a stable test version', async () => {
    const service = storage();
    const body = Buffer.from('# legal');
    const first = await service.putImmutable('documents/a.md', body, 'text/markdown');
    const retry = await service.putImmutable('documents/a.md', body, 'text/markdown');

    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.contentType).toBe('text/markdown');
    expect(first.size).toBe(body.length);
    expect(retry.versionId).toBe(first.versionId);
  });

  it('rejects overwrites with different bytes', async () => {
    const service = storage();
    await service.putImmutable('documents/a.md', Buffer.from('v1'), 'text/markdown');

    await expect(
      service.putImmutable('documents/a.md', Buffer.from('v2'), 'text/markdown'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('generates a temporary download URL', async () => {
    const service = storage();
    const ref = await service.putImmutable('documents/a.md', Buffer.from('v1'), 'text/markdown');
    const signed = await service.signedDownloadUrl(ref);

    expect(signed.url).toContain(encodeURIComponent(ref.key));
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
