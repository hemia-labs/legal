import type { LegalDocument } from "@/services/document.service";

export function groupDocumentsByApplication(documents: LegalDocument[]) {
  const groups = new Map<string, {
    id: string;
    name: string;
    key: string;
    documents: LegalDocument[];
  }>();

  for (const document of documents) {
    let group = groups.get(document.applicationId);
    if (!group) {
      group = {
        id: document.applicationId,
        name: document.application?.name ?? `Aplicación ${document.applicationId}`,
        key: document.application?.key ?? document.applicationId,
        documents: [],
      };
      groups.set(group.id, group);
    }
    group.documents.push(document);
  }

  return [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es-MX") || a.id.localeCompare(b.id),
  );
}
