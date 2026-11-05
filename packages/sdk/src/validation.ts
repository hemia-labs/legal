import type {
  DocumentArtifact,
  DocumentSetQuery,
  DocumentSetSnapshot,
  EvidenceReceipt,
  PublishedDocument,
} from './contracts';

export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

export const setKey = /^[a-z][a-z0-9_-]{1,79}$/;
export const locale = /^[a-z]{2}-[A-Z]{2}$/;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const date = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const sha256 = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function artifact(value: unknown): value is DocumentArtifact {
  return (
    object(value) &&
    text(value.url) &&
    date(value.expiresAt) &&
    text(value.contentType) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0 &&
    sha256(value.sha256)
  );
}

function document(value: unknown): value is PublishedDocument {
  return (
    object(value) &&
    uuid(value.documentId) &&
    uuid(value.documentVersionId) &&
    text(value.documentKey) &&
    text(value.title) &&
    text(value.version) &&
    sha256(value.contentHash) &&
    (value.requiredAction === 'accept' ||
      value.requiredAction === 'acknowledge' ||
      value.requiredAction === 'consent') &&
    typeof value.blocking === 'boolean' &&
    typeof value.requireReacceptance === 'boolean' &&
    (value.deadline === null || date(value.deadline)) &&
    object(value.artifacts) &&
    Object.values(value.artifacts).every(artifact)
  );
}

export function snapshot(
  value: unknown,
  query: DocumentSetQuery,
): value is DocumentSetSnapshot {
  if (
    !object(value) ||
    !uuid(value.applicationId) ||
    value.applicationId.toLowerCase() !== query.applicationId.toLowerCase() ||
    value.documentSetKey !== query.documentSetKey ||
    !uuid(value.revision) ||
    !uuid(value.snapshotToken) ||
    !date(value.expiresAt) ||
    Date.parse(value.expiresAt) <= Date.now() ||
    !Array.isArray(value.documents) ||
    value.documents.length < 1 ||
    value.documents.length > 100 ||
    !value.documents.every(document)
  )
    return false;

  return (
    new Set(value.documents.map((doc) => doc.documentVersionId.toLowerCase()))
      .size === value.documents.length
  );
}

export function receipt(
  value: unknown,
  snapshotToken: string,
): value is EvidenceReceipt {
  return (
    object(value) &&
    uuid(value.evidenceId) &&
    uuid(value.snapshotToken) &&
    value.snapshotToken.toLowerCase() === snapshotToken.toLowerCase() &&
    value.recorded === true &&
    date(value.occurredAt) &&
    date(value.receivedAt) &&
    text(value.authenticationMethod)
  );
}
