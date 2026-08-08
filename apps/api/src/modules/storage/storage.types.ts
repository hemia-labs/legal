export type PublicationArtifact = 'markdown' | 'html' | 'json';

export type StorageObjectRef = {
  bucket: string;
  key: string;
  versionId: string | null;
  etag: string | null;
  contentType: string;
  size: number;
  sha256: string;
};

export type StoredArtifact = StorageObjectRef & {
  artifact: PublicationArtifact;
};

export type PublicationKeyContext = {
  documentType: string;
  productId: string;
  organizationId?: string | null;
  tenantId?: string | null;
  documentKey: string;
  version: string;
};

export function buildPublicationArtifactKey(
  context: PublicationKeyContext,
  artifact: PublicationArtifact,
) {
  const extension = artifact === 'json' ? 'json' : artifact;
  const filename = artifact === 'json' ? 'metadata.json' : `${artifact}.${extension}`;

  return [
    'documents',
    safeSegment(context.documentType),
    safeSegment(context.productId),
    safeSegment(context.organizationId ?? 'global'),
    safeSegment(context.tenantId ?? 'global'),
    safeSegment(context.documentKey),
    safeSegment(context.version),
    filename,
  ].join('/');
}

export function buildEvidenceKey(
  issuerId: string,
  applicationId: string,
  acceptanceId: string,
  organizationId?: string | null,
  tenantId?: string | null,
) {
  return [
    'evidence',
    safeSegment(issuerId),
    safeSegment(applicationId),
    safeSegment(organizationId ?? 'global'),
    safeSegment(tenantId ?? 'global'),
    safeSegment(acceptanceId),
    'evidence.json',
  ].join('/');
}

function safeSegment(value: string) {
  if (!value || value === '.' || value === '..' || /[\\/]/.test(value)) {
    throw new Error('Invalid storage key segment');
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('Invalid storage key segment');
  }

  return normalized;
}
