"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  CircleMinus,
  ClipboardCheck,
  Download,
  ExternalLink,
  FilePen,
  FilePlus2,
  History,
  RefreshCw,
  Rocket,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/zuno/badge";
import { Button } from "@/components/zuno/button";
import { Skeleton } from "@/components/zuno/skeleton";
import { StatusBadge } from "@/components/zuno/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  getVersionContent,
  listDocumentAcceptances,
  listDocumentAuditEvents,
  type DocumentAcceptances,
  type DocumentAuditEvent,
  type DocumentAuditTrail,
  type DocumentTypeOption,
  type LegalDocument,
  type LegalDraft,
  type LegalVersion,
  type VersionContent,
} from "@/services/document.service";

const tabs = [
  { value: "summary", label: "Resumen" },
  { value: "content", label: "Contenido" },
  { value: "versions", label: "Versiones" },
  { value: "approvals", label: "Aprobaciones" },
  { value: "acceptance", label: "Aceptación" },
  { value: "audit", label: "Auditoría" },
] as const;

export type DocumentDetailTabValue = (typeof tabs)[number]["value"];

export function DocumentDetailTabs({
  document,
  policy,
  draft,
  versions,
  currentVersion,
  statusLabel,
  statusVariant,
  permissions,
  isArchived,
  onPublish,
  onOpenVersions,
  value,
  onValueChange,
}: {
  document: LegalDocument;
  policy: DocumentTypeOption | null;
  draft: LegalDraft | null;
  versions: LegalVersion[];
  currentVersion?: LegalVersion;
  statusLabel: string;
  statusVariant: "neutral" | "success" | "warning";
  permissions: string[];
  isArchived: boolean;
  onPublish: () => void;
  onOpenVersions?: () => void;
  value?: DocumentDetailTabValue;
  onValueChange?: (value: DocumentDetailTabValue) => void;
}) {
  const canViewAcceptances = hasPermission(permissions, "legal.acceptances.view");
  const [acceptanceRevision, setAcceptanceRevision] = useState(0);
  const acceptanceKey = `${document.id}:${acceptanceRevision}`;
  const [acceptanceState, setAcceptanceState] = useState<{
    key: string;
    data: DocumentAcceptances | null;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!canViewAcceptances) return;
    let live = true;
    listDocumentAcceptances(document.id)
      .then((data) => {
        if (live) setAcceptanceState({ key: acceptanceKey, data, error: "" });
      })
      .catch((cause) => {
        if (live) {
          setAcceptanceState({
            key: acceptanceKey,
            data: null,
            error: cause instanceof Error ? cause.message : "No se pudieron cargar las aceptaciones.",
          });
        }
      });
    return () => {
      live = false;
    };
  }, [acceptanceKey, canViewAcceptances, document.id]);

  const acceptanceCurrent = acceptanceState?.key === acceptanceKey ? acceptanceState : null;
  const acceptances = acceptanceCurrent?.data ?? null;
  const acceptanceLoading = canViewAcceptances && !acceptanceCurrent;
  const acceptanceError = acceptanceCurrent?.error ?? "";

  return (
    <Tabs
      value={value}
      defaultValue="summary"
      onValueChange={(nextValue) => onValueChange?.(nextValue as DocumentDetailTabValue)}
      className="min-w-0"
    >
      <TabsList aria-label="Secciones del detalle del documento">
        {tabs.map(({ value, label }) => (
          <TabsTrigger key={value} value={value}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="summary">
        <SummaryTab document={document} policy={policy} draft={draft} versions={versions} currentVersion={currentVersion} statusLabel={statusLabel} statusVariant={statusVariant} acceptances={acceptances} canViewAcceptances={canViewAcceptances} onOpenVersions={onOpenVersions} />
      </TabsContent>
      <TabsContent value="content">
        <ContentTab documentId={document.id} versionId={currentVersion?.id ?? draft?.id} />
      </TabsContent>
      <TabsContent value="versions">
        <VersionsTab versions={versions} draft={draft} currentVersion={currentVersion} isArchived={isArchived} onPublish={onPublish} />
      </TabsContent>
      <TabsContent value="approvals">
        <ApprovalsTab versions={versions} />
      </TabsContent>
      <TabsContent value="acceptance">
        <AcceptanceTab
          policy={policy}
          currentVersion={currentVersion}
          versions={versions}
          acceptances={acceptances}
          loading={acceptanceLoading}
          error={acceptanceError}
          canView={canViewAcceptances}
          onRetry={() => setAcceptanceRevision((value) => value + 1)}
        />
      </TabsContent>
      <TabsContent value="audit">
        <AuditTab document={document} versions={versions} canView={hasPermission(permissions, "legal.audit.view")} />
      </TabsContent>
    </Tabs>
  );
}

function SummaryTab({
  document,
  policy,
  draft,
  versions,
  currentVersion,
  statusLabel,
  statusVariant,
  acceptances,
  canViewAcceptances,
  onOpenVersions,
}: {
  document: LegalDocument;
  policy: DocumentTypeOption | null;
  draft: LegalDraft | null;
  versions: LegalVersion[];
  currentVersion?: LegalVersion;
  statusLabel: string;
  statusVariant: "neutral" | "success" | "warning";
  acceptances: DocumentAcceptances | null;
  canViewAcceptances: boolean;
  onOpenVersions?: () => void;
}) {
  const fileName = currentVersion?.sourceFileName ?? draft?.sourceFileName ?? "Sin archivo";
  const fileSize = currentVersion?.sourceSizeBytes ?? draft?.sourceSizeBytes;
  const contentHash = currentVersion?.contentHash ?? draft?.contentHash;
  const sourceLabel = currentVersion?.sourceKind?.toUpperCase() ?? draft?.sourceKind?.toUpperCase() ?? "Pendiente";

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Panel title="Información general" description="Identificación y alcance del documento.">
        <DetailList rows={[
          ["Nombre", document.title],
          ["Clave", <span key="key" className="font-mono text-xs">{document.key}</span>],
          ["Tipo de documento", policy?.name ?? documentTypeLabel(document.documentType)],
          ["Variante", document.documentVariant],
          ["Emisor", document.issuer?.legalName || document.issuer?.name || document.issuerId],
          ["Aplicación", document.application?.name ?? document.applicationId],
          ["Idioma", document.locale],
          ["Visibilidad", policy?.workflow === "internal" ? "Interno" : "Público"],
          ["Aceptación", acceptanceLabel(policy)],
          ["Creado", formatDate(document.createdAt)],
          ["Actualizado", formatDate(document.updatedAt)],
        ]} />
      </Panel>

      <Panel title="Estado y vigencia" description="Situación de la versión vigente.">
        <DetailList rows={[
          ["Estado", <StatusBadge key="status" status={statusVariant}>{statusLabel}</StatusBadge>],
          ["Versión vigente", currentVersion ? `v${currentVersion.version}` : "Sin publicar"],
          ["Borrador", draft ? draft.sourceFileName ?? "Borrador sin archivo" : "Sin borrador"],
          ["Publicado el", formatDate(currentVersion?.publishedAt)],
          ["Vigencia desde", formatDate(currentVersion?.effectiveFrom)],
          ["Vence", currentVersion?.effectiveUntil ? formatDate(currentVersion.effectiveUntil) : "Sin vencimiento"],
          ["Periodo de gracia", currentVersion ? `${currentVersion.gracePeriodDays} días` : "—"],
          ["Límite de aceptación", formatDate(currentVersion?.acceptanceDeadline)],
        ]} />
      </Panel>

      <Panel title="Fuente vigente" description="Archivo del que se publicó la versión actual.">
        <DetailList rows={[
          ["Formato", sourceLabel],
          ["Archivo", fileName],
          ["Tamaño", formatBytes(fileSize)],
          ["Hash de contenido", <span key="hash" className="break-all font-mono text-xs">{contentHash ?? "—"}</span>],
        ]} />
      </Panel>

      <Panel
        title="Versiones recientes"
        description="Últimas versiones registradas del documento."
        footer={(
          <Button type="button" variant="outline" onClick={onOpenVersions}>
            Ver historial completo <ExternalLink className="size-4" aria-hidden="true" />
          </Button>
        )}
      >
        {versions.length ? (
          <ul className="divide-y divide-border">
            {versions.slice(0, 4).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-foreground">v{item.version}</span>
                <Badge variant={versionTone(item.status)}>{versionStatusLabel(item.status)}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(item.publishedAt ?? item.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyPanel text="Todavía no hay versiones registradas." />
        )}
      </Panel>

      <Panel className="xl:col-span-2" title="Aceptaciones" description="Registros guardados para este documento.">
        {!canViewAcceptances ? (
          <p className="text-sm text-muted-foreground">Tu rol no incluye el permiso legal.acceptances.view.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Aceptaciones registradas" value={acceptances ? acceptances.total.toLocaleString("es-MX") : "—"} />
              <Stat label="Última aceptación" value={acceptances?.items[0] ? formatDate(acceptances.items[0].acceptedAt) : "—"} />
              <Stat label="Versiones con aceptación" value={acceptances ? String(new Set(acceptances.items.map((item) => item.documentVersionId)).size) : "—"} />
            </div>
            {acceptances && acceptances.total === 0 && (
              <Note>Todavía no se han registrado aceptaciones para este documento.</Note>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function ContentTab({ documentId, versionId }: { documentId: string; versionId?: string }) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; content: VersionContent | null; error: string } | null>(null);
  const requestKey = `${versionId ?? ""}:${revision}`;

  useEffect(() => {
    if (!versionId) return;
    let live = true;
    getVersionContent(documentId, versionId)
      .then((content) => {
        if (live) setResult({ key: requestKey, content, error: "" });
      })
      .catch((cause) => {
        if (live) {
          setResult({
            key: requestKey,
            content: null,
            error: cause instanceof Error ? cause.message : "No se pudo cargar el contenido del documento.",
          });
        }
      });
    return () => {
      live = false;
    };
  }, [documentId, versionId, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const content = current?.content ?? null;
  const error = current?.error ?? "";
  const loading = Boolean(versionId) && !current;

  const publishedLabel = content
    ? content.status === "draft"
      ? `Borrador${content.fileName ? ` · ${content.fileName}` : ""}`
      : `Versión ${content.version}${content.fileName ? ` · ${content.fileName}` : ""}`
    : undefined;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel
        title="Contenido del documento"
        description={publishedLabel ?? "Contenido de la versión vigente."}
        action={content?.mode === "pdf" ? (
          <Button variant="outline" render={<a href={content.url ?? "#"} target="_blank" rel="noreferrer" />}>
            Abrir PDF <ExternalLink className="size-4" aria-hidden="true" />
          </Button>
        ) : undefined}
        bodyClassName="p-0"
      >
        {!versionId ? (
          <div className="p-5"><EmptyPanel text="Este documento aún no tiene una versión con contenido." /></div>
        ) : loading ? (
          <ContentSkeleton />
        ) : error ? (
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zuno-error bg-zuno-error-surface px-4 py-3">
              <p role="alert" className="text-sm text-zuno-error">{error}</p>
              <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Reintentar</Button>
            </div>
          </div>
        ) : content?.mode === "pdf" ? (
          content.url ? (
            <iframe
              src={content.url}
              title={`PDF de la versión ${content.version}`}
              className="h-[60vh] w-full rounded-b-xl border-0 bg-muted lg:h-[calc(100vh-22rem)] lg:min-h-[26rem]"
            />
          ) : (
            <div className="p-5"><EmptyPanel text="No se pudo obtener el archivo PDF." /></div>
          )
        ) : content?.html ? (
          <div className={cn("grid min-w-0 lg:h-[calc(100vh-22rem)] lg:min-h-[26rem]", content.sections.length > 1 && "md:grid-cols-[14rem_minmax(0,1fr)]")}>
            {content.sections.length > 1 && (
              <nav aria-label="Secciones del documento" className="border-b border-border p-3 md:border-b-0 md:border-r md:p-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
                <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground">Secciones</p>
                {content.sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={cn(
                      "flex min-h-10 items-center rounded-md px-3 text-sm text-supporting transition-colors hover:bg-muted hover:text-foreground",
                      section.level !== 1 && "pl-6 text-xs",
                    )}
                  >
                    <span className="truncate">{section.label}</span>
                  </a>
                ))}
              </nav>
            )}
            <div className="min-w-0 scroll-smooth motion-reduce:scroll-auto lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
              <article
                className="legal-document-content p-5 sm:p-6"
                dangerouslySetInnerHTML={{ __html: content.html }}
              />
            </div>
          </div>
        ) : (
          <div className="p-5"><EmptyPanel text="La versión no tiene contenido renderizable." /></div>
        )}
      </Panel>

      <div className="grid gap-4">
        <Panel title="Fuente publicada" description="Archivo asociado a la versión vigente.">
          <DetailList rows={[
            ["Archivo", content?.fileName ?? "Sin archivo"],
            ["Formato", content?.sourceKind?.toUpperCase() ?? "—"],
            ["Tamaño", formatBytes(content?.sizeBytes)],
            ["Hash", <span key="hash" className="break-all font-mono text-xs">{content?.contentHash ?? "—"}</span>],
            ["Secciones", content?.mode === "html" ? String(content.sections.length) : "—"],
          ]} />
        </Panel>
        <Panel title="Estado de lectura" description="Verificaciones del contenido cargado.">
          <div className="space-y-1">
            <CheckRow label="Contenido disponible" checked={Boolean(content)} />
            <CheckRow label="Formato renderizable" checked={Boolean(content?.html || content?.url)} />
            <CheckRow label="Navegación por secciones" checked={Boolean(content?.sections.length)} />
          </div>
          <Note>El contenido se sirve desde los artefactos publicados y se sanea en el backend antes de renderizarse.</Note>
        </Panel>
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-3 p-5 sm:p-6 lg:h-[calc(100vh-22rem)] lg:min-h-[26rem]" aria-busy="true">
      <Skeleton className="h-6 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="mt-6 h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function VersionsTab({ versions, draft, currentVersion, isArchived, onPublish }: { versions: LegalVersion[]; draft: LegalDraft | null; currentVersion?: LegalVersion; isArchived: boolean; onPublish: () => void }) {
  return (
    <Panel
      title="Versiones"
      description="Versiones publicadas y borrador en edición."
      action={(
        <Button onClick={onPublish} disabled={isArchived}>
          <Rocket className="size-4" aria-hidden="true" /> Publicar nueva versión
        </Button>
      )}
      bodyClassName="p-0"
    >
      <div className="grid gap-4 border-b border-border bg-surface-soft/60 p-5 sm:grid-cols-3">
        <Meta label="Versión vigente" value={currentVersion ? `v${currentVersion.version}` : "Sin publicar"} />
        <Meta label="Borrador" value={draft?.sourceFileName ?? "Sin borrador"} />
        <Meta label="Estado" value={currentVersion ? (draft ? "Publicada · borrador pendiente" : "Publicada") : draft ? "Borrador listo" : "Sin fuente"} />
      </div>

      {draft || versions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Versión</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Fuente</th>
                <th className="px-5 py-3 font-medium">Hash</th>
                <th className="px-5 py-3 font-medium">Vigencia</th>
                <th className="px-5 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {draft && (
                <tr className="border-b border-border bg-secondary/30 hover:bg-secondary/50">
                  <td className="px-5 py-3 font-medium">Borrador</td>
                  <td className="px-5 py-3"><Badge variant="info">Borrador</Badge></td>
                  <td className="px-5 py-3">
                    <span className="font-medium">{draft.sourceKind?.toUpperCase() ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{draft.sourceFileName ?? "Sin archivo"}</span>
                    <span className="block text-2xs text-muted-foreground">{formatBytes(draft.sourceSizeBytes)} · Actualizado {formatDateTime(draft.updatedAt)}</span>
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 font-mono text-xs" title={draft.contentHash ?? ""}>{draft.contentHash ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">Sin publicar</td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={onPublish} disabled={isArchived}>
                      Continuar edición
                    </Button>
                  </td>
                </tr>
              )}
              {versions.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                  <td className="px-5 py-3 font-medium">v{item.version}</td>
                  <td className="px-5 py-3"><Badge variant={versionTone(item.status)}>{versionStatusLabel(item.status)}</Badge></td>
                  <td className="px-5 py-3">
                    <span className="font-medium">{item.sourceKind?.toUpperCase() ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{item.sourceFileName ?? "Sin archivo"}</span>
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 font-mono text-xs" title={item.contentHash ?? ""}>{item.contentHash ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {formatDate(item.effectiveFrom)} — {item.effectiveUntil ? formatDate(item.effectiveUntil) : "sin fin"}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5"><EmptyPanel text="Todavía no hay versiones ni borrador." /></div>
      )}

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {versions[0] ? `Última versión registrada: v${versions[0].version}. ` : ""}
          El estado puede cambiar cuando el worker termine.
        </p>
      </div>
    </Panel>
  );
}

function ApprovalsTab({ versions }: { versions: LegalVersion[] }) {
  return (
    <Panel
      title="Versiones y publicación"
      description="Estado y responsable de publicación de cada versión del documento."
      bodyClassName="p-0"
    >
      {versions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Versión</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Publicada por</th>
                <th className="px-5 py-3 font-medium">Fecha de publicación</th>
                <th className="px-5 py-3 font-medium">Vigencia</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                  <td className="px-5 py-3 font-medium">v{version.version}</td>
                  <td className="px-5 py-3"><Badge variant={versionTone(version.status)}>{versionStatusLabel(version.status)}</Badge></td>
                  <td className="px-5 py-3">
                    <span className="block">{version.publishedBySubjectId ?? "Sin registro"}</span>
                    <span className="block text-xs text-muted-foreground">{version.publishedByIdentityIssuer ?? ""}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(version.publishedAt)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {formatDate(version.effectiveFrom)} — {version.effectiveUntil ? formatDate(version.effectiveUntil) : "sin fin"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5"><EmptyPanel text="Todavía no hay versiones registradas para este documento." /></div>
      )}
      <div className="border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          El API aún no registra aprobaciones formales por documento; esta vista muestra el estado de publicación de cada versión.
        </p>
      </div>
    </Panel>
  );
}

function AcceptanceTab({
  policy,
  currentVersion,
  versions,
  acceptances,
  loading,
  error,
  canView,
  onRetry,
}: {
  policy: DocumentTypeOption | null;
  currentVersion?: LegalVersion;
  versions: LegalVersion[];
  acceptances: DocumentAcceptances | null;
  loading: boolean;
  error: string;
  canView: boolean;
  onRetry: () => void;
}) {
  const versionLabels = new Map(versions.map((version) => [version.id, version.version]));
  const versionCount = acceptances ? new Set(acceptances.items.map((item) => item.documentVersionId)).size : 0;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Panel title="Aceptaciones" description="Registros guardados para este documento.">
        {!canView ? (
          <p className="text-sm text-muted-foreground">Tu rol no incluye el permiso legal.acceptances.view.</p>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zuno-error bg-zuno-error-surface px-4 py-3">
            <p role="alert" className="text-sm text-zuno-error">{error}</p>
            <Button variant="outline" onClick={onRetry}>Reintentar</Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total" value={loading ? "…" : String(acceptances?.total ?? 0)} />
            <Stat label="Última aceptación" value={loading ? "…" : acceptances?.items[0] ? formatDate(acceptances.items[0].acceptedAt) : "—"} />
            <Stat label="Versiones" value={loading ? "…" : String(versionCount)} />
          </div>
        )}
        <Note>Las aceptaciones se guardan por versión del documento y se consultan desde el API.</Note>
      </Panel>

      <Panel title="Configuración vigente" description="Política aplicada por el tipo de documento.">
        <DetailList rows={[
          ["Política", acceptanceLabel(policy)],
          ["Versión configurada", currentVersion ? `v${currentVersion.version}` : "Sin publicar"],
          ["Regla", policy?.acceptance === "optional" ? "Aceptación opcional" : "Aceptación individual"],
          ["Consulta de aceptaciones", canView ? "Disponible" : "Sin permiso"],
        ]} />
      </Panel>

      <Panel
        className="xl:col-span-2"
        title="Registros de aceptación"
        description="Aceptaciones guardadas para el documento, más recientes primero."
        bodyClassName="p-0"
      >
        {!canView ? (
          <div className="p-5"><EmptyPanel text="Tu rol no incluye el permiso legal.acceptances.view." /></div>
        ) : loading ? (
          <AcceptanceSkeleton />
        ) : acceptances?.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 font-medium">Versión</th>
                  <th className="px-5 py-3 font-medium">Modo</th>
                  <th className="px-5 py-3 font-medium">Organización</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {acceptances.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                    <td className="px-5 py-3">
                      <span className="block font-medium">{item.acceptedBySubjectId}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.acceptedByIdentityIssuer}
                        {item.roleAtAcceptance ? ` · ${item.roleAtAcceptance}` : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3">{versionLabels.get(item.documentVersionId) ? `v${versionLabels.get(item.documentVersionId)}` : "—"}</td>
                    <td className="px-5 py-3"><Badge variant="info">{acceptanceModeLabel(item.acceptanceMode)}</Badge></td>
                    <td className="px-5 py-3 text-muted-foreground">{item.organizationId ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDateTime(item.acceptedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyPanel text="Todavía no se han registrado aceptaciones para este documento." /></div>
        )}
        {acceptances && acceptances.total > acceptances.items.length && (
          <div className="border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Mostrando las últimas {acceptances.items.length} de {acceptances.total} aceptaciones.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AcceptanceSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-busy="true">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-5 w-5/6" />
    </div>
  );
}

const AUDIT_PAGE_SIZE = 20;

function AuditTab({ document, versions, canView }: { document: LegalDocument; versions: LegalVersion[]; canView: boolean }) {
  const [trail, setTrail] = useState<DocumentAuditTrail | null>(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!canView) return;
    let live = true;
    listDocumentAuditEvents(document.id, { page: 1, limit: AUDIT_PAGE_SIZE })
      .then((data) => {
        if (live) {
          setTrail(data);
          setError("");
        }
      })
      .catch((cause) => {
        if (live) {
          setTrail(null);
          setError(cause instanceof Error ? cause.message : "No se pudo cargar la auditoría del documento.");
        }
      });
    return () => {
      live = false;
    };
  }, [canView, document.id, revision]);

  const loading = canView && !trail && !error;
  const actors = trail ? new Set(trail.items.map((event) => `${event.actorIdentityIssuer}:${event.actorSubjectId}`)).size : 0;
  const versionLabels = new Map(versions.map((version) => [version.id, version.version]));
  const groups = trail ? groupAuditEvents(trail.items) : [];
  const hasMore = Boolean(trail && trail.items.length < trail.total);

  async function loadMore() {
    if (!trail || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = await listDocumentAuditEvents(document.id, { page: trail.page + 1, limit: trail.limit });
      setTrail({ ...next, items: [...trail.items, ...next.items] });
    } catch (cause) {
      setMoreError(cause instanceof Error ? cause.message : "No se pudieron cargar más eventos.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel
        title="Actividad del documento"
        description="Eventos de auditoría registrados para el documento, sus versiones y aceptaciones."
      >
        {!canView ? (
          <p className="text-sm text-muted-foreground">Tu rol no incluye el permiso legal.audit.view.</p>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zuno-error bg-zuno-error-surface px-4 py-3">
            <p role="alert" className="text-sm text-zuno-error">{error}</p>
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setTrail(null);
                setRevision((value) => value + 1);
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : loading ? (
          <AuditSkeleton />
        ) : groups.length ? (
          <>
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.label}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                  <ol>
                    {group.items.map((event, index) => {
                      const config = auditActionConfig[event.action];
                      const Icon = config?.icon ?? History;
                      const version = event.entityType === "legal_document_version" ? versionLabels.get(event.entityId ?? "") : undefined;
                      return (
                        <li key={event.id} className="flex gap-3 pb-4 last:pb-0">
                          <div className="flex flex-col items-center">
                            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", auditToneClasses[config?.tone ?? "neutral"])}>
                              <Icon className="size-4" aria-hidden="true" />
                            </span>
                            {index < group.items.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-1 pb-1">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{config?.label ?? event.action}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {auditEntityLabel(event.entityType)}{version ? ` v${version}` : ""} · <span className="font-mono">{event.action}</span>
                              </p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>{formatTime(event.createdAt)}</p>
                              <p className="mt-0.5 text-foreground">{event.actorSubjectId}</p>
                              <p className="text-2xs">{event.actorIdentityIssuer}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {trail?.items.length} de {trail?.total} eventos
              </p>
              {hasMore && (
                <Button variant="outline" onClick={() => void loadMore()} loading={loadingMore}>
                  Ver más
                </Button>
              )}
            </div>
            {moreError && <p role="alert" className="mt-2 text-xs text-zuno-error">{moreError}</p>}
          </>
        ) : (
          <EmptyPanel text="No hay eventos de auditoría registrados para este documento." />
        )}
      </Panel>

      <Panel title="Resumen de actividad" description="Indicadores de los eventos mostrados.">
        <DetailList rows={[
          ["Eventos registrados", canView ? (loading ? "…" : String(trail?.total ?? 0)) : "Sin permiso"],
          ["Última actividad", canView ? (loading ? "…" : formatDateTime(trail?.items[0]?.createdAt)) : "Sin permiso"],
          ["Actores", canView ? (loading ? "…" : String(actors)) : "Sin permiso"],
          ["Periodo mostrado", canView ? (loading ? "…" : auditRangeLabel(trail)) : "Sin permiso"],
        ]} />
      </Panel>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

function Panel({
  title,
  description,
  badge,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {(badge || action) && <div className="flex shrink-0 items-center gap-2">{badge}{action}</div>}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-border px-5 py-4">{footer}</div>}
    </section>
  );
}

function DetailList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.1fr)] items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <dt className="pt-0.5 text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-soft p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground" title={value}>{value}</p>
    </div>
  );
}

function CheckRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 text-sm">
      <span className="text-foreground">{label}</span>
      <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", checked ? "text-zuno-success" : "text-muted-foreground")}>
        {checked ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <CircleMinus className="size-4" aria-hidden="true" />}
        {checked ? "Cumple" : "Pendiente"}
      </span>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs text-muted-foreground">{children}</p>;
}

function EmptyPanel({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function versionStatusLabel(status: LegalVersion["status"]) {
  return { published: "Vigente", draft: "Borrador", superseded: "Obsoleta", archived: "Archivada" }[status];
}

function versionTone(status: LegalVersion["status"]): "success" | "info" | "neutral" {
  if (status === "published") return "success";
  if (status === "draft") return "info";
  return "neutral";
}

function acceptanceLabel(policy: DocumentTypeOption | null) {
  if (!policy) return "No disponible";
  return policy.acceptance === "optional" ? "Opcional" : policy.acceptance === "configurable" ? "Configurable" : "Requerida";
}

const auditActionConfig: Record<string, { label: string; tone: AuditTone; icon: LucideIcon }> = {
  "legal.document.create": { label: "Documento creado", tone: "info", icon: FilePlus2 },
  "legal.document.edit": { label: "Documento actualizado", tone: "info", icon: FilePen },
  "legal.document.archive": { label: "Documento archivado", tone: "warning", icon: Archive },
  "legal.document.delete": { label: "Documento eliminado", tone: "error", icon: Trash2 },
  "legal.version.draft_create": { label: "Borrador creado", tone: "neutral", icon: FilePlus2 },
  "legal.version.draft_edit": { label: "Borrador actualizado", tone: "neutral", icon: FilePen },
  "legal.version.publish": { label: "Versión publicada", tone: "success", icon: Rocket },
  "legal.publication.request": { label: "Publicación solicitada", tone: "info", icon: Upload },
  "legal.publication.retry": { label: "Publicación reintentada", tone: "warning", icon: RefreshCw },
  "legal.acceptance.record": { label: "Aceptación registrada", tone: "success", icon: ClipboardCheck },
  "legal.acceptance.export": { label: "Aceptaciones exportadas", tone: "neutral", icon: Download },
};

type AuditTone = "info" | "success" | "warning" | "error" | "neutral";

const auditToneClasses: Record<AuditTone, string> = {
  info: "bg-secondary text-primary",
  success: "bg-zuno-success-surface text-zuno-success",
  warning: "bg-zuno-warning-surface text-zuno-warning",
  error: "bg-zuno-error-surface text-zuno-error",
  neutral: "bg-muted text-muted-foreground",
};

function auditEntityLabel(entityType: string) {
  return {
    legal_document: "Documento",
    legal_document_version: "Versión",
    legal_publication: "Publicación",
    legal_acceptance: "Aceptación",
  }[entityType] ?? entityType;
}

function groupAuditEvents(items: DocumentAuditEvent[]) {
  const groups: Array<{ label: string; items: DocumentAuditEvent[] }> = [];
  for (const item of items) {
    const label = auditDayLabel(item.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function auditDayLabel(value: string) {
  const date = new Date(value);
  const startOfDay = (target: Date) => new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(date);
}

function auditRangeLabel(trail: DocumentAuditTrail | null) {
  if (!trail?.items.length) return "—";
  return `${formatDate(trail.items[trail.items.length - 1].createdAt)} — ${formatDate(trail.items[0].createdAt)}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(new Date(value));
}

function acceptanceModeLabel(mode: string) {
  return { individual: "Individual", organization_representative: "Representante", informational: "Informativa" }[mode] ?? mode;
}

function documentTypeLabel(value: string) {
  return value === "terms_and_conditions" ? "Términos y condiciones" : value.replaceAll("_", " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function hasPermission(granted: string[], required: string) {
  return granted.some((permission) => permission === "*.*" || permission === required || (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))));
}
