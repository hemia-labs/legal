export type SourceKind = 'pdf' | 'html' | 'markdown';
export type PublicationArtifact = 'html';

export type StorageConfig = {
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
  nodeEnv: string;
};

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
  documentId: string;
  version: string;
};

export function buildPublicationArtifactKey(
  context: PublicationKeyContext,
  artifact: PublicationArtifact,
) {
  return [...versionPrefix(context), `${artifact}.${artifact}`].join('/');
}

export function buildPublicationSourceKey(
  context: PublicationKeyContext,
  sourceKind: SourceKind,
  sourceHash: string,
) {
  const extension = sourceKind === 'markdown' ? 'md' : sourceKind;
  return [
    ...versionPrefix(context),
    'source',
    `${sourceHash}.${extension}`,
  ].join('/');
}

export function buildDocumentPrefix(documentId: string) {
  return `legal/documents/${safeSegment(documentId)}/`;
}

function versionPrefix(context: PublicationKeyContext) {
  const documentId = safeSegment(context.documentId);
  if (context.version === 'draft') {
    return ['legal', 'documents', documentId, 'draft'];
  }

  return [
    'legal',
    'documents',
    documentId,
    'versions',
    safeSegment(context.version),
  ];
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
