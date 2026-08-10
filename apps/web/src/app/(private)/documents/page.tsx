"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  FileText,
  FunnelPlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLegalSession } from "@/components/app-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { legalApi } from "@/lib/legal-api";

type Issuer = {
  id: string;
  name: string;
  status: string;
};

type IssuerListResponse = {
  items: Issuer[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

type Application = {
  id: string;
  issuerId: string;
  name: string;
  status: string;
};

type ApplicationListResponse = {
  items: Application[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

type LegalDocument = {
  id: string;
  issuerId: string;
  applicationId: string;
  key: string;
  documentType: string;
  locale: string;
  title: string;
  status: string;
  updatedAt: string;
};

const documentTypes = [
  ["terms_and_conditions", "Términos y condiciones"],
  ["privacy_notice", "Aviso de privacidad"],
  ["acceptable_use_policy", "Política de uso aceptable"],
  ["ai_usage_policy", "Política de uso de IA"],
  ["cookie_policy", "Política de cookies"],
  ["security_policy", "Política de seguridad"],
  ["data_processing_agreement", "Acuerdo de tratamiento de datos"],
  ["saas_agreement", "Contrato SaaS"],
  ["nda", "Acuerdo de confidencialidad"],
  ["custom_policy", "Política personalizada"],
] as const;

const typeNames = new Map<string, string>(documentTypes);
typeNames.set("terms", "Términos y condiciones");

export default function DocumentsPage() {
  const session = useLegalSession();
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<LegalDocument | null>(null);
  const [query, setQuery] = useState("");
  const [applicationId, setApplicationId] = useState("all");
  const [status, setStatus] = useState("all");
  const loadedOrganization = useRef<string | null>(null);
  const organizationKey = session.activeOrganizationId ?? "none";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!hasPermission(session.permissions, "legal.documents.view")) return;

      const [issuerResponse, applicationResponse, documentRows] = await Promise.all([
        hasPermission(session.permissions, "legal.issuers.view")
          ? legalApi<IssuerListResponse>("/v1/legal/issuers?limit=100")
          : Promise.resolve({
              items: [],
              meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
            } as IssuerListResponse),
        hasPermission(session.permissions, "legal.applications.view")
          ? legalApi<ApplicationListResponse>("/v1/legal/applications?limit=100&status=active")
          : Promise.resolve({
              items: [],
              meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
            } as ApplicationListResponse),
        legalApi<LegalDocument[]>("/v1/legal/documents"),
      ]);
      setIssuers(issuerResponse.items);
      setApplications(applicationResponse.items);
      setDocuments(documentRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los documentos.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (loadedOrganization.current === organizationKey) return;
    loadedOrganization.current = organizationKey;
    void Promise.resolve().then(load);
  }, [load, organizationKey]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
    return documents.filter(
      (document) =>
        (!normalizedQuery ||
          document.title.toLocaleLowerCase("es-MX").includes(normalizedQuery) ||
          document.key.toLocaleLowerCase("es-MX").includes(normalizedQuery)) &&
        (applicationId === "all" || document.applicationId === applicationId) &&
        (status === "all" || document.status === status),
    );
  }, [applicationId, documents, query, status]);

  const permissions = session.permissions;
  const canView = hasPermission(permissions, "legal.documents.view");
  const canCreate = hasPermission(permissions, "legal.documents.create");
  const canArchive = hasPermission(permissions, "legal.documents.archive");
  const activeApplications = applications.filter(({ status }) => status === "active");
  const activeFilterCount = Number(applicationId !== "all") + Number(status !== "all");

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const application = applications.find(({ id }) => id === data.get("applicationId"));
    if (!application) return;

    setSaving(true);
    setError("");
    try {
      const created = await legalApi<LegalDocument>("/v1/legal/documents", {
        method: "POST",
        body: JSON.stringify({
          issuerId: application.issuerId,
          applicationId: application.id,
          key: String(data.get("key")),
          locale: String(data.get("locale")),
          title: String(data.get("title")),
          documentType: String(data.get("documentType")),
        }),
      });
      setDocuments((current) => [created, ...current]);
      setShowCreate(false);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el documento.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveDocument() {
    if (!archiveTarget) return;
    const document = archiveTarget;
    setArchivingId(document.id);
    setError("");
    try {
      await legalApi(`/v1/legal/documents/${document.id}`, { method: "DELETE" });
      setDocuments((current) =>
        current.map((item) => (item.id === document.id ? { ...item, status: "archived" } : item)),
      );
      setArchiveTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo archivar el documento.");
    } finally {
      setArchivingId("");
    }
  }

  if (loading) {
    return <DocumentsSkeleton />;
  }

  if (!canView) {
    return (
      <EmptyState
        title="Sin acceso a documentos"
        description="Tu rol no incluye el permiso legal.documents.view."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-none">Documentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra documentos legales por aplicación, idioma y tipo.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate((current) => !current)} disabled={!activeApplications.length}>
            {showCreate ? <X className="size-4" /> : <Plus className="size-4" />}
            {showCreate ? "Cancelar" : "Nuevo documento"}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-error bg-error-subtle px-4 py-3 text-sm font-medium text-error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="icon" aria-label="Reintentar" title="Reintentar" onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      )}

      {canCreate && !activeApplications.length && (
        <p className="rounded-lg border border-warning bg-warning-subtle px-4 py-3 text-sm text-warning">
          Necesitas una aplicación activa antes de crear documentos.
        </p>
      )}

      {showCreate && (
        <form onSubmit={createDocument} className="rounded-2xl border border-surface-line bg-card p-7 shadow-sm">
          <div className="mb-5">
            <h2 className="text-base font-semibold">Nuevo documento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              La aplicación determina automáticamente el issuer del documento.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Aplicación">
              <Select name="applicationId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una aplicación" />
                </SelectTrigger>
                <SelectContent>
                  {activeApplications.map((application) => (
                    <SelectItem key={application.id} value={application.id}>
                      {application.name} · {nameFor(issuers, application.issuerId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de documento">
              <Select name="documentType" required defaultValue="terms_and_conditions">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Idioma">
              <Input name="locale" required minLength={2} maxLength={12} defaultValue="es-MX" />
            </Field>
            <Field label="Clave">
              <Input name="key" required minLength={2} maxLength={80} placeholder="terms_of_service" />
            </Field>
            <Field label="Título" className="md:col-span-2">
              <Input name="title" required minLength={2} maxLength={200} placeholder="Términos y condiciones" />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button disabled={saving}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {saving ? "Creando…" : "Crear documento"}
            </Button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-surface-line bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:justify-end">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título o clave…"
              aria-label="Buscar documentos"
              className="pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <FunnelPlus className="size-4" />
              Filtros
              {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuRadioGroup
                value={applicationId}
                onValueChange={(value) => setApplicationId(value)}
              >
                <DropdownMenuLabel>Aplicación</DropdownMenuLabel>
                <DropdownMenuRadioItem value="all" closeOnClick={false}>
                  Todas las aplicaciones
                </DropdownMenuRadioItem>
                {applications.map((application) => (
                  <DropdownMenuRadioItem
                    key={application.id}
                    value={application.id}
                    closeOnClick={false}
                  >
                    {application.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={(value) => setStatus(value)}
              >
                <DropdownMenuLabel>Estado</DropdownMenuLabel>
                <DropdownMenuRadioItem value="all" closeOnClick={false}>
                  Todos
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="active" closeOnClick={false}>
                  Activos
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="archived" closeOnClick={false}>
                  Archivados
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={activeFilterCount === 0}
                onClick={() => {
                  setApplicationId("all");
                  setStatus("all");
                }}
              >
                <RotateCcw className="size-4" />
                Limpiar filtros
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {filteredDocuments.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Aplicación</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Actualizado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <p className="font-medium">{document.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{document.key}</p>
                    </TableCell>
                    <TableCell>
                      <p>{nameFor(applications, document.applicationId)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{nameFor(issuers, document.issuerId)}</p>
                    </TableCell>
                    <TableCell>{typeNames.get(document.documentType) ?? document.documentType}</TableCell>
                    <TableCell>{document.locale}</TableCell>
                    <TableCell>
                      <Badge variant={document.status === "active" ? "success" : "neutral"}>
                        {document.status === "active" ? "Activo" : "Archivado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(document.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {canArchive && document.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Archivar ${document.title}`}
                          title="Archivar"
                          disabled={archivingId === document.id}
                          onClick={() => setArchiveTarget(document)}
                        >
                          {archivingId === document.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Archive className="size-4" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title={documents.length ? "Sin resultados" : "No hay documentos"}
            description={
              documents.length
                ? "Ajusta la búsqueda o los filtros para encontrar documentos."
                : "Los documentos legales creados para esta organización aparecerán aquí."
            }
          />
        )}

        <div className="border-t border-border p-2 text-xs text-muted-foreground">
          {filteredDocuments.length} de {documents.length} documentos
        </div>
      </section>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && !archivingId && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Archive className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Archivar documento</AlertDialogTitle>
            <AlertDialogDescription>
              “{archiveTarget?.title}” dejará de estar disponible para nuevas operaciones. Sus
              versiones publicadas y su historial se conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(archivingId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(archivingId)}
              onClick={() => void archiveDocument()}
            >
              {archivingId && <LoaderCircle className="size-4 animate-spin" />}
              {archivingId ? "Archivando…" : "Archivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-panel-min place-items-center p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-info-subtle text-primary">
          <FileText className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando documentos…</span>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-surface-line bg-card p-4 shadow-sm">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function hasPermission(granted: string[], required: string) {
  return granted.some(
    (permission) =>
      permission === "*.*" ||
      permission === required ||
      (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))),
  );
}

function nameFor(items: { id: string; name: string }[], id: string) {
  return items.find((item) => item.id === id)?.name ?? "Sin acceso al catálogo";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}
