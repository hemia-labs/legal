"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useLegalSession } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/zuno/button";
import { StatusBadge } from "@/components/zuno/status-badge";
import { IntegrationForm } from "@/components/integrations/integration-form";
import { LegalApiError } from "@/lib/legal-api";
import { listApplications, type Application } from "@/services/application.service";
import { listDocuments, type LegalDocument } from "@/services/document.service";
import { listIssuerOptions, type IssuerOption } from "@/services/issuer.service";
import {
  listIntegrationClients,
  listIntegrations,
  type Integration,
  type IntegrationClientOption,
} from "@/services/integration.service";

const integrationPath = "/catalogs/integrations/external-acceptances";

function errorMessage(error: unknown) {
  if (error instanceof LegalApiError && error.status === 403) {
    return "La integración está fuera de tu alcance o falta el permiso requerido.";
  }
  if (error instanceof LegalApiError && error.status === 429) {
    return "Demasiadas solicitudes. Espera un momento y reintenta.";
  }
  return "No se pudo cargar la integración. Reintenta.";
}

export function IntegrationDetailClient({ id, mode = "detail" }: { id: string; mode?: "detail" | "edit" }) {
  const session = useLegalSession();
  const canView = session.permissions.includes("legal.integrations.view");
  const canEdit = session.permissions.includes("legal.integrations.edit");
  const canReadIssuers = session.permissions.includes("legal.issuers.view");
  const canReadApplications = session.permissions.includes("legal.applications.view");
  const canReadDocuments = session.permissions.includes("legal.documents.view");
  const canReadClients = canEdit || session.permissions.includes("legal.integrations.create");
  return (
    <IntegrationDetailScreen
      key={`${id}:${mode}:${session.activeOrganizationId}:${session.permissions.join(",")}`}
      id={id}
      mode={mode}
      canView={canView}
      canEdit={canEdit}
      canReadIssuers={canReadIssuers}
      canReadApplications={canReadApplications}
      canReadDocuments={canReadDocuments}
      canReadClients={canReadClients}
    />
  );
}

function IntegrationDetailScreen({
  id,
  mode,
  canView,
  canEdit,
  canReadIssuers,
  canReadApplications,
  canReadDocuments,
  canReadClients,
}: {
  id: string;
  mode: "detail" | "edit";
  canView: boolean;
  canEdit: boolean;
  canReadIssuers: boolean;
  canReadApplications: boolean;
  canReadDocuments: boolean;
  canReadClients: boolean;
}) {
  const router = useRouter();
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [issuerOptions, setIssuerOptions] = useState<IssuerOption[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [clientOptions, setClientOptions] = useState<IntegrationClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!canView || (mode === "edit" && !canEdit)) return;
    const controller = new AbortController();
    let live = true;
    async function load() {
      const results = await Promise.allSettled([
        listIntegrations(controller.signal),
        canReadIssuers ? listIssuerOptions() : Promise.resolve([]),
        canReadApplications ? loadAllApplications() : Promise.resolve([]),
        canReadDocuments ? listDocuments() : Promise.resolve([]),
        canReadClients ? listIntegrationClients(controller.signal) : Promise.resolve([]),
      ]);
      if (!live) return;

      const [integrationResult, issuerResult, applicationResult, documentResult, clientResult] = results;
      if (integrationResult.status === "rejected") {
        setIntegration(null);
        setError(errorMessage(integrationResult.reason));
      } else {
        const found = integrationResult.value.find((item) => item.id === id) ?? null;
        setIntegration(found);
        setMissing(!found);
        setError(found ? "" : "La integración no existe o no está disponible en tu alcance.");
      }
      if (issuerResult.status === "fulfilled") setIssuerOptions(issuerResult.value);
      if (applicationResult.status === "fulfilled") setApplications(applicationResult.value);
      if (documentResult.status === "fulfilled") setDocuments(documentResult.value);
      if (clientResult.status === "fulfilled") setClientOptions(clientResult.value);
      setLoading(false);
    }
    void load();
    return () => {
      live = false;
      controller.abort();
    };
  }, [canEdit, canReadApplications, canReadClients, canReadDocuments, canReadIssuers, canView, id, mode, revision]);

  if (!canView) {
    return (
      <PageHeading
        title="Detalle de integración"
        description="Necesitas legal.integrations.view dentro del emisor o aplicación correspondiente."
      />
    );
  }

  if (mode === "edit" && !canEdit) {
    return (
      <PageHeading
        title="Editar integración"
        description="Necesitas legal.integrations.edit dentro del emisor o aplicación correspondiente."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeading title="Cargando integración…" description="Consultando su configuración y alcance." />
        <p role="status" className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          Cargando detalle…
        </p>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="space-y-6">
        <PageHeading
          title={mode === "edit" ? "Editar integración" : "Detalle de integración"}
          description="No se pudo mostrar la configuración solicitada."
        />
        <div className="rounded-lg border border-destructive p-5">
          <p role="alert" className="text-sm text-destructive">{error || "La integración no está disponible."}</p>
          {error && !missing && (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setLoading(true);
                setIntegration(null);
                setMissing(false);
                setError("");
                setRevision((value) => value + 1);
              }}
            >
              Reintentar
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (mode === "edit") {
    const detailPath = `${integrationPath}/${encodeURIComponent(id)}`;
    return (
      <IntegrationForm
        integration={integration}
        onSaved={() => router.push(detailPath)}
        onCancel={() => router.push(detailPath)}
      />
    );
  }

  const enabledClients = integration.clients.filter((client) => client.enabled).length;
  const enabledOrganizations = integration.organizations.filter((organization) => organization.enabled).length;
  const configuredDocuments = integration.documentIds.map((documentId) =>
    documents.find((document) => document.id === documentId),
  );
  const application = applications.find((item) => item.id === integration.applicationId)
    ?? configuredDocuments.find((document) => document?.application?.id === integration.applicationId)?.application;
  const issuer = issuerOptions.find((item) => item.id === integration.issuerId)
    ?? applications.find((item) => item.id === integration.applicationId)?.issuer
    ?? configuredDocuments.find((document) => document?.issuer?.id === integration.issuerId)?.issuer;

  return (
    <div className="space-y-6">
      <PageHeading
        title={integration.name}
        description={`Integración de aceptaciones externas · Código ${integration.code}`}
        actions={canEdit ? (
          <Button onClick={() => router.push(`${integrationPath}/${encodeURIComponent(id)}/edit`)}>
            <Pencil className="size-4" aria-hidden="true" />Editar
          </Button>
        ) : undefined}
      />

      <section aria-label="Resumen de integración" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Clientes autorizados" value={`${enabledClients} de ${integration.clients.length}`} detail="habilitados" />
        <Summary label="Documentos" value={String(integration.documentIds.length)} detail="asociados a la aceptación" />
        <Summary
          label="Organizaciones"
          value={integration.organizations.length ? String(enabledOrganizations) : "Por contexto"}
          detail={integration.organizations.length ? `de ${integration.organizations.length} permitidas` : "verificadas por el producto"}
        />
        <Summary label="Estado" value={integration.enabled ? "Habilitada" : "Deshabilitada"} detail="de la integración" />
      </section>

      <section aria-label="Configuración de integración" className="grid gap-4 xl:grid-cols-2">
        <Panel title="Aplicación y contexto" description="Entidades de Legal y datos del producto consumidor asociados a esta integración.">
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <Detail label="Código" value={integration.code} mono />
            <Detail label="Producto" value={integration.productCode} mono />
            <Detail
              label="Emisor legal"
              value={issuer?.name ?? (canReadIssuers || canReadApplications || canReadDocuments
                ? "Emisor no disponible en los catálogos consultados"
                : "Sin permiso para consultar el emisor")}
            />
            <Detail
              label="Aplicación legal"
              value={application
                ? `${application.name} · ${application.key}`
                : canReadApplications || canReadDocuments
                  ? "Aplicación no disponible en los catálogos consultados"
                  : "Sin permiso para consultar la aplicación"}
            />
            <Detail label="Emisor de identidad" value={integration.identityIssuer} mono />
            <Detail label="URL de contexto" value={integration.contextUrl} mono wide />
          </dl>
        </Panel>

        <Panel title="Clientes autorizados" description="Clientes OAuth habilitados para registrar o validar aceptaciones.">
          {integration.clients.length ? (
            <ul className="divide-y divide-border">
              {integration.clients.map((client) => (
                <li key={`${client.oauthIssuer}:${client.clientId}`} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-medium">
                      {clientOptions.find((option) => option.clientId === client.clientId && option.oauthIssuer === client.oauthIssuer)?.name ?? client.clientId}
                    </p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{client.clientId}</p>
                    <p className="break-all text-xs text-muted-foreground">{client.oauthIssuer}</p>
                    <p className="text-xs text-muted-foreground">{client.roles.map((role) => role === "collector" ? "Registra aceptaciones" : "Valida evidencia legal").join(" · ")}</p>
                  </div>
                  <StatusBadge status={client.enabled ? "success" : "neutral"} className="w-fit">
                    {client.enabled ? "Habilitado" : "Deshabilitado"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : <Empty>No hay clientes OAuth asociados.</Empty>}
        </Panel>

        <Panel title="Documentos legales" description="Documentos que deben aceptarse o validarse para este producto.">
          {integration.documentIds.length ? (
            <ul className="divide-y divide-border">
              {integration.documentIds.map((documentId, index) => {
                const document = configuredDocuments[index];
                return (
                  <li key={documentId} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="break-words text-sm font-medium">{document?.title ?? "Nombre no disponible"}</p>
                      {document ? (
                        <p className="text-xs text-muted-foreground">
                          {document.key} · {document.locale} · {documentTypeLabel(document.documentType)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {canReadDocuments ? "El documento no está disponible en el catálogo." : "Sin permiso para consultar el catálogo de documentos."}
                        </p>
                      )}
                    </div>
                    {document && (
                      <StatusBadge status={document.status === "active" ? "success" : "neutral"} className="w-fit">
                        {document.status === "active" ? "Activo" : "Archivado"}
                      </StatusBadge>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No hay documentos legales asociados.</Empty>}
        </Panel>

        <Panel title="Organizaciones permitidas" description="Límite adicional para restringir dónde aplica esta integración.">
          {integration.organizations.length ? (
            <ul className="divide-y divide-border">
              {integration.organizations.map((organization) => (
                <li key={organization.organizationId} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-all text-sm">
                    <span className="text-xs text-muted-foreground">ID del sistema de origen</span>
                    <span className="mt-1 block font-mono text-xs">{organization.organizationId}</span>
                  </span>
                  <StatusBadge status={organization.enabled ? "success" : "neutral"} className="w-fit">
                    {organization.enabled ? "Permitida" : "Deshabilitada"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : <Empty>El producto determina la organización desde el contexto verificado.</Empty>}
        </Panel>
      </section>
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 border-b border-border pb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`min-w-0 border-b border-border py-3 last:border-b-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-foreground ${mono ? "font-mono text-xs" : "font-medium"}`}>{value || "—"}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

async function loadAllApplications() {
  const firstPage = await listApplications({ page: 1, limit: 100, status: "all" });
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.meta.totalPages - 1) }, (_, index) =>
      listApplications({ page: index + 2, limit: 100, status: "all" }),
    ),
  );
  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}

function documentTypeLabel(value: string) {
  return value === "terms_and_conditions" ? "Términos y condiciones" : value.replaceAll("_", " ");
}
