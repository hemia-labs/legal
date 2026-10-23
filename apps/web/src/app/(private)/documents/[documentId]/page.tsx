"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileArchive } from "lucide-react";
import { useLegalSession } from "@/components/app-shell";
import { DocumentDetailHeader } from "@/components/documents/document-detail-header";
import { DocumentDetailTabs, type DocumentDetailTabValue } from "@/components/documents/document-detail-tabs";
import { DocumentPublicationSheet, type PublicationStep } from "@/components/documents/document-publication-sheet";
import { Skeleton } from "@/components/zuno/skeleton";
import {
  type DocumentTypeOption,
  type LegalDocument,
  type LegalDraft,
  type LegalVersion,
  type PublicationPreview,
  type PublicationResult,
  type SourceKind,
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
  const session = useLegalSession();
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [policy, setPolicy] = useState<DocumentTypeOption | null>(null);
  const [draft, setDraft] = useState<LegalDraft | null>(null);
  const [versions, setVersions] = useState<LegalVersion[]>([]);
  const [activeTab, setActiveTab] = useState<DocumentDetailTabValue>("summary");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PublicationPreview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationSheetOpen, setPublicationSheetOpen] = useState(false);
  const [publicationStep, setPublicationStep] = useState<PublicationStep>(1);
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

  const currentVersion = versions.find((item) => item.status === "published");
  const statusLabel = isArchived ? "Archivado" : currentVersion ? "Publicado" : draft ? "Borrador" : "Activo";
  const statusVariant: "neutral" | "success" | "warning" = isArchived ? "neutral" : currentVersion ? "success" : "warning";

  function openPublicationSheet() {
    setPublicationStep(1);
    setPublicationSheetOpen(true);
  }

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

  async function continueFromSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document || isArchived) return;
    if (!file && !draft) {
      setFileError("Carga una fuente para continuar con la publicación.");
      return;
    }
    if (!file || !sourceKind) {
      setPublicationStep(2);
      return;
    }
    setUploading(true);
    setError("");
    try {
      await uploadDocumentSource(document.id, file, sourceKind, draft ? "PATCH" : "POST");
      setFile(null);
      setSourceKind(null);
      await load(true);
      setPublicationStep(2);
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

  async function reviewPublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document || !draft || isArchived || !canPreview) return;
    setReviewing(true);
    setError("");
    try {
      setPreview(await previewPublication(document.id, publicationPayload()));
      setPublicationStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo previsualizar la publicación.");
    } finally {
      setReviewing(false);
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
      setPublicationSheetOpen(false);
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
    <div className="flex min-w-0 flex-col gap-6">
      <DocumentDetailHeader
        document={document}
        policy={policy}
        currentVersion={currentVersion}
        statusLabel={statusLabel}
        statusVariant={statusVariant}
        refreshing={refreshing}
        isArchived={Boolean(isArchived)}
        hasDraft={Boolean(draft)}
        onRefresh={() => void load(true)}
        onPublish={openPublicationSheet}
        onOpenTab={setActiveTab}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {isArchived && <Notice tone="warning">Este documento está archivado. No se puede editar, versionar, publicar ni servir públicamente.</Notice>}
      {publication && <Notice tone={publication.status === "failed" ? "error" : "info"}>{publication.status === "failed" ? "La publicación falló." : "Publicación solicitada; el procesamiento está pendiente."}</Notice>}

      <DocumentDetailTabs
        value={activeTab}
        onValueChange={setActiveTab}
        document={document}
        policy={policy}
        draft={draft}
        versions={versions}
        currentVersion={currentVersion}
        statusLabel={statusLabel}
        statusVariant={statusVariant}
        permissions={permissions}
        isArchived={Boolean(isArchived)}
        onPublish={openPublicationSheet}
        onOpenVersions={() => setActiveTab("versions")}
      />

      <DocumentPublicationSheet
        open={publicationSheetOpen}
        onOpenChange={setPublicationSheetOpen}
        policy={policy}
        draft={draft}
        currentVersion={currentVersion}
        file={file}
        sourceKind={sourceKind}
        fileError={fileError}
        publicationStep={publicationStep}
        version={version}
        effectiveFrom={effectiveFrom}
        effectiveUntil={effectiveUntil}
        acceptanceDeadline={acceptanceDeadline}
        gracePeriodDays={gracePeriodDays}
        acceptanceMode={acceptanceMode}
        isBlocking={isBlocking}
        preview={preview}
        uploading={uploading}
        reviewing={reviewing}
        publishing={publishing}
        isArchived={Boolean(isArchived)}
        canUpload={canUpload}
        canReplace={canReplace}
        canPreview={canPreview}
        canPublish={canPublish}
        onSelectFile={selectFile}
        onContinueFromSource={continueFromSource}
        onReviewPublication={reviewPublication}
        onPublish={publish}
        onStepChange={setPublicationStep}
        onVersionChange={setVersion}
        onEffectiveFromChange={setEffectiveFrom}
        onEffectiveUntilChange={setEffectiveUntil}
        onAcceptanceDeadlineChange={setAcceptanceDeadline}
        onGracePeriodDaysChange={setGracePeriodDays}
        onAcceptanceModeChange={setAcceptanceMode}
        onBlockingChange={setIsBlocking}
      />
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "error" | "warning" | "info" }) {
  const styles = { error: "border-error bg-error-subtle text-error", warning: "border-warning bg-warning-subtle text-warning", info: "border-info bg-info-subtle text-info" };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`} role="status">{children}</div>;
}

function State({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-panel-min place-items-center text-center"><div><FileArchive className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>;
}

function DetailSkeleton() {
  return <div className="space-y-6" aria-busy="true"><Skeleton className="h-48" /><Skeleton className="h-12" /><Skeleton className="h-96" /></div>;
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hasPermission(granted: string[], required: string) {
  return granted.some((permission) => permission === "*.*" || permission === required || (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))));
}
