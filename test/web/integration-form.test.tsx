import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Integration } from "../../apps/web/src/services/integration.service";
import { integrationSelectionPayload } from "../../apps/web/src/lib/integration-selection";
mock.module("../../apps/web/src/components/app-shell", () => ({
  useLegalSession: () => ({
    permissions: [
      "legal.integrations.create",
      "legal.integrations.edit",
      "legal.documents.view",
      "legal.applications.view",
    ],
    activeOrganizationId: "organization",
  }),
}));
mock.module("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
const { IntegrationForm } =
  await import("../../apps/web/src/components/integrations/integration-form");
const integration: Integration = {
  id: "source",
  systemId: "system",
  name: "Balanz",
  code: "balanz",
  identityIssuer: "urn:hemia:balanz",
  issuerId: "issuer",
  applicationId: "application",
  productCode: "balanz_cfdi",
  contextUrl: "https://example.com/context",
  enabled: true,
  documentIds: ["document"],
  clients: [],
  organizations: [],
};
test("creation asks for system, application and documents without technical fields", () => {
  const html = renderToStaticMarkup(<IntegrationForm />);
  expect(html).toContain('id="systemId"');
  expect(html).toContain('id="applicationId"');
  expect(html).toContain("3. Documentos");
  for (const id of [
    "identityIssuer",
    "productCode",
    "contextUrl",
    "issuerId",
    "name",
    "code",
    "add-oauth-client",
  ])
    expect(html).not.toContain(`id="${id}"`);
});
test("editing keeps the selected system fixed and preserves selected documents", () => {
  const html = renderToStaticMarkup(
    <IntegrationForm integration={integration} />,
  );
  expect(html.match(/<[^>]+id="systemId"[^>]*>/)?.[0]).toContain("disabled");
  expect(html).toContain("Documento registrado");
  expect(html).toContain("1 documentos seleccionados");
});
test("payload contains only selected IDs and optional enabled state", () => {
  const input = { ...integration };
  expect(integrationSelectionPayload(input)).toEqual({
    systemId: "system",
    applicationId: "application",
    documentIds: ["document"],
    enabled: true,
  });
  for (const documentIds of [[], ["a", "a"], Array(101).fill("a")])
    expect(() =>
      integrationSelectionPayload({
        systemId: "s",
        applicationId: "a",
        documentIds,
      }),
    ).toThrow();
});
