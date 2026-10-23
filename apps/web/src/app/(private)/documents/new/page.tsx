"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, LoaderCircle } from "lucide-react";
import { useLegalSession } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/zuno/alert";
import { Button } from "@/components/zuno/button";
import { Card, CardContent, CardFooter } from "@/components/zuno/card";
import { Input } from "@/components/zuno/input";
import { FileDropzone } from "@/components/ui/file-dropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/zuno/skeleton";
import { legalApi, LegalApiError } from "@/lib/legal-api";
import { listApplications, type Application } from "@/services/application.service";
import {
  type DocumentTypeOption,
  type LegalDocument,
  type LegalDocumentVariant,
  type SourceKind,
  listDocuments,
  listDocumentTypes,
  sourceKindFor,
  uploadDocumentSource,
} from "@/services/document.service";
import { listIssuerOptions, type IssuerOption } from "@/services/issuer.service";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function NewDocumentPage() {
  const router = useRouter();
  const session = useLegalSession();
  const [issuers, setIssuers] = useState<IssuerOption[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [parentDocuments, setParentDocuments] = useState<LegalDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [issuerId, setIssuerId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [documentType, setDocumentType] = useState("terms_and_conditions");
  const [documentVariant, setDocumentVariant] = useState<LegalDocumentVariant>("standard");
  const [parentDocumentId, setParentDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [fileError, setFileError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdDocumentId, setCreatedDocumentId] = useState("");
  const canCreate = hasPermission(session.permissions, "legal.documents.create");
  const canUpload = hasPermission(session.permissions, "legal.versions.create");
  const generatedKey = documentKeyFromTitle(title);
  const selectedPolicy = documentTypes.find(({ code }) => code === documentType);
  const acceptedKinds = selectedPolicy?.allowedSourceKinds ?? [];

  useEffect(() => {
    if (!canCreate) return;

    void Promise.all([listIssuerOptions(), listDocumentTypes(), listDocuments()])
      .then(([issuerRows, typeRows, documentRows]) => {
        setIssuers(issuerRows.filter(({ status }) => status === "active"));
        setDocumentTypes(typeRows);
        setParentDocuments(documentRows);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el formulario."))
      .finally(() => setLoading(false));
  }, [canCreate]);

  async function selectIssuer(value: string) {
    setIssuerId(value);
    setApplicationId("");
    setApplications([]);
    setError("");
    if (!value) return;

    setLoadingApplications(true);
    try {
      const response = await listApplications({ issuerId: value, status: "active" });
      setApplications(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las aplicaciones.");
    } finally {
      setLoadingApplications(false);
    }
  }

  function selectFile(selected: File | undefined) {
    setFileError("");
    setFile(selected ?? null);
    setSourceKind(null);
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setFileError("El archivo supera el límite de 10 MiB.");
      return;
    }
    const kind = sourceKindFor(selected);
    if (!kind || !acceptedKinds.includes(kind)) {
      setFile(null);
      setFileError(`Formato no permitido. Este tipo acepta: ${acceptedKinds.join(", ") || "ninguno"}.`);
      return;
    }
    setSourceKind(kind);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issuerId || !applicationId || !title.trim() || (file && !sourceKind) || (file && sourceKind && !acceptedKinds.includes(sourceKind))) return;

    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const created = await legalApi<LegalDocument>("/v1/legal/documents", {
        method: "POST",
        body: JSON.stringify({
          issuerId,
          applicationId,
          key: generatedKey,
          locale: String(data.get("locale")).trim(),
          title: title.trim(),
          documentType,
          documentVariant,
          ...(parentDocumentId ? { parentDocumentId } : {}),
        }),
      });
      setCreatedDocumentId(created.id);
      if (file && sourceKind && canUpload) {
        await uploadDocumentSource(created.id, file, sourceKind, "POST");
      }
      router.push(`/documents/${created.id}`);
    } catch (cause) {
      const message = cause instanceof LegalApiError && cause.traceId
        ? `${cause.message} Referencia: ${cause.traceId}`
        : cause instanceof Error
          ? cause.message
          : "No se pudo crear el documento.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) {
    return <MessagePage title="Sin permiso para crear documentos" description="Tu rol no incluye el permiso legal.documents.create." />;
  }

  if (loading) return <DocumentFormSkeleton />;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <Button render={<Link href="/documents" />} nativeButton={false} variant="ghost" className="mb-3 -ml-3">
          <ArrowLeft className="size-4" aria-hidden="true" /> Documentos
        </Button>
        <PageHeading title="Nuevo documento" description="Define los datos básicos del documento legal." />
      </div>

      {error && (
        <Alert variant="destructive" className="font-medium">
          {error}
          {createdDocumentId && (
            <Button render={<Link href={`/documents/${createdDocumentId}`} />} nativeButton={false} variant="outline" className="mt-3">
              <FileText className="size-4" aria-hidden="true" />
              Continuar al documento
            </Button>
          )}
        </Alert>
      )}

      <form className="min-w-0" onSubmit={(event) => void submit(event)}>
        <Card className="min-w-0 gap-0 rounded-md py-0">
          <CardContent className="min-w-0 space-y-6 p-5 md:p-6">
            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <Field label="Issuer" htmlFor="document-issuer" description="Entidad responsable del documento." required>
                <Select value={issuerId || null} onValueChange={(value) => void selectIssuer(value ?? "")}>
                  <SelectTrigger id="document-issuer" className="w-full">
                    <SelectValue>{issuers.find((issuer) => issuer.id === issuerId)?.name ?? "Selecciona un issuer"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {issuers.map((issuer) => (
                      <SelectItem key={issuer.id} value={issuer.id}>{issuer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Aplicación" htmlFor="document-application" description="Producto donde se utilizará." required>
                <Select
                  value={applicationId || null}
                  onValueChange={(value) => setApplicationId(value ?? "")}
                  disabled={!issuerId || loadingApplications}
                >
                  <SelectTrigger id="document-application" className="w-full">
                    <SelectValue>{applications.find((application) => application.id === applicationId)?.name ?? (loadingApplications ? "Cargando aplicaciones…" : "Selecciona una aplicación")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {applications.map((application) => (
                      <SelectItem key={application.id} value={application.id}>{application.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <Field label="Tipo de documento" htmlFor="document-type" description="Clasifica el documento para su administración." required>
                <Select
                  value={documentType || null}
                  onValueChange={(value) => {
                    const nextType = value ?? "";
                    const nextPolicy = documentTypes.find(({ code }) => code === nextType);
                    setDocumentType(nextType);
                    setDocumentVariant(nextPolicy?.variants[0] ?? "standard");
                    setParentDocumentId("");
                    setFile(null);
                    setSourceKind(null);
                    setFileError("");
                  }}
                >
                  <SelectTrigger id="document-type" className="w-full">
                    <SelectValue>{selectedPolicy?.name ?? "Selecciona un tipo"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {documentTypes.map(({ code, name }) => (
                      <SelectItem key={code} value={code}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {selectedPolicy?.variants.length && selectedPolicy.variants[0] !== "standard" ? (
                <Field label="Modalidad" htmlFor="document-variant" description="Cada modalidad de privacidad tiene sus propias versiones." required>
                  <Select value={documentVariant} onValueChange={(value) => setDocumentVariant(value as LegalDocumentVariant)}>
                    <SelectTrigger id="document-variant" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      {selectedPolicy.variants.map((variant) => (
                        <SelectItem key={variant} value={variant}>{variantLabel(variant)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              {documentType === "privacy_notice" && documentVariant !== "integral" ? (
                <Field label="Aviso integral" htmlFor="parent-document" description="La modalidad debe apuntar al aviso integral del mismo issuer, aplicación e idioma." required>
                  <Select value={parentDocumentId || null} onValueChange={(value) => setParentDocumentId(value ?? "")}>
                    <SelectTrigger id="parent-document" className="w-full"><SelectValue placeholder="Selecciona el aviso integral" /></SelectTrigger>
                    <SelectContent align="start">
                      {parentDocuments
                        .filter((item) => item.documentType === "privacy_notice" && item.documentVariant === "integral" && item.issuerId === issuerId && item.applicationId === applicationId)
                        .map((item) => <SelectItem key={item.id} value={item.id}>{item.title} · {item.locale}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <Field label="Idioma" htmlFor="document-locale" description="Locale del contenido." required>
                <Input id="document-locale" name="locale" required minLength={2} maxLength={12} defaultValue="es-MX" />
              </Field>

            </div>

            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <Field label="Título" htmlFor="document-title" description="Nombre que verán los operadores y usuarios." required>
                <Input
                  id="document-title"
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="Términos y condiciones"
                />
              </Field>

              <Field label="Clave generada" htmlFor="document-key" description="Se genera automáticamente a partir del título." required>
                <Input id="document-key" value={generatedKey} readOnly className="bg-muted font-mono" aria-readonly="true" />
              </Field>
            </div>

            {canUpload && (
              <div className="min-w-0 border-t border-border pt-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold">Archivo fuente <span className="font-normal text-muted-foreground">(opcional)</span></h2>
                  <p className="mt-1 text-sm text-muted-foreground">Adjunta la fuente permitida para este tipo de documento.</p>
                </div>
                <FileDropzone
                  id="document-file"
                  file={file}
                  accept={acceptAttribute(acceptedKinds)}
                  helperText={`${acceptedKinds.join(", ") || "Sin formatos"} · máximo 10 MiB`}
                  error={fileError}
                  disabled={saving}
                  onFileChange={selectFile}
                />
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-3 border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
            <Button render={<Link href="/documents" />} nativeButton={false} variant="outline" className="px-4" disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" className="px-4" disabled={saving || loadingApplications || !issuerId || !applicationId}>
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {saving ? "Creando…" : "Crear documento"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  description,
  required = false,
  children,
}: {
  htmlFor: string;
  label: string;
  description: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label} {required && <span aria-hidden="true">*</span>}
        {required && <span className="sr-only">(obligatorio)</span>}
      </label>
      {children}
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function MessagePage({ title, description }: { title: string; description: string }) {
  return (
    <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button render={<Link href="/documents" />} nativeButton={false} variant="outline" className="mt-6 px-4">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a documentos
        </Button>
      </div>
    </section>
  );
}

function DocumentFormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando formulario…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-5 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-2 md:p-6">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
      </div>
    </div>
  );
}

function documentKeyFromTitle(title: string) {
  const key = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
    .replace(/_+$/g, "");

  return key || "documento";
}

function hasPermission(granted: string[], required: string) {
  return granted.some(
    (permission) =>
      permission === "*.*" ||
      permission === required ||
      (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))),
  );
}

function variantLabel(value: LegalDocumentVariant) {
  return { standard: "Estándar", integral: "Integral", simplified: "Simplificado", short: "Corto" }[value];
}

function acceptAttribute(kinds: SourceKind[]) {
  return kinds.map((kind) => ({ pdf: ".pdf,application/pdf", html: ".html,.htm,text/html", markdown: ".md,.markdown,text/markdown" }[kind])).join(",");
}
