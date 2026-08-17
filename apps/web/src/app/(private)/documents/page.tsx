"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  CircleCheck,
  File as FileIcon,
  FileText,
  FunnelPlus,
  Folder,
  Grid2X2,
  Languages,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useLegalSession } from "@/components/app-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { legalApi } from "@/lib/legal-api";
import {
  DocumentTypeOption,
  LegalDocument,
  listDocumentTypes,
  listDocuments,
} from "@/services/document.service";
import { listApplications, type Application } from "@/services/application.service";
import { listIssuerOptions, type IssuerOption } from "@/services/issuer.service";

export default function DocumentsPage() {
  const router = useRouter();
  const session = useLegalSession();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [issuerOptions, setIssuerOptions] = useState<IssuerOption[]>([]);
  const [applicationOptions, setApplicationOptions] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIssuerId, setSelectedIssuerId] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<LegalDocument | null>(null);
  const [query, setQuery] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [typeSearch, setTypeSearch] = useState("");
  const [documentType, setDocumentType] = useState("all");
  const [locale, setLocale] = useState("all");
  const [status, setStatus] = useState("all");
  const loadedOrganization = useRef<string | null>(null);
  const organizationKey = session.activeOrganizationId ?? "none";
  const permissions = session.permissions;
  const canView = hasPermission(permissions, "legal.documents.view");
  const canCreate = hasPermission(permissions, "legal.documents.create");
  const canArchive = hasPermission(permissions, "legal.documents.archive");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!canView) return;

      const [documentRows, documentTypeRows] = await Promise.all([
        listDocuments(),
        listDocumentTypes(),
      ]);
      setDocuments(documentRows);
      setDocumentTypes(documentTypeRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los documentos.");
    } finally {
      setLoading(false);
    }
  }, [canView]);

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
        (documentType === "all" || document.documentType === documentType) &&
        (locale === "all" || document.locale === locale) &&
        (status === "all" || document.status === status),
    );
  }, [documentType, documents, locale, query, status]);

  const locales = Array.from(new Set(documents.map((document) => document.locale))).sort();
  const typeNames = new Map(documentTypes.map((type) => [type.code, type.name]));
  typeNames.set("terms", "Términos y condiciones");
  const normalizedFilterSearch = filterSearch.trim().toLocaleLowerCase("es-MX");
  const normalizedTypeSearch = typeSearch.trim().toLocaleLowerCase("es-MX");
  const visibleTypes = documentTypes.filter(({ code, name }) =>
    `${code} ${name}`.toLocaleLowerCase("es-MX").includes(normalizedTypeSearch),
  );
  const activeFilterCount =
    Number(documentType !== "all") +
    Number(locale !== "all") +
    Number(status !== "all");
  const hasDocumentCriteria = Boolean(query.trim()) || activeFilterCount > 0;

  function clearFilters() {
    setQuery("");
    setFilterSearch("");
    setTypeSearch("");
    setDocumentType("all");
    setLocale("all");
    setStatus("all");
  }

  async function openCreate() {
    setShowCreate(true);
    setCreateError("");
    if (issuerOptions.length) return;

    setCreateLoading(true);
    try {
      const options = await listIssuerOptions();
      setIssuerOptions(options.filter(({ status }) => status === "active"));
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "No se pudieron cargar los emisores.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function selectIssuer(issuerId: string) {
    setSelectedIssuerId(issuerId);
    setSelectedApplicationId("");
    setApplicationOptions([]);
    setCreateError("");
    if (!issuerId) return;

    setCreateLoading(true);
    try {
      const response = await listApplications({ issuerId, status: "active" });
      setApplicationOptions(response.items);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "No se pudieron cargar las aplicaciones.");
    } finally {
      setCreateLoading(false);
    }
  }

  function closeCreate() {
    setShowCreate(false);
    setCreateError("");
    setSelectedIssuerId("");
    setSelectedApplicationId("");
    setApplicationOptions([]);
  }

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!selectedIssuerId || !selectedApplicationId) return;

    setCreateSaving(true);
    setError("");
    try {
      const created = await legalApi<LegalDocument>("/v1/legal/documents", {
        method: "POST",
        body: JSON.stringify({
          issuerId: selectedIssuerId,
          applicationId: selectedApplicationId,
          key: String(data.get("key")),
          locale: String(data.get("locale")),
          title: String(data.get("title")),
          documentType: String(data.get("documentType")),
        }),
      });
      setDocuments((current) => [created, ...current]);
      form.reset();
      closeCreate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el documento.");
    } finally {
      setCreateSaving(false);
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
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-heading">Documentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra documentos legales por idioma y tipo.
          </p>
        </div>
        {canCreate && (
          <Button
            className="px-4"
            onClick={() => (showCreate ? closeCreate() : void openCreate())}
            disabled={createLoading}
          >
            {showCreate ? <X className="size-4" /> : <Plus className="size-4" aria-hidden="true" />}
            {showCreate ? "Cancelar" : "Nuevo documento"}
          </Button>
        )}
      </header>

      {error && (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-error bg-error-subtle px-4 py-3 text-sm font-medium text-error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="icon" aria-label="Reintentar" title="Reintentar" onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={createDocument}
          className="rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-5">
            <h2 className="text-base font-semibold">Nuevo documento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecciona el issuer y la aplicación durante la creación.
            </p>
          </div>
          {createError && (
            <p className="mb-4 rounded-lg border border-error bg-error-subtle px-4 py-3 text-sm text-error" role="alert">
              {createError}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Issuer">
              <Select value={selectedIssuerId} onValueChange={(value) => void selectIssuer(value ?? "")} required>
                <SelectTrigger>
                  <SelectValue placeholder={createLoading ? "Cargando issuers…" : "Selecciona un issuer"} />
                </SelectTrigger>
                <SelectContent>
                  {issuerOptions.map((issuer) => (
                    <SelectItem key={issuer.id} value={issuer.id}>
                      {issuer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Aplicación">
              <Select
                value={selectedApplicationId}
                onValueChange={(value) => setSelectedApplicationId(value ?? "")}
                disabled={!selectedIssuerId || createLoading}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una aplicación" />
                </SelectTrigger>
                <SelectContent>
                  {applicationOptions.map((application) => (
                    <SelectItem key={application.id} value={application.id}>
                      {application.name}
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
                  {documentTypes.map(({ code, name }) => (
                    <SelectItem key={code} value={code}>
                      {name}
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
            <Button disabled={createSaving || createLoading || !selectedApplicationId}>
              {createSaving && <LoaderCircle className="size-4 animate-spin" />}
              {createSaving ? "Creando…" : "Crear documento"}
            </Button>
          </div>
        </form>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:justify-end">
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
            <DropdownMenuContent align="end" className="w-80 p-2">
              <div className="px-2 py-2 text-sm font-semibold">
                Filtros
              </div>
              <div className="relative px-1 pb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filterSearch}
                  onChange={(event) => setFilterSearch(event.target.value)}
                  placeholder="Buscar filtros…"
                  aria-label="Buscar filtros"
                  className="h-10 pl-9"
                />
              </div>
              <div className="px-2 py-2 text-xs font-medium text-muted-foreground">
                Atributos del documento
              </div>
              {"tipo".includes(normalizedFilterSearch) && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="min-h-12 px-2">
                    <FileText className="size-4" />
                    Tipo
                    {documentType !== "all" && <Badge className="ml-auto mr-1" variant="secondary">1</Badge>}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-80 p-2">
                    <div className="px-2 py-2 text-sm font-semibold">
                      Tipo de documento
                    </div>
                    <div className="relative px-1 pb-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={typeSearch}
                        onChange={(event) => setTypeSearch(event.target.value)}
                        placeholder="Buscar tipo…"
                        aria-label="Buscar tipo de documento"
                        className="h-10 pl-9"
                      />
                    </div>
                    <DropdownMenuRadioGroup value={documentType} onValueChange={setDocumentType}>
                      <DropdownMenuRadioItem value="all" closeOnClick={false}>
                        Todos los tipos
                      </DropdownMenuRadioItem>
                      {visibleTypes.map(({ code, name }) => (
                        <DropdownMenuRadioItem key={code} value={code} closeOnClick={false}>
                          {name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {"idioma".includes(normalizedFilterSearch) && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="min-h-12 px-2">
                    <Languages className="size-4" />
                    Idioma
                    {locale !== "all" && <Badge className="ml-auto mr-1" variant="secondary">1</Badge>}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64 p-2">
                    <div className="px-2 py-2 text-sm font-semibold">
                      Idioma
                    </div>
                    <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
                      <DropdownMenuRadioItem value="all" closeOnClick={false}>
                        Todos los idiomas
                      </DropdownMenuRadioItem>
                      {locales.map((item) => (
                        <DropdownMenuRadioItem key={item} value={item} closeOnClick={false}>
                          {item}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {"estado".includes(normalizedFilterSearch) && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="min-h-12 px-2">
                    <CircleCheck className="size-4" />
                    Estado
                    {status !== "all" && <Badge className="ml-auto mr-1" variant="secondary">1</Badge>}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64 p-2">
                    <div className="px-2 py-2 text-sm font-semibold">
                      Estado
                    </div>
                    <DropdownMenuRadioGroup value={status} onValueChange={setStatus}>
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
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!hasDocumentCriteria}
                onClick={clearFilters}
              >
                <RotateCcw className="size-4" />
                Limpiar filtros
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {filteredDocuments.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredDocuments.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                typeName={typeNames.get(document.documentType) ?? document.documentType}
                canArchive={canArchive}
                archiving={archivingId === document.id}
                onOpen={() => router.push(`/documents/${document.id}`)}
                onArchive={() => setArchiveTarget(document)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            className="rounded-lg border border-border bg-card shadow-sm"
            visual={<DocumentEmptyVisual />}
            title={hasDocumentCriteria ? "No se encontraron documentos" : "No hay documentos"}
            description={
              hasDocumentCriteria
                ? query.trim()
                  ? `Tu búsqueda “${query.trim()}” no coincide con ningún documento.`
                  : "Los filtros actuales no coinciden con ningún documento."
                : "Los documentos legales creados para esta organización aparecerán aquí."
            }
            action={
              canCreate ? (
                <Button onClick={() => void openCreate()} disabled={createLoading}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo documento
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="px-1 text-xs text-muted-foreground">
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

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function DocumentCard({
  document,
  typeName,
  canArchive,
  archiving,
  onOpen,
  onArchive,
}: {
  document: LegalDocument;
  typeName: string;
  canArchive: boolean;
  archiving: boolean;
  onOpen: () => void;
  onArchive: () => void;
}) {
  return (
    <Card className="gap-0 transition-shadow hover:shadow-md">
      <button
        type="button"
        className="block w-full p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        onClick={onOpen}
        aria-label={`Abrir ${document.title}`}
      >
        <DocumentPreview />
      </button>
      <CardContent className="px-4 pb-4 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-bold">{document.title}</CardTitle>
            <CardDescription className="mt-1 truncate font-mono text-xs">
              {document.key}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Abrir ${document.title}`}
            title="Abrir"
            onClick={onOpen}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{typeName}</Badge>
          <span className="text-xs text-muted-foreground">{document.locale}</span>
          <Badge variant={document.status === "active" ? "success" : "neutral"}>
            {document.status === "active" ? "Activo" : "Archivado"}
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
        <span>Actualizado {formatDate(document.updatedAt)}</span>
        {canArchive && document.status === "active" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Archivar ${document.title}`}
            title="Archivar"
            disabled={archiving}
            onClick={onArchive}
          >
            {archiving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Archive className="size-4" />
            )}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function DocumentPreview() {
  return (
    <div className="relative h-40 overflow-hidden rounded-md border border-border bg-surface-soft p-4">
      <div className="mx-auto h-full max-w-[13rem] rounded-md border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-primary">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <span className="h-2 w-20 rounded-full bg-primary/20" />
        </div>
        <div className="mt-5 space-y-2">
          <span className="block h-2 w-full rounded-full bg-muted-foreground/15" />
          <span className="block h-2 w-11/12 rounded-full bg-muted-foreground/15" />
          <span className="block h-2 w-4/5 rounded-full bg-muted-foreground/15" />
          <span className="block h-2 w-2/3 rounded-full bg-muted-foreground/15" />
        </div>
      </div>
    </div>
  );
}

function DocumentEmptyVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-40 w-64 text-muted-foreground">
      <span className="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70" />
      <span className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/40" />
      <span className="absolute left-7 top-5 grid size-7 place-items-center rounded-md border border-border bg-card shadow-sm">
        <Grid2X2 className="size-4" />
      </span>
      <span className="absolute right-8 top-7 grid size-7 place-items-center rounded-md border border-border bg-card shadow-sm">
        <Folder className="size-4" />
      </span>
      <span className="absolute bottom-5 left-12 grid size-6 place-items-center rounded-md border border-border bg-card shadow-sm">
        <FileIcon className="size-3.5" />
      </span>
      <span className="absolute bottom-7 right-12 grid size-6 place-items-center rounded-md border border-border bg-card shadow-sm">
        <Grid2X2 className="size-3.5" />
      </span>
      <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md bg-foreground text-background shadow-sm">
        <FileText className="size-6" />
      </span>
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
      </div>
      <div className="overflow-hidden rounded-2xl border border-surface-line bg-card p-4 shadow-sm">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-border bg-card p-3">
            <Skeleton className="h-40 w-full" />
            <div className="space-y-3 px-1 pb-1 pt-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        ))}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}
