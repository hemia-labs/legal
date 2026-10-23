import type { IntegrationInput } from "@/services/integration.service";
export function integrationSelectionPayload(
  value: IntegrationInput,
): IntegrationInput {
  if (!value.systemId || !value.applicationId)
    throw new Error("Selecciona un sistema y una aplicación.");
  if (
    !value.documentIds.length ||
    value.documentIds.length > 100 ||
    value.documentIds.some((id) => !id) ||
    new Set(value.documentIds).size !== value.documentIds.length
  )
    throw new Error("Selecciona entre 1 y 100 documentos sin duplicados.");
  return {
    systemId: value.systemId,
    applicationId: value.applicationId,
    documentIds: [...value.documentIds],
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
  };
}
