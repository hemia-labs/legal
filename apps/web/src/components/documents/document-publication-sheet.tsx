"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Check, CheckCircle2, LoaderCircle, Rocket } from "lucide-react";
import { Button } from "@/components/zuno/button";
import { Input } from "@/components/zuno/input";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DocumentTypeOption, LegalDraft, LegalVersion, PublicationPreview, SourceKind } from "@/services/document.service";

export type PublicationStep = 1 | 2 | 3 | 4;

const versionPattern = /^\d+\.\d+\.\d+$/;

const publicationSteps: Array<{ number: PublicationStep; label: string }> = [
  { number: 1, label: "Fuente" },
  { number: 2, label: "Vigencia y reglas" },
  { number: 3, label: "Revisión" },
  { number: 4, label: "Confirmación" },
];

export function DocumentPublicationSheet({
  open,
  onOpenChange,
  policy,
  draft,
  currentVersion,
  file,
  sourceKind,
  fileError,
  publicationStep,
  version,
  effectiveFrom,
  effectiveUntil,
  acceptanceDeadline,
  gracePeriodDays,
  acceptanceMode,
  isBlocking,
  preview,
  uploading,
  reviewing,
  publishing,
  isArchived,
  canUpload,
  canReplace,
  canPreview,
  canPublish,
  onSelectFile,
  onContinueFromSource,
  onReviewPublication,
  onPublish,
  onStepChange,
  onVersionChange,
  onEffectiveFromChange,
  onEffectiveUntilChange,
  onAcceptanceDeadlineChange,
  onGracePeriodDaysChange,
  onAcceptanceModeChange,
  onBlockingChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: DocumentTypeOption | null;
  draft: LegalDraft | null;
  currentVersion?: LegalVersion;
  file: File | null;
  sourceKind: SourceKind | null;
  fileError: string;
  publicationStep: PublicationStep;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string;
  acceptanceDeadline: string;
  gracePeriodDays: string;
  acceptanceMode: "individual" | "organization_representative" | "informational";
  isBlocking: boolean;
  preview: PublicationPreview | null;
  uploading: boolean;
  reviewing: boolean;
  publishing: boolean;
  isArchived: boolean;
  canUpload: boolean;
  canReplace: boolean;
  canPreview: boolean;
  canPublish: boolean;
  onSelectFile: (file: File | undefined) => void;
  onContinueFromSource: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onReviewPublication: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onPublish: () => void | Promise<void>;
  onStepChange: (step: PublicationStep) => void;
  onVersionChange: (value: string) => void;
  onEffectiveFromChange: (value: string) => void;
  onEffectiveUntilChange: (value: string) => void;
  onAcceptanceDeadlineChange: (value: string) => void;
  onGracePeriodDaysChange: (value: string) => void;
  onAcceptanceModeChange: (value: "individual" | "organization_representative" | "informational") => void;
  onBlockingChange: (value: boolean) => void;
}) {
  const sourceFileName = draft?.sourceFileName ?? currentVersion?.sourceFileName;
  const sourceKindLabel = draft?.sourceKind ?? currentVersion?.sourceKind;
  const sourceSize = draft?.sourceSizeBytes ?? currentVersion?.sourceSizeBytes;
  const canUseFile = draft ? canReplace : canUpload;
  const hasAcceptance = policy?.acceptance !== "optional";
  const allowedFormats = formatSourceKinds(policy?.allowedSourceKinds ?? []);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [publicationStep]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader className="shrink-0">
          <SheetTitle>Publicar nueva versión</SheetTitle>
          <SheetDescription>Prepara la versión y publícala al confirmar.</SheetDescription>
          <Stepper step={publicationStep} />
        </SheetHeader>

        <SheetBody ref={bodyRef}>
          {publicationStep === 1 && (
            <form id="publication-source-form" onSubmit={(event) => void onContinueFromSource(event)} className="space-y-5">
              <StepIntro
                title="Fuente del documento"
                description="Archivo que se publicará con esta versión."
              />

              <Section title="Fuente del borrador actual">
                {sourceFileName ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 break-all text-sm font-medium text-foreground">{sourceFileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {sourceKindLabel ? sourceKindLabel.toUpperCase() : "Sin formato"} · {formatBytes(sourceSize)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Este documento no tiene una fuente cargada. Sube un archivo para continuar.</p>
                )}
              </Section>

              <div>
                <p className="mb-2 text-sm font-medium">{draft ? "Reemplazar fuente (opcional)" : "Cargar fuente"}</p>
                <FileDropzone
                  id="publication-source"
                  file={file}
                  accept={acceptAttribute(policy?.allowedSourceKinds ?? [])}
                  helperText={`Formatos permitidos: ${allowedFormats || "—"}. Tamaño máximo 10 MiB.`}
                  error={fileError}
                  disabled={isArchived || !canUseFile}
                  onFileChange={onSelectFile}
                />
              </div>
            </form>
          )}

          {publicationStep === 2 && (
            <form id="publication-config-form" onSubmit={(event) => void onReviewPublication(event)} className="space-y-5">
              <StepIntro
                title="Vigencia y reglas"
                description="Define cuándo aplica y cómo se acepta."
              />

              <Section title="Identificación de la versión">
                <Field
                  label="Número de versión"
                  required
                  help="Formato mayor.menor.parche, por ejemplo 1.2.0."
                  error={!versionPattern.test(version) ? "Usa tres números separados por puntos." : undefined}
                >
                  <Input
                    value={version}
                    onChange={(event) => onVersionChange(event.target.value)}
                    placeholder="1.0.0"
                    pattern={versionPattern.source}
                    required
                    maxLength={40}
                    aria-invalid={!versionPattern.test(version)}
                  />
                </Field>
              </Section>

              <Section title="Vigencia">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Vigente desde">
                    <Input type="datetime-local" value={effectiveFrom} onChange={(event) => onEffectiveFromChange(event.target.value)} />
                  </Field>
                  <Field label="Vigente hasta">
                    <Input type="datetime-local" value={effectiveUntil} onChange={(event) => onEffectiveUntilChange(event.target.value)} />
                  </Field>
                  <Field label="Fecha límite de aceptación">
                    <Input type="datetime-local" value={acceptanceDeadline} onChange={(event) => onAcceptanceDeadlineChange(event.target.value)} />
                  </Field>
                  <Field label="Días de gracia">
                    <Input type="number" min="0" value={gracePeriodDays} onChange={(event) => onGracePeriodDaysChange(event.target.value)} />
                  </Field>
                </div>
              </Section>

              {hasAcceptance && (
                <Section title="Reglas de aceptación">
                  <div className="grid gap-4">
                    <Field label="Regla de aceptación">
                      <Select value={acceptanceMode} onValueChange={(value) => onAcceptanceModeChange(value as typeof acceptanceMode)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="organization_representative">Representante de organización</SelectItem>
                          <SelectItem value="informational">Informativa</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0"
                        checked={isBlocking}
                        onChange={(event) => onBlockingChange(event.target.checked)}
                      />
                      Bloquear el acceso hasta aceptar
                    </label>
                  </div>
                </Section>
              )}

              {(!canPreview || !draft) && (
                <p role="alert" className="rounded-lg bg-warning-subtle px-4 py-3 text-sm text-warning">
                  {!draft
                    ? "No hay un borrador con fuente para revisar."
                    : "Tu rol no incluye legal.versions.view para revisar la publicación."}
                </p>
              )}
            </form>
          )}

          {publicationStep === 3 && preview && (
            <div className="space-y-5">
              <StepIntro
                title="Revisión"
                description="Revisa el resumen antes de confirmar."
              />

              <div className={cn("rounded-lg border p-4 text-sm", preview.canPublish ? "border-success bg-success-subtle" : "border-error bg-error-subtle")}>
                <p className="font-semibold">{preview.canPublish ? "La versión puede publicarse" : "La versión requiere ajustes"}</p>
                {preview.conflicts.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-error">
                    {preview.conflicts.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="mt-1 text-success">No se detectaron conflictos con la versión vigente.</p>
                )}
              </div>

              <Section title="Resumen de la publicación">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Meta label="Versión a publicar" value={preview.version} />
                  <Meta label="Versión vigente actual" value={preview.currentPublished?.version ?? "Ninguna"} />
                  <Meta label="Fuente" value={draft?.sourceFileName ?? "—"} />
                  <Meta label="Vigente desde" value={effectiveFrom ? formatDateTime(toIso(effectiveFrom)) : "Al publicar"} />
                  <Meta label="Vigente hasta" value={effectiveUntil ? formatDateTime(toIso(effectiveUntil)) : "Sin vencimiento"} />
                  <Meta label="Regla de aceptación" value={acceptanceLabel(policy, acceptanceMode)} />
                  <Meta label="Reglas de aceptación configuradas" value={String(preview.rulesCount)} />
                  {hasAcceptance && <Meta label="Bloquea el acceso" value={isBlocking ? "Sí" : "No"} />}
                </dl>
              </Section>

              <Section title="Huellas de integridad">
                <dl className="space-y-2">
                  <Meta label="Hash de la fuente (SHA-256)" value={draft?.sourceHash ?? "—"} mono />
                  <Meta label="Hash del contenido publicado" value={draft?.contentHash ?? "—"} mono />
                </dl>
              </Section>
            </div>
          )}

          {publicationStep === 4 && (
            <div className="space-y-5">
              <StepIntro
                title="Confirmación"
                description="Confirma los datos finales."
              />

              <Section title="Datos de la versión">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Meta label="Versión" value={version} />
                  <Meta label="Fuente" value={draft?.sourceFileName ?? "—"} />
                  <Meta label="Vigente desde" value={effectiveFrom ? formatDateTime(toIso(effectiveFrom)) : "Al publicar"} />
                  <Meta label="Vigente hasta" value={effectiveUntil ? formatDateTime(toIso(effectiveUntil)) : "Sin vencimiento"} />
                  <Meta label="Límite de aceptación" value={acceptanceDeadline ? formatDateTime(toIso(acceptanceDeadline)) : "Sin límite"} />
                  <Meta label="Días de gracia" value={`${Number(gracePeriodDays) || 0} días`} />
                  {hasAcceptance && <Meta label="Regla de aceptación" value={acceptanceLabel(policy, acceptanceMode)} />}
                  {hasAcceptance && <Meta label="Bloquea el acceso" value={isBlocking ? "Sí" : "No"} />}
                </dl>
              </Section>

              <p className="rounded-lg bg-info-subtle px-4 py-3 text-sm text-info">
                La publicación se procesa en segundo plano.
              </p>

              {!canPublish && (
                <p role="alert" className="rounded-lg bg-warning-subtle px-4 py-3 text-sm text-warning">
                  Tu rol no incluye legal.versions.publish para publicar versiones.
                </p>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter className="-mt-4 flex shrink-0 flex-row justify-end">
          {publicationStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onStepChange((publicationStep - 1) as PublicationStep)}
            >
              Atrás
            </Button>
          )}
          {publicationStep === 1 && (
            <Button
              type="submit"
              form="publication-source-form"
              disabled={uploading || isArchived || !canUseFile || (!draft && !file) || (!!file && !sourceKind)}
            >
              {uploading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {uploading
                ? "Guardando fuente…"
                : file
                  ? "Guardar borrador y continuar"
                  : draft
                    ? "Continuar con la fuente actual"
                    : "Continuar"}
            </Button>
          )}
          {publicationStep === 2 && (
            <Button
              type="submit"
              form="publication-config-form"
              disabled={!draft || isArchived || !canPreview || reviewing || !versionPattern.test(version)}
            >
              {reviewing && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {reviewing ? "Revisando…" : "Revisar publicación"}
            </Button>
          )}
          {publicationStep === 3 && preview && (
            <Button type="button" onClick={() => onStepChange(4)} disabled={!preview.canPublish || !canPublish}>
              <CheckCircle2 className="size-4" aria-hidden="true" /> Ir a confirmar
            </Button>
          )}
          {publicationStep === 4 && (
            <Button type="button" onClick={() => void onPublish()} disabled={publishing || !preview?.canPublish || !canPublish}>
              {publishing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Rocket className="size-4" aria-hidden="true" />}
              {publishing ? "Publicando…" : "Publicar versión"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Stepper({ step }: { step: PublicationStep }) {
  return (
    <ol className="grid grid-cols-4 gap-2 pt-4" aria-label="Progreso de publicación">
      {publicationSteps.map((item) => {
        const done = step > item.number;
        const current = step === item.number;
        return (
          <li key={item.number} className="min-w-0">
            <div className={cn("h-1 rounded-full", done || current ? "bg-primary" : "bg-border")} />
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-2xs font-semibold",
                  done
                    ? "bg-primary text-primary-foreground"
                    : current
                      ? "border border-primary text-primary"
                      : "border border-border text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="size-3" /> : item.number}
              </span>
              <span className={cn("truncate text-xs", current ? "font-semibold text-foreground" : "text-muted-foreground")} title={item.label}>
                {item.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepIntro({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-heading">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, help, error, required, children }: { label: string; help?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-error" aria-hidden="true">*</span>}
      </span>
      {children}
      {help && <span className="mt-1.5 block text-xs text-muted-foreground">{help}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-error">{error}</span>}
    </label>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium text-foreground", mono ? "break-all font-mono text-xs" : "break-words")} title={value}>{value}</dd>
    </div>
  );
}

function acceptanceLabel(policy: DocumentTypeOption | null, mode: "individual" | "organization_representative" | "informational") {
  if (policy?.acceptance === "optional" || mode === "informational") return "Informativa";
  return mode === "organization_representative" ? "Representante de organización" : "Individual";
}

function sourceKindLabelText(kind: SourceKind | null) {
  if (!kind) return "—";
  return { pdf: "PDF", html: "HTML", markdown: "Markdown" }[kind];
}

function formatSourceKinds(kinds: SourceKind[]) {
  return kinds.map((kind) => sourceKindLabelText(kind)).join(", ");
}

function acceptAttribute(kinds: SourceKind[]) {
  return kinds.map((kind) => ({ pdf: ".pdf,application/pdf", html: ".html,.htm,text/html", markdown: ".md,.markdown,text/markdown" }[kind])).join(",");
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

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
