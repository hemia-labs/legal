import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import { ConflictException } from '@nestjs/common';
import { S3StorageService } from '../../../../apps/api/src/modules/storage/s3-storage.service';
import type { StorageConfig } from '../../../../apps/api/src/modules/storage/types/storage.types';

function storage() {
  const config: StorageConfig = {
    nodeEnv: 'test',
    bucket: 'legal-test',
    region: 'us-east-1',
    forcePathStyle: false,
    signedUrlTtlSeconds: 300,
  };
  return new S3StorageService(config);
}

describe('S3StorageService', () => {
  it('returns hash, MIME, size and a stable test version', async () => {
    const service = storage();
    const body = Buffer.from('# legal');
    const first = await service.putImmutable(
      'documents/a.md',
      body,
      'text/markdown',
    );
    const retry = await service.putImmutable(
      'documents/a.md',
      body,
      'text/markdown',
    );

    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.contentType).toBe('text/markdown');
    expect(first.size).toBe(body.length);
    expect(retry.versionId).toBe(first.versionId);
  });

  it('rejects overwrites with different bytes', async () => {
    const service = storage();
    await service.putImmutable(
      'documents/a.md',
      Buffer.from('v1'),
      'text/markdown',
    );

    await expect(
      service.putImmutable(
        'documents/a.md',
        Buffer.from('v2'),
        'text/markdown',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('generates a temporary download URL', async () => {
    const service = storage();
    const ref = await service.putImmutable(
      'documents/a.md',
      Buffer.from('v1'),
      'text/markdown',
    );
    const signed = await service.signedDownloadUrl(ref);

    expect(signed.url).toContain(encodeURIComponent(ref.key));
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    ['text/html', 'text/html; charset=utf-8'],
    ['text/html; charset=utf-8', 'text/html; charset=utf-8'],
    ['application/pdf', 'application/pdf'],
  ])(
    'serves %s with the correct download encoding',
    async (storedType, servedType) => {
      const ref = await storage().putImmutable(
        'documents/published',
        Buffer.from('<h1>Introducción, México y protección</h1>', 'utf8'),
        storedType,
      );
      const service = new S3StorageService({
        nodeEnv: 'development',
        bucket: 'legal-test',
        region: 'us-east-1',
        forcePathStyle: false,
        signedUrlTtlSeconds: 300,
        accessKeyId: 'test',
        secretAccessKey: 'test',
      });

      const signed = await service.signedDownloadUrl(ref);

      expect(
        new URL(signed.url).searchParams.get('response-content-type'),
      ).toBe(servedType);
      expect(ref.contentType).toBe(storedType);
    },
  );

  it.each([
    ['terms.md', 'terms.md'],
    ['terms.html', 'terms.html'],
    ['../../terms"\r\nX-Foo: bad.html', 'terms-X-Foo-bad.html'],
  ])(
    'signs an original %s as an attachment without changing its bytes',
    async (fileName, safeFileName) => {
      const body = Buffer.from('Original legal content: México');
      const ref = await storage().putImmutable(
        'documents/source',
        body,
        'text/markdown',
      );
      const service = new S3StorageService({
        nodeEnv: 'development',
        bucket: 'legal-test',
        region: 'us-east-1',
        forcePathStyle: false,
        signedUrlTtlSeconds: 300,
        accessKeyId: 'test',
        secretAccessKey: 'test',
      });
      const signed = await service.signedDownloadUrl(ref, fileName);
      expect(
        new URL(signed.url).searchParams.get('response-content-disposition'),
      ).toBe(`attachment; filename="${safeFileName}"`);
      const inline = await service.signedDownloadUrl(ref);
      expect(
        new URL(inline.url).searchParams.has('response-content-disposition'),
      ).toBe(false);
    },
  );

  it('reads an immutable source back for the publication worker', async () => {
    const service = storage();
    const body = Buffer.from('<h1>Legal</h1>');
    const ref = await service.putImmutable(
      'documents/source.html',
      body,
      'text/html',
    );

    await expect(service.read(ref)).resolves.toEqual(body);
  });
});

describe('document file cleanup', () => {
  function remoteStorage() {
    const service = storage();
    const send = jest.fn((command: unknown): Promise<unknown> => {
      void command;
      return Promise.resolve({});
    });
    Object.defineProperty(service, 'client', { value: { send } });
    return { service, send };
  }

  it('removes draft and published files without touching another document', async () => {
    const service = storage();
    const refs = await Promise.all([
      service.putImmutable(
        'legal/documents/a/draft/source/old.md',
        Buffer.from('old'),
        'text/markdown',
      ),
      service.putImmutable(
        'legal/documents/a/draft/source/new.md',
        Buffer.from('new'),
        'text/markdown',
      ),
      service.putImmutable(
        'legal/documents/a/versions/1/html.html',
        Buffer.from('html'),
        'text/html',
      ),
      service.putImmutable(
        'legal/documents/ab/draft/source/keep.md',
        Buffer.from('keep'),
        'text/markdown',
      ),
    ]);
    await expect(service.deleteDocumentFiles('a')).resolves.toBe(true);
    for (const ref of refs.slice(0, 3))
      await expect(service.read(ref)).rejects.toThrow();
    await expect(service.read(refs[3])).resolves.toEqual(Buffer.from('keep'));
    await expect(service.deleteDocumentFiles('a')).resolves.toBe(true);
  });

  it('lists all pages and deletes historical versions in batches of at most 1000', async () => {
    const { service, send } = remoteStorage();
    const versions = Array.from({ length: 1001 }, (_, i) => ({
      Key: 'legal/documents/a/draft/source/terms.md',
      VersionId: `v${i}`,
    }));
    send.mockResolvedValueOnce({
      Versions: versions.slice(0, 1000),
      IsTruncated: true,
      NextKeyMarker: versions[0].Key,
      NextVersionIdMarker: 'v999',
    });
    send.mockResolvedValueOnce({
      Versions: versions.slice(1000),
      IsTruncated: false,
      DeleteMarkers: [{ Key: versions[0].Key, VersionId: 'marker' }],
    });
    send.mockResolvedValueOnce({});
    send.mockResolvedValueOnce({});
    await expect(service.deleteDocumentFiles('a')).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectVersionsCommand);
    expect(
      (send.mock.calls[0][0] as ListObjectVersionsCommand).input,
    ).toMatchObject({ Bucket: 'legal-test', Prefix: 'legal/documents/a/' });
    expect(
      (send.mock.calls[1][0] as ListObjectVersionsCommand).input,
    ).toMatchObject({ KeyMarker: versions[0].Key, VersionIdMarker: 'v999' });
    const first = send.mock.calls[2][0] as DeleteObjectsCommand;
    const second = send.mock.calls[3][0] as DeleteObjectsCommand;
    expect(first).toBeInstanceOf(DeleteObjectsCommand);
    expect(first.input.Delete?.Objects).toEqual(versions.slice(0, 1000));
    expect(second.input.Delete?.Objects).toEqual(versions.slice(1000));
    expect(first.input.BypassGovernanceRetention).toBeUndefined();
  });

  it('reports object-level permission or retention failures even with a successful HTTP response', async () => {
    const { service, send } = remoteStorage();
    send.mockResolvedValueOnce({
      Versions: [{ Key: 'legal/documents/a/file', VersionId: 'retained' }],
    });
    send.mockResolvedValueOnce({
      Errors: [{ Key: 'legal/documents/a/file', Code: 'AccessDenied' }],
    });
    await expect(service.deleteDocumentFiles('a')).resolves.toBe(false);
  });

  it('propagates listing denial without issuing deletes', async () => {
    const { service, send } = remoteStorage();
    send.mockRejectedValueOnce(new Error('AccessDenied'));
    await expect(service.deleteDocumentFiles('a')).rejects.toThrow(
      'AccessDenied',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('handles unversioned objects and propagates a rejected delete', async () => {
    const { service, send } = remoteStorage();
    send.mockResolvedValueOnce({
      Versions: [{ Key: 'legal/documents/a/file', VersionId: 'null' }],
    });
    send.mockRejectedValueOnce(new Error('RetentionDenied'));
    await expect(service.deleteDocumentFiles('a')).rejects.toThrow(
      'RetentionDenied',
    );
    expect(
      (send.mock.calls[1][0] as DeleteObjectsCommand).input.Delete?.Objects,
    ).toEqual([{ Key: 'legal/documents/a/file', VersionId: 'null' }]);
  });

  it('does not send a delete for an empty document prefix', async () => {
    const { service, send } = remoteStorage();
    send.mockResolvedValueOnce({});
    await expect(service.deleteDocumentFiles('a')).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe prefixes and objects returned outside the document', async () => {
    const { service, send } = remoteStorage();
    await expect(service.deleteDocumentFiles('../')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValueOnce({
      Versions: [{ Key: 'legal/documents/ab/file' }],
    });
    await expect(service.deleteDocumentFiles('a')).rejects.toThrow(
      'outside the document prefix',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});
