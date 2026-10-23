import { legalApi } from "@/lib/legal-api";
export type IntegrationClient = {
  oauthIssuer: string;
  clientId: string;
  roles: ("collector" | "validator")[];
  enabled: boolean;
};
export type Integration = {
  id: string;
  systemId: string;
  code: string;
  name: string;
  identityIssuer: string;
  issuerId: string;
  applicationId: string;
  productCode: string;
  contextUrl: string;
  enabled: boolean;
  documentIds: string[];
  clients: IntegrationClient[];
  organizations: { organizationId: string; enabled: boolean }[];
};
export type IntegrationInput = Pick<
  Integration,
  "systemId" | "applicationId" | "documentIds"
> & { enabled?: boolean };
export type SystemOption = { id: string; code: string; name: string };
export function listSystemOptions(signal?: AbortSignal) {
  return legalApi<SystemOption[]>("/v1/legal/systems/options", { signal });
}
export function listIntegrations(signal?: AbortSignal) {
  return legalApi<Integration[]>("/v1/legal/integration-sources", { signal });
}
export function saveIntegration(value: IntegrationInput, id?: string) {
  return legalApi<Integration>(
    "/v1/legal/integration-sources" + (id ? "/" + encodeURIComponent(id) : ""),
    { method: id ? "PUT" : "POST", body: JSON.stringify(value) },
  );
}
export function disableIntegration(id: string) {
  return legalApi(
    "/v1/legal/integration-sources/" + encodeURIComponent(id) + "/disable",
    { method: "POST" },
  );
}

export type IntegrationClientOption = {
  clientId: string;
  name: string;
  oauthIssuer: string;
  scopes: string[];
};
export function listIntegrationClients(signal?: AbortSignal) {
  return legalApi<IntegrationClientOption[]>(
    "/v1/legal/integration-sources/clients",
    { signal },
  );
}

export type IntegrationCapabilities = {
  externalAcceptances: { available: boolean };
  events: {
    enabled: boolean;
    connected: boolean;
    publisherEnabled: boolean;
    webhooksAvailable: boolean;
  };
  signatures: { available: boolean };
  connections: {
    storage: { provider: "s3"; configured: boolean };
    notificationsAvailable: boolean;
    crmAvailable: boolean;
  };
};

export function getIntegrationCapabilities(signal?: AbortSignal) {
  return legalApi<IntegrationCapabilities>(
    "/v1/legal/integration-capabilities",
    { signal },
  );
}
