import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type ObjectIdentifier,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import {
  buildDocumentPrefix,
  type StorageConfig,
  type StorageObjectRef,
} from './types/storage.types';

type StoredMemoryObject = StorageObjectRef & { body: Buffer };

@Injectable()
export class S3StorageService {
  private readonly client: S3Client | null;
  private readonly memory = new Map<string, StoredMemoryObject>();

  constructor(private readonly config: StorageConfig) {
    this.client = this.createClient(config);
  }

  private createClient(config: StorageConfig) {
    if (config.nodeEnv === 'test') {
      return null;
    }

    return new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  async putImmutable(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StorageObjectRef> {
    const bucket = this.requireBucket();
    const sha256 = createHash('sha256').update(body).digest('hex');

    if (!this.client) {
      const existing = this.memory.get(key);
      if (
        existing &&
        existing.sha256 === sha256 &&
        existing.contentType === contentType
      ) {
        return withoutBody(existing);
      }
      if (existing) {
        throw new ConflictException('Storage object already exists');
      }

      const ref: StoredMemoryObject = {
        bucket,
        key,
        versionId: `test-${sha256.slice(0, 16)}`,
        etag: null,
        contentType,
        size: body.length,
        sha256,
        body,
      };
      this.memory.set(key, ref);
      return withoutBody(ref);
    }

    try {
      const existing = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (
        existing.Metadata?.sha256 === sha256 &&
        existing.ContentLength === body.length
      ) {
        return {
          bucket,
          key,
          versionId: existing.VersionId ?? null,
          etag: existing.ETag ?? null,
          contentType: existing.ContentType ?? contentType,
          size: existing.ContentLength ?? body.length,
          sha256,
        };
      }
      throw new ConflictException('Storage object already exists');
    } catch (error) {
      if (!isMissingObject(error)) throw error;
    }

    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
        ChecksumSHA256: createHash('sha256').update(body).digest('base64'),
        Metadata: { sha256 },
        IfNoneMatch: '*',
      }),
    );

    return {
      bucket,
      key,
      versionId: response.VersionId ?? null,
      etag: response.ETag ?? null,
      contentType,
      size: body.length,
      sha256,
    };
  }

  async signedDownloadUrl(ref: StorageObjectRef, downloadFileName?: string) {
    const expiresAt = new Date(
      Date.now() + this.config.signedUrlTtlSeconds * 1000,
    );

    if (!this.client) {
      return {
        url: `https://storage.test/${encodeURIComponent(ref.key)}`,
        expiresAt,
      };
    }

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: ref.bucket,
        Key: ref.key,
        ...(downloadFileName
          ? {
              ResponseContentDisposition: `attachment; filename="${
                downloadFileName
                  .split(/[\\/]/)
                  .pop()!
                  .replace(/[^a-zA-Z0-9._-]+/g, '-')
                  .slice(0, 255) || 'document'
              }"`,
            }
          : {}),
        ResponseContentType:
          ref.contentType === 'text/html'
            ? 'text/html; charset=utf-8'
            : ref.contentType,
      }),
      { expiresIn: this.config.signedUrlTtlSeconds },
    );

    return { url, expiresAt };
  }

  async read(ref: StorageObjectRef): Promise<Buffer> {
    if (!this.client) {
      const stored = this.memory.get(ref.key);
      if (!stored)
        throw new ServiceUnavailableException('Storage object not found');
      return Buffer.from(stored.body);
    }

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
    );
    if (!response.Body)
      throw new ServiceUnavailableException('Storage object is empty');
    if ('transformToByteArray' in response.Body) {
      return Buffer.from(await response.Body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(ref: StorageObjectRef) {
    if (!this.client) {
      this.memory.delete(ref.key);
      return;
    }
    await this.client.send(
      new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
    );
  }

  async deleteDocumentFiles(documentId: string): Promise<boolean> {
    const prefix = buildDocumentPrefix(documentId);
    const bucket = this.requireBucket();
    if (!this.client) {
      for (const key of this.memory.keys()) {
        if (key.startsWith(prefix)) this.memory.delete(key);
      }
      return true;
    }

    // Include replaced drafts and historical S3 versions, not only current DB references.
    const objects: ObjectIdentifier[] = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    let truncated: boolean;
    do {
      const page = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      for (const version of page.Versions ?? []) {
        if (!version.Key?.startsWith(prefix)) {
          throw new Error('S3 returned an object outside the document prefix');
        }
        objects.push({ Key: version.Key, VersionId: version.VersionId });
      }
      truncated = page.IsTruncated === true;
      if (truncated && !page.NextKeyMarker) {
        throw new Error('S3 did not return the next version marker');
      }
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    } while (truncated);

    let complete = true;
    for (let offset = 0; offset < objects.length; offset += 1000) {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.slice(offset, offset + 1000),
            Quiet: true,
          },
        }),
      );
      if (result.Errors?.length) complete = false;
    }
    // Keep delete markers so retained or protected versions never become visible again.
    return complete;
  }

  private requireBucket() {
    if (!this.config.bucket) {
      throw new ServiceUnavailableException('S3 storage is not configured');
    }
    return this.config.bucket;
  }
}

function withoutBody({
  body: _body,
  ...ref
}: StoredMemoryObject): StorageObjectRef {
  void _body;
  return ref;
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
