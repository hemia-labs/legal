export type DocumentAction = 'accept' | 'acknowledge' | 'consent';

export type DocumentSetQuery = {
  applicationId: string;
  documentSetKey: string;
  locale: string;
};

export type DocumentArtifact = {
  url: string;
  expiresAt: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type PublishedDocument = {
  documentId: string;
  documentVersionId: string;
  documentKey: string;
  title: string;
  version: string;
  contentHash: string;
  requiredAction: DocumentAction;
  blocking: boolean;
  requireReacceptance: boolean;
  deadline: string | null;
  artifacts: Readonly<Record<string, DocumentArtifact>>;
};

export type DocumentSetSnapshot = {
  applicationId: string;
  documentSetKey: string;
  revision: string;
  snapshotToken: string;
  expiresAt: string;
  documents: readonly PublishedDocument[];
};

export type RecordEvidenceInput = {
  snapshotToken: string;
  idempotencyKey: string;
  subjectId: string;
  organizationId?: string;
  sessionId?: string;
  occurredAt: string;
  confirmations: readonly {
    documentVersionId: string;
    contentHash: string;
    action: DocumentAction;
    confirmed: true;
  }[];
};

export type EvidenceReceipt = {
  evidenceId: string;
  snapshotToken: string;
  recorded: true;
  occurredAt: string;
  receivedAt: string;
  authenticationMethod: string;
};
