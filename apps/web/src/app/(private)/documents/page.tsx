"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Eye,
  FileArchive,
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
  Trash2,
} from "lucide-react";
import { groupDocumentsByApplication } from "@/lib/document-groups";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/zuno/alert";
import { Badge } from "@/components/zuno/badge";
import { StatusBadge } from "@/components/zuno/status-badge";
import { Button } from "@/components/zuno/button";
import { Input } from "@/components/zuno/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardTitle,
} from "@/components/zuno/card";
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
import { Skeleton } from "@/components/zuno/skeleton";
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
import {
  DocumentTypeOption,
  LegalDocument,
  archiveDocument as archiveDocumentRequest,
  deleteDocument as deleteDocumentRequest,
  listDocumentTypes,
  listDocuments,
} from "@/services/document.service";

export default function DocumentsPage() {
  const router = useRouter();
  const session = useLegalSession();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<LegalDocument | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LegalDocument | null>(null);
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
  const canDelete = hasPermission(permissions, "legal.documents.delete");

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
          document.key.toLocaleLowerCase("es-MX").includes(normalizedQuery) ||
          `${document.application?.name ?? ""} ${document.application?.key ?? ""} ${document.applicationId}`
            .toLocaleLowerCase("es-MX").includes(normalizedQuery)) &&
        (documentType === "all" || document.documentType === documentType) &&
        (locale === "all" || document.locale === locale) &&
        (status === "all" || document.status === status),
    );
  }, [documentType, documents, locale, query, status]);

  const documentGroups = groupDocumentsByApplication(filteredDocuments);

  const locales = Array.from(new Set(documents.map((document) => document.locale))).sort();
  const typeNames = new Map(documentTypes.map((type) => [type.code, type.name]));
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

  async function archiveDocument() {
    if (!archiveTarget) return;
    const document = archiveTarget;
    setArchivingId(document.id);
    setError("");
    try {
      await archiveDocumentRequest(document.id);
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

  async function deleteDocument() {
    if (!deleteTarget) return;
    const document = deleteTarget;
    setDeletingId(document.id);
    setError("");
    try {
      const result = await deleteDocumentRequest(document.id);
      setWarning(result.storageDeleted ? "" : "Documento eliminado. No se pudieron eliminar todos sus archivos de S3; revisa los permisos o la retención del bucket.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setDeleteTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el documento.");
    } finally {
      setDeletingId("");
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
      <PageHeading
        title="Documentos"
        description="Documentos legales organizados por aplicación, idioma y tipo."
        actions={canCreate && documents.length > 0 ? (
          <Button
            className="px-4"
            onClick={() => router.push("/documents/new")}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nuevo documento
          </Button>
        ) : undefined}
      />

      {error && (
        <Alert variant="destructive" className="flex min-h-12 items-center justify-between gap-3 font-medium">
          <span>{error}</span>
          <Button variant="ghost" size="icon" aria-label="Reintentar" title="Reintentar" onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </Button>
        </Alert>
      )}

      {warning && <Alert variant="warning">{warning}</Alert>}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:justify-end">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar documento o aplicación…"
              aria-label="Buscar por título, clave o aplicación"
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
                  <DropdownMenuSubTrigger className="min-h-10 px-2">
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
                  <DropdownMenuSubTrigger className="min-h-10 px-2">
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
                  <DropdownMenuSubTrigger className="min-h-10 px-2">
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
          <div className="space-y-8">
            {documentGroups.map((group) => (
              <section key={group.id} aria-label={`Documentos de ${group.name}`} className="space-y-4">
                <div className="flex items-start gap-3 border-b border-border pb-3">
                  <Grid2X2 className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-lg font-semibold">{group.name}</h2>
                    <p className="break-all font-mono text-xs text-muted-foreground">{group.key}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {group.documents.length} {group.documents.length === 1 ? "documento" : "documentos"}
                  </Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.documents.map((document) => (
                    <DocumentCard
                      key={document.id}
                      document={document}
                      typeName={typeNames.get(document.documentType) ?? document.documentType}
                      canArchive={canArchive}
                      canDelete={canDelete}
                      archiving={archivingId === document.id}
                      deleting={deletingId === document.id}
                      onOpen={() => router.push(`/documents/${document.id}`)}
                      onArchive={() => setArchiveTarget(document)}
                      onDelete={() => setDeleteTarget(document)}
                    />
                  ))}
                </div>
              </section>
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
                <Button onClick={() => router.push("/documents/new")}>
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deletingId && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Eliminar documento</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” se quitará de los listados y se intentará eliminar sus archivos originales y publicados. El historial de actividad se conservará. Los archivos eliminados no podrán recuperarse desde la aplicación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deletingId)}
              onClick={() => void deleteDocument()}
            >
              {deletingId && <LoaderCircle className="size-4 animate-spin" />}
              {deletingId ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DocumentCard({
  document,
  typeName,
  canArchive,
  canDelete,
  archiving,
  deleting,
  onOpen,
  onArchive,
  onDelete,
}: {
  document: LegalDocument;
  typeName: string;
  canArchive: boolean;
  canDelete: boolean;
  archiving: boolean;
  deleting: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-3" aria-hidden="true">
        <DocumentPreview />
      </div>
      <CardContent className="flex-1 px-4 pb-4 pt-1">
        <p className="mb-2 break-words text-xs font-semibold text-muted-foreground">
          {document.application?.name ?? `Aplicación ${document.applicationId}`}
        </p>
        <CardTitle className="truncate text-sm font-bold" title={document.title}>{document.title}</CardTitle>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={document.key}>{document.key}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{typeName}</Badge>
          <span className="text-xs text-muted-foreground">{document.locale}</span>
          <StatusBadge status={document.status === "active" ? "success" : "neutral"}>
            {document.status === "active" ? "Activo" : "Archivado"}
          </StatusBadge>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Actualizado {formatDate(document.updatedAt)}</p>
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 flex-1"
          aria-label={`Ver detalle de ${document.title}`}
          onClick={onOpen}
        >
          <Eye className="size-4" aria-hidden="true" />
          Ver detalle
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label={`Eliminar ${document.title}`}
              title="Eliminar"
              disabled={archiving || deleting}
              onClick={onDelete}
            >
              {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-[18px]" aria-hidden="true" />}
            </Button>
          ) : null}
          {canArchive && document.status === "active" ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Archivar ${document.title}`}
              title="Archivar"
              disabled={archiving || deleting}
              onClick={onArchive}
            >
              {archiving ? <LoaderCircle className="size-4 animate-spin" /> : <FileArchive className="size-[18px]" aria-hidden="true" />}
            </Button>
          ) : null}
        </div>
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
            <FileText className="size-4" />
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
