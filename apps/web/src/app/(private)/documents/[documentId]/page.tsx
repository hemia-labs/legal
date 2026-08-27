"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileArchive,
  FileText,
  LoaderCircle,
  RefreshCw,
  Rocket,
  Upload,
} from "lucide-react";
import { useLegalSession } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LegalDocument,
  DocumentTypeOption,
  LegalDraft,
  LegalVersion,
  PublicationPreview,
  PublicationResult,
  SourceKind,
  getDocument,
  getDocumentDraft,
  listDocumentTypes,
  listVersions,
  previewPublication,
  publishDraft,
  sourceKindFor,
  uploadDocumentSource,
} from "@/services/document.service";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function DocumentDetailPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const router = useRouter();
  const session = useLegalSession();
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [policy, setPolicy] = useState<DocumentTypeOption | null>(null);
  const [draft, setDraft] = useState<LegalDraft | null>(null);
  const [versions, setVersions] = useState<LegalVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PublicationPreview | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publication, setPublication] = useState<PublicationResult | null>(null);
  const [version, setVersion] = useState("1.0.0");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [acceptanceDeadline, setAcceptanceDeadline] = useState("");
  const [gracePeriodDays, setGracePeriodDays] = useState("0");
  const [acceptanceMode, setAcceptanceMode] = useState<"individual" | "organization_representative" | "informational">("individual");
  const [isBlocking, setIsBlocking] = useState(true);

  const permissions = session.permissions;
  const canView = hasPermission(permissions, "legal.documents.view");
  const canUpload = hasPermission(permissions, "legal.versions.create");
  const canReplace = hasPermission(permissions, "legal.versions.edit");
  const canPreview = hasPermission(permissions, "legal.versions.view");
  const canPublish = hasPermission(permissions, "legal.versions.publish");
  const isArchived = document?.status === "archived";

  const load = useCallback(async (silent = false) => {
    if (!canView) {
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [documentRow, versionRows, typeRows] = await Promise.all([getDocument(documentId), listVersions(documentId), listDocumentTypes()]);
      setDocument(documentRow);
      setPolicy(typeRows.find(({ code }) => code === documentRow.documentType) ?? null);
      setVersions(versionRows);
      try {
        setDraft(await getDocumentDraft(documentId));
      } catch {
        setDraft(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el documento.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView, documentId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const latestVersion = versions[0];
  const fileLabel = useMemo(() => {
    if (!file) return "Ningún archivo seleccionado";
    return `${file.name} · ${formatBytes(file.size)}`;
  }, [file]);

  function selectFile(selected: File | undefined) {
    setFileError("");
    setFile(selected ?? null);
    if (!selected) {
      setSourceKind(null);
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFileError("El archivo supera el límite de 10 MiB.");
      setSourceKind(null);
      return;
    }
    const kind = sourceKindFor(selected);
    if (!kind || (policy && !policy.allowedSourceKinds.includes(kind))) {
      setFileError(`Formato no permitido. Este tipo acepta: ${policy?.allowedSourceKinds.join(", ") ?? "ninguno"}.`);
      setSourceKind(null);
      return;
    }
    setSourceKind(kind);
  }

  async function uploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !sourceKind || !document || isArchived) return;
    setUploading(true);
    setError("");
    try {
      await uploadDocumentSource(document.id, file, sourceKind, draft ? "PATCH" : "POST");
      setFile(null);
      setSourceKind(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la fuente.");
    } finally {
      setUploading(false);
    }
  }

  function publicationPayload() {
    const until = toIso(effectiveUntil);
    const deadline = toIso(acceptanceDeadline);
    return {
      version,
      effectiveFrom: toIso(effectiveFrom) ?? new Date().toISOString(),
      ...(until ? { effectiveUntil: until } : {}),
      ...(deadline ? { acceptanceDeadline: deadline } : {}),
      gracePeriodDays: Number(gracePeriodDays) || 0,
      ...(policy?.acceptance === "optional" ? {} : { rules: [{ acceptanceMode, isBlocking }] }),
    };
  }

  async function previewDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document || !draft || isArchived || !canPreview) return;
    setError("");
    try {
      setPreview(await previewPublication(document.id, publicationPayload()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo previsualizar la publicación.");
    }
  }

  async function publish() {
    if (!document || !draft || isArchived || !canPublish) return;
    setPublishing(true);
    setError("");
    try {
      const result = await publishDraft(document.id, publicationPayload());
      setPublication(result);
      setPreview(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo publicar la versión.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <DetailSkeleton />;
  if (!canView) return <State title="Sin acceso al documento" description="Tu rol no incluye legal.documents.view." />;
  if (!document) return <State title="Documento no encontrado" description={error || "No existe o no tienes acceso a este documento."} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" className="mb-3 -ml-3 h-12" onClick={() => router.push("/documents")}>
            <ArrowLeft className="size-4" /> Documentos
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold leading-none">{document.title}</h1>
            <Badge variant={isArchived ? "neutral" : "success"}>{isArchived ? "Archivado" : "Activo"}</Badge>
          </div>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{document.key} · {document.locale} · {document.documentType} · {document.documentVariant}</p>
          <p className="mt-1 text-sm text-muted-foreground">Flujo: {policy?.workflow === "internal" ? "interno" : "público"} · Fuentes: {policy?.allowedSourceKinds.join(", ")}</p>
        </div>
        <Button variant="outline" className="h-12" onClick={() => void load(true)} disabled={refreshing}>
          {refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Actualizar
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {isArchived && <Notice tone="warning">Este documento está archivado. No se puede editar, versionar, publicar ni servir públicamente.</Notice>}
      {publication && <Notice tone={publication.status === "failed" ? "error" : "info"}>
        {publication.status === "failed" ? "La publicación falló." : "Publicación solicitada; el procesamiento está pendiente."}
      </Notice>}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <SectionTitle icon={<Upload className="size-4" />} title={draft ? "Reemplazar fuente" : "Cargar fuente"} />
          <p className="mt-1 text-sm text-muted-foreground">{policy?.allowedSourceKinds.join(", ")} · Tamaño máximo: 10 MiB.</p>
          <form onSubmit={uploadSource} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Archivo fuente</span>
              <Input
                type="file"
                accept={acceptAttribute(policy?.allowedSourceKinds ?? [])}
                className="h-12 cursor-pointer py-2"
                onChange={(event) => selectFile(event.target.files?.[0])}
                disabled={isArchived || (!draft ? !canUpload : !canReplace)}
              />
            </label>
            <div className="rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-3 text-sm">
              <p className="font-medium">{fileLabel}</p>
              {sourceKind && <p className="mt-1 text-muted-foreground">Tipo detectado: {sourceKind}</p>}
            </div>
            {fileError && <p className="text-sm text-error" role="alert">{fileError}</p>}
            <Button className="h-12" disabled={!file || !sourceKind || uploading || isArchived || (!draft ? !canUpload : !canReplace)}>
              {uploading && <LoaderCircle className="size-4 animate-spin" />}
              {uploading ? "Cargando…" : draft ? "Reemplazar fuente" : "Subir fuente"}
            </Button>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <SectionTitle icon={<FileText className="size-4" />} title="Metadata del draft" />
          {draft ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Meta label="Estado" value="draft" />
              <Meta label="Tipo de fuente" value={draft.sourceKind ?? "—"} />
              <Meta label="Nombre" value={draft.sourceFileName ?? "—"} />
              <Meta label="MIME / tamaño" value={`${draft.sourceContentType ?? "—"} · ${formatBytes(draft.sourceSizeBytes)}`} />
              <Meta label="sourceHash" value={draft.sourceHash ?? "—"} mono />
              <Meta label="contentHash" value={draft.contentHash ?? "—"} mono />
            </div>
          ) : (
            <EmptyPanel text="Todavía no hay una fuente cargada para este documento." />
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <SectionTitle icon={<Rocket className="size-4" />} title="Publicar versión" />
        <p className="mt-1 text-sm text-muted-foreground">La publicación se procesa de forma asíncrona y genera artefactos seguros en S3.</p>
        <form onSubmit={previewDraft} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Versión"><Input className="h-12" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" pattern="^\\d+\\.\\d+\\.\\d+$" aria-invalid={!/^\d+\.\d+\.\d+$/.test(version)} /></Field>
          <Field label="Fecha efectiva"><Input className="h-12" type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field>
          <Field label="Fecha de expiración"><Input className="h-12" type="datetime-local" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /></Field>
          <Field label="Deadline de aceptación"><Input className="h-12" type="datetime-local" value={acceptanceDeadline} onChange={(event) => setAcceptanceDeadline(event.target.value)} /></Field>
          <Field label="Periodo de gracia (días)"><Input className="h-12" type="number" min="0" value={gracePeriodDays} onChange={(event) => setGracePeriodDays(event.target.value)} /></Field>
          {policy?.acceptance !== "optional" && <Field label="Regla de aceptación">
            <Select value={acceptanceMode} onValueChange={(value) => setAcceptanceMode(value as typeof acceptanceMode)}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="organization_representative">Representante de organización</SelectItem>
                <SelectItem value="informational">Informativa</SelectItem>
              </SelectContent>
            </Select>
          </Field>}
          {policy?.acceptance !== "optional" && <label className="flex h-12 items-center gap-3 text-sm font-medium md:col-span-2">
            <input type="checkbox" checked={isBlocking} onChange={(event) => setIsBlocking(event.target.checked)} />
            La aceptación bloquea el acceso
          </label>}
          <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-3">
            <Button className="h-12" type="submit" disabled={!draft || isArchived || !canPreview || !/^\d+\.\d+\.\d+$/.test(version)}>
              <CheckCircle2 className="size-4" /> Previsualizar conflictos
            </Button>
            <Button className="h-12" type="button" variant="outline" onClick={() => void publish()} disabled={!preview?.canPublish || publishing || !canPublish}>
              {publishing ? <LoaderCircle className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {publishing ? "Publicando…" : "Publicar"}
            </Button>
          </div>
        </form>
        {preview && <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
          <p className="font-medium">Preview para {preview.version}</p>
          {preview.conflicts.length ? <ul className="mt-2 list-disc pl-5 text-error">{preview.conflicts.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-success">No se detectaron conflictos.</p>}
          {!preview.canPublish && <p className="mt-2 text-error">La versión no puede publicarse todavía.</p>}
        </div>}
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <SectionTitle icon={<Clock3 className="size-4" />} title="Historial de versiones" />
        {versions.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Versión</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 font-medium">Fuente</th><th className="px-3 py-3 font-medium">Hash</th><th className="px-3 py-3 font-medium">Fechas</th><th className="px-3 py-3 font-medium">Assets</th></tr></thead><tbody>{versions.map((item) => <tr key={item.id} className="border-b border-border last:border-0"><td className="px-3 py-3 font-medium">{item.version}</td><td className="px-3 py-3"><Badge variant={item.status === "published" ? "success" : "neutral"}>{item.status}</Badge></td><td className="px-3 py-3">{item.sourceKind ?? "—"}<span className="block text-xs text-muted-foreground">{item.sourceFileName ?? ""}</span></td><td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs" title={item.contentHash ?? ""}>{item.contentHash ?? "—"}</td><td className="px-3 py-3 text-muted-foreground">{formatDate(item.publishedAt ?? item.createdAt)}</td><td className="px-3 py-3">{item.status === "published" ? "Artefactos publicados" : "Pendiente"}</td></tr>)}</tbody></table></div> : <EmptyPanel text="Todavía no hay versiones publicadas." />}
        {latestVersion && <p className="mt-4 text-xs text-muted-foreground">Última versión: {latestVersion.version}. El estado puede cambiar cuando el worker termine.</p>}
      </section>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <h2 className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h2>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}</label>;
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 truncate text-sm ${mono ? "font-mono" : ""}`} title={value}>{value}</p></div>;
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "error" | "warning" | "info" }) {
  const styles = { error: "border-error bg-error-subtle text-error", warning: "border-warning bg-warning-subtle text-warning", info: "border-info bg-info-subtle text-info" };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`} role="status">{children}</div>;
}

function State({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-panel-min place-items-center text-center"><div><FileArchive className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>;
}

function DetailSkeleton() {
  return <div className="space-y-6" aria-busy="true"><Skeleton className="h-12 w-72" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div><Skeleton className="h-80" /><Skeleton className="h-64" /></div>;
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatBytes(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function hasPermission(granted: string[], required: string) {
  return granted.some((permission) => permission === "*.*" || permission === required || (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))));
}

function acceptAttribute(kinds: SourceKind[]) {
  return kinds.map((kind) => ({ pdf: ".pdf,application/pdf", html: ".html,.htm,text/html", markdown: ".md,.markdown,text/markdown" }[kind])).join(",");
}
