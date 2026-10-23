import { expect, test } from "bun:test";
import { groupDocumentsByApplication } from "../../apps/web/src/lib/document-groups";
import type { LegalDocument } from "../../apps/web/src/services/document.service";

function document(id: string, applicationId: string, name?: string): LegalDocument {
  return {
    id, applicationId, issuerId: "issuer", key: id, title: "Términos",
    documentType: "terms", documentVariant: "standard", parentDocumentId: null,
    locale: "es-MX", status: "active", createdAt: "", updatedAt: "",
    ...(name ? { application: { id: applicationId, key: applicationId, name, status: "active" } } : {}),
  };
}

test("groups by application ID, sorts names and retains document order", () => {
  const groups = groupDocumentsByApplication([
    document("1", "z", "Zuno"), document("2", "a", "Atlas"), document("3", "z", "Zuno"),
    document("4", "other", "Atlas"),
  ]);
  expect(groups.map((group) => group.id)).toEqual(["a", "other", "z"]);
  expect(groups[2].documents.map((item) => item.id)).toEqual(["1", "3"]);
});

test("keeps application identity when relation data is absent and handles empty results", () => {
  expect(groupDocumentsByApplication([])).toEqual([]);
  expect(groupDocumentsByApplication([document("1", "missing")])[0]).toMatchObject({
    id: "missing", name: "Aplicación missing", key: "missing",
  });
});
