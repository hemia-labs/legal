import { legalApi } from "@/lib/legal-api";

export type LegalDocumentStatus = "active" | "archived";
export type LegalVersionStatus = "draft" | "published" | "superseded" | "archived";
export type SourceKind = "pdf" | "html" | "markdown";
export type LegalDocumentWorkflow = "public" | "internal";
export type LegalDocumentVariant = "standard" | "integral" | "simplified" | "short";
export type AcceptancePolicy = "required" | "optional" | "configurable";

export type LegalDocument = {
  id: string;
  issuerId: string;
  applicationId: string;
  key: string;
  documentType: string;
  documentVariant: LegalDocumentVariant;
  parentDocumentId: string | null;
  locale: string;
  title: string;
  status: LegalDocumentStatus;
  createdAt: string;
  updatedAt: string;
};

export type LegalDraft = {
  id: string;
  documentId: string;
  version: "draft";
  status: "draft";
  sourceKind: SourceKind | null;
  sourceContentType: string | null;
  sourceFileName: string | null;
  sourceSizeBytes: number | null;
  sourceHash: string | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegalVersion = {
  id: string;
  documentId: string;
  version: string;
  status: LegalVersionStatus;
  sourceKind: SourceKind | null;
  sourceContentType: string | null;
  sourceFileName: string | null;
  sourceSizeBytes: number | null;
  sourceHash: string | null;
  contentHash: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  acceptanceDeadline: string | null;
  gracePeriodDays: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AcceptanceRuleInput = {
  acceptanceMode: "individual" | "organization_representative" | "informational";
  role?: string;
  startsAt?: string;
  endsAt?: string;
  isBlocking?: boolean;
};

export type PublishDraftPayload = {
  version: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  acceptanceDeadline?: string;
  gracePeriodDays?: number;
  rules?: AcceptanceRuleInput[];
};

export type PublicationPreview = {
  version: string;
  rulesCount: number;
  conflicts: string[];
  currentPublished: LegalVersion | null;
  canPublish: boolean;
};

export type PublicationResult = {
  status: string;
  publicationId: string;
  versionId: string;
  version: string;
  sourceHash: string | null;
  contentHash: string;
  outboxEventId: string;
};

export type DocumentTypeOption = {
  code: string;
  name: string;
  workflow: LegalDocumentWorkflow;
  allowedSourceKinds: SourceKind[];
  requiresHtml: boolean;
  acceptance: AcceptancePolicy;
  variants: LegalDocumentVariant[];
};

export type PublicArtifact = {
  url: string;
  expiresAt: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type PublicDocument = {
  document: Pick<LegalDocument, "applicationId" | "key" | "documentType" | "locale" | "title">;
  privacyNotice: {
    variant: LegalDocumentVariant;
    integralDocumentKey: string | null;
    integralVersion: string;
  } | null;
  version: {
    id: string;
    documentId: string;
    version: string;
    status: "published";
    sourceHash: string | null;
    contentHash: string;
    effectiveFrom: string | null;
    effectiveUntil: string | null;
    acceptanceDeadline: string | null;
    gracePeriodDays: number;
    publishedAt: string | null;
  };
  contentHash: string;
  acceptance: {
    required: boolean;
    blocking: boolean;
    rules: Array<{
      acceptanceMode: string;
      isBlocking: boolean;
      startsAt: string | null;
      endsAt: string | null;
    }>;
  };
  artifacts: Record<string, PublicArtifact | undefined>;
};

export function listDocuments() {
  return legalApi<LegalDocument[]>("/v1/legal/documents");
}

export function archiveDocument(documentId: string) {
  return legalApi(`/v1/legal/documents/${documentId}/archive`, { method: "POST" });
}

export function deleteDocument(documentId: string) {
  return legalApi(`/v1/legal/documents/${documentId}`, { method: "DELETE" });
}

export async function getDocument(documentId: string) {
  const documents = await listDocuments();
  const document = documents.find((item) => item.id === documentId);
  if (!document) throw new Error("Documento no encontrado.");
  return document;
}

export function getDocumentDraft(documentId: string) {
  return legalApi<LegalDraft>(`/v1/legal/documents/${documentId}/draft`);
}

export function uploadDocumentSource(
  documentId: string,
  file: File,
  sourceKind: SourceKind,
  method: "POST" | "PATCH",
) {
  const body = new FormData();
  body.append("file", file);
  body.append("metadata", JSON.stringify({ sourceKind }));
  return legalApi<LegalDraft>(`/v1/legal/documents/${documentId}/draft`, {
    method,
    body,
  });
}

export function previewPublication(documentId: string, payload: PublishDraftPayload) {
  return legalApi<PublicationPreview>(
    `/v1/legal/documents/${documentId}/draft/preview-publication`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function publishDraft(documentId: string, payload: PublishDraftPayload) {
  return legalApi<PublicationResult>(
    `/v1/legal/documents/${documentId}/draft/publish`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function listVersions(documentId: string) {
  return legalApi<LegalVersion[]>(`/v1/legal/documents/${documentId}/versions`);
}

export function listDocumentTypes() {
  return legalApi<DocumentTypeOption[]>("/v1/legal/document-types");
}

export function sourceKindFor(file: File): SourceKind | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type === "text/html" || /\.(html?|xhtml)$/i.test(file.name)) return "html";
  if (file.type === "text/markdown" || /\.(md|markdown)$/i.test(file.name)) return "markdown";
  return null;
}
