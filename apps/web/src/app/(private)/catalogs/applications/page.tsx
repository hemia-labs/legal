"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  Archive,
  ArchiveRestore,
  AppWindow,
  CheckCircle2,
  CircleOff,
  Copy,
  Funnel,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ActionMenu } from "@/components/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { LegalApiError } from "@/lib/legal-api";
import { useLegalSession } from "@/components/app-shell";
import { listIssuerOptions, type IssuerOption } from "@/services/issuer.service";
import {
  archiveApplication as archiveApplicationRequest,
  deleteApplication as deleteApplicationRequest,
  listApplications,
  unarchiveApplication as unarchiveApplicationRequest,
  updateApplicationStatus as updateApplicationStatusRequest,
  type Application,
  type ApplicationFilterStatus,
  type ApplicationStatus,
  type ApplicationListResponse,
} from "@/services/application.service";

const PAGE_SIZE = 10;
type ApplicationAction = "archive" | "unarchive" | "activate" | "deactivate" | "delete";

export default function ApplicationsPage() {
  const session = useLegalSession();
  const [applications, setApplications] = useState<Application[]>([]);
  const [issuers, setIssuers] = useState<IssuerOption[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [issuerFilter, setIssuerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ApplicationFilterStatus>("all");
  const [meta, setMeta] = useState<ApplicationListResponse["meta"]>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<LegalApiError | Error | null>(null);
  const loadedRequest = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const organizationKey = session.activeOrganizationId ?? "none";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (requestedPage: number) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      if (!hasPermission(session.permissions, "legal.applications.view")) return;

      const [applicationResponse, issuerResponse] = await Promise.all([
        listApplications({
          page: requestedPage,
          limit: PAGE_SIZE,
          search,
          issuerId: issuerFilter,
          status: statusFilter,
        }),
        hasPermission(session.permissions, "legal.issuers.view")
          ? listIssuerOptions()
          : Promise.resolve(null),
      ]);
      if (version !== requestVersion.current) return;
      setApplications(applicationResponse.items);
      setMeta(applicationResponse.meta);
      setIssuers(issuerResponse ?? []);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(cause instanceof Error ? cause : new Error("No se pudieron cargar las aplicaciones."));
    } finally {
      if (version === requestVersion.current) {
        setHasLoadedOnce(true);
        setLoading(false);
      }
    }
  }, [issuerFilter, search, session, statusFilter]);

  useEffect(() => {
    const requestKey = `${organizationKey}:${page}:${search}:${issuerFilter}:${statusFilter}`;
    if (loadedRequest.current === requestKey) return;
    loadedRequest.current = requestKey;
    void load(page);
  }, [issuerFilter, load, organizationKey, page, search, statusFilter]);

  if (loading && !hasLoadedOnce) return <ApplicationsSkeleton />;

  const permissions = session.permissions;
  const forbidden = error instanceof LegalApiError && error.status === 403;
  const canView = hasPermission(permissions, "legal.applications.view");
  const canCreate = !forbidden && hasPermission(permissions, "legal.applications.create");
  const canEdit = !forbidden && hasPermission(permissions, "legal.applications.edit");
  const canArchive = !forbidden && hasPermission(permissions, "legal.applications.archive");
  const canDelete = !forbidden && hasPermission(permissions, "legal.applications.delete");
  const activeIssuers = issuers.filter((issuer) => issuer.status === "active");
  const issuerNames = new Map(issuers.map((issuer) => [issuer.id, issuer.name]));
  const hasFilters = Boolean(query.trim()) || issuerFilter !== "all" || statusFilter !== "all";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-heading">Aplicaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra los productos y sistemas que consumen documentos legales.
          </p>
        </div>
        {canCreate && (
          <Button
            render={<Link href="/catalogs/applications/new" />}
            nativeButton={false}
            className="px-4"
            disabled={!activeIssuers.length}
            title={!activeIssuers.length ? "Necesitas un emisor activo" : undefined}
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear aplicación
          </Button>
        )}
      </header>

      {error && !forbidden ? (
        <ApplicationErrorState error={error} onRetry={() => void load(page)} />
      ) : forbidden || !canView ? (
        <ApplicationEmptyState
          title="Sin acceso a aplicaciones"
          description="Tu rol no incluye el permiso legal.applications.view."
        />
      ) : (
        <>
          {canCreate && !activeIssuers.length && (
            <div
              role="alert"
              className="rounded-lg border border-warning bg-warning-subtle px-4 py-3 text-sm text-warning"
            >
              Necesitas un emisor activo antes de crear una aplicación. <Link className="font-semibold underline" href="/catalogs/issuers/new">Crear emisor</Link>
            </div>
          )}

          {meta.total > 0 || hasFilters ? (
            <ApplicationTable
              applications={applications}
              issuerNames={issuerNames}
              canEdit={canEdit}
              canArchive={canArchive}
              canDelete={canDelete}
              loading={loading}
              query={query}
              issuerFilter={issuerFilter}
              statusFilter={statusFilter}
              hasFilters={hasFilters}
              issuers={issuers}
              page={page}
              total={meta.total}
              totalPages={meta.totalPages}
              onQueryChange={setQuery}
              onIssuerChange={(value) => {
                setIssuerFilter(value);
                setPage(1);
              }}
              onStatusChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              onChanged={() => void load(page)}
              onPageChange={setPage}
              onClearFilters={() => {
                setQuery("");
                setSearch("");
                setIssuerFilter("all");
                setStatusFilter("all");
                setPage(1);
              }}
            />
          ) : (
            <ApplicationEmptyState
              title="Aún no hay aplicaciones"
              description="Crea una aplicación para definir dónde se publican y solicitan documentos legales."
              action={canCreate && activeIssuers.length > 0}
            />
          )}
        </>
      )}
    </div>
  );
}

function ApplicationTable({
  applications,
  issuerNames,
  canEdit,
  canArchive,
  canDelete,
  loading,
  query,
  issuerFilter,
  statusFilter,
  hasFilters,
  issuers,
  page,
  total,
  totalPages,
  onQueryChange,
  onIssuerChange,
  onStatusChange,
  onChanged,
  onPageChange,
  onClearFilters,
}: {
  applications: Application[];
  issuerNames: Map<string, string>;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  loading: boolean;
  query: string;
  issuerFilter: string;
  statusFilter: ApplicationFilterStatus;
  hasFilters: boolean;
  issuers: IssuerOption[];
  page: number;
  total: number;
  totalPages: number;
  onQueryChange: (value: string) => void;
  onIssuerChange: (value: string) => void;
  onStatusChange: (value: ApplicationFilterStatus) => void;
  onChanged: () => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftIssuerFilter, setDraftIssuerFilter] = useState(issuerFilter);
  const [draftStatusFilter, setDraftStatusFilter] = useState<ApplicationFilterStatus>(statusFilter);
  const activeFilterCount = Number(issuerFilter !== "all") + Number(statusFilter !== "all");
  const draftFilterCount = Number(draftIssuerFilter !== "all") + Number(draftStatusFilter !== "all");
  const hasPendingFilterChanges =
    draftIssuerFilter !== issuerFilter || draftStatusFilter !== statusFilter;
  const visibleFilterCount = hasPendingFilterChanges ? draftFilterCount : activeFilterCount;
  const [pendingAction, setPendingAction] = useState<{
    application: Application;
    type: ApplicationAction;
  } | null>(null);
  const [actingId, setActingId] = useState("");
  const [actionError, setActionError] = useState("");

  function clearFilters() {
    setDraftIssuerFilter("all");
    setDraftStatusFilter("all");
    onQueryChange("");
    onClearFilters();
    setFiltersOpen(false);
  }

  async function executeAction() {
    if (!pendingAction) return;
    const { application, type } = pendingAction;
    setActingId(application.id);
    setActionError("");
    try {
      if (type === "archive") await archiveApplicationRequest(application.id);
      if (type === "unarchive") await unarchiveApplicationRequest(application.id);
      if (type === "activate") await updateApplicationStatusRequest(application.id, "active");
      if (type === "deactivate") await updateApplicationStatusRequest(application.id, "inactive");
      if (type === "delete") await deleteApplicationRequest(application.id);
      onChanged();
      setPendingAction(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
    } finally {
      setActingId("");
    }
  }

  const columns: DataTableColumn<Application>[] = [
    {
      accessorKey: "name",
      header: "Aplicación",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: "key",
      header: "Clave técnica",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.key}</span>,
    },
    {
      accessorKey: "issuerId",
      header: "Emisor",
      cell: ({ row }) => row.original.issuer?.name ?? issuerNames.get(row.original.issuerId) ?? row.original.issuerId,
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {statusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Actualizado",
      cell: ({ row }) => formatDate(row.original.updatedAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <ActionMenu
          label={`Acciones para ${row.original.name}`}
          options={[
            canEdit && row.original.status === "active"
              ? {
                  label: "Editar",
                  href: `/catalogs/applications/${row.original.id}/edit`,
                  icon: <Pencil className="size-4" aria-hidden="true" />,
                }
              : null,
            {
              label: "Copiar clave",
              onSelect: () => void navigator.clipboard.writeText(row.original.key),
              icon: <Copy className="size-4" aria-hidden="true" />,
            },
            {
              label: "Copiar nombre",
              onSelect: () => void navigator.clipboard.writeText(row.original.name),
              icon: <Copy className="size-4" aria-hidden="true" />,
            },
            (canEdit || canArchive || canDelete) && row.original.status !== "archived"
              ? { type: "separator" as const }
              : null,
            canEdit && row.original.status === "active"
              ? {
                  label: "Desactivar",
                  onSelect: () => {
                    setActionError("");
                    setPendingAction({ application: row.original, type: "deactivate" });
                  },
                  icon: <CircleOff className="size-4" aria-hidden="true" />,
                }
              : null,
            canEdit && row.original.status === "inactive"
              ? {
                  label: "Activar",
                  onSelect: () => {
                    setActionError("");
                    setPendingAction({ application: row.original, type: "activate" });
                  },
                  icon: <CheckCircle2 className="size-4" aria-hidden="true" />,
                }
              : null,
            canArchive && row.original.status !== "archived"
              ? {
                  label: "Archivar",
                  destructive: true,
                  disabled: actingId === row.original.id,
                  onSelect: () => {
                    setActionError("");
                    setPendingAction({ application: row.original, type: "archive" });
                  },
                  icon: <Archive className="size-4" aria-hidden="true" />,
                }
              : null,
            canArchive && row.original.status === "archived"
              ? {
                  label: "Desarchivar",
                  disabled: actingId === row.original.id,
                  onSelect: () => {
                    setActionError("");
                    setPendingAction({ application: row.original, type: "unarchive" });
                  },
                  icon: <ArchiveRestore className="size-4" aria-hidden="true" />,
                }
              : null,
            canDelete ? { type: "separator" as const } : null,
            canDelete
              ? {
                  label: "Eliminar",
                  destructive: true,
                  disabled: actingId === row.original.id,
                  onSelect: () => {
                    setActionError("");
                    setPendingAction({ application: row.original, type: "delete" });
                  },
                  icon: <Trash2 className="size-4" aria-hidden="true" />,
                }
              : null,
          ]}
        />
      ),
    },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-surface-line bg-card p-1 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-surface-line p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar aplicaciones…"
            aria-label="Buscar aplicaciones"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu
            open={filtersOpen}
            onOpenChange={(open) => {
              if (open) {
                setDraftIssuerFilter(issuerFilter);
                setDraftStatusFilter(statusFilter);
              }
              setFiltersOpen(open);
            }}
          >
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border/70 bg-transparent px-4 text-muted-foreground hover:bg-muted hover:text-foreground"
                />
              }
            >
              <Funnel className="size-4" aria-hidden="true" />
              Filtros
              {visibleFilterCount > 0 && <Badge variant="secondary">{visibleFilterCount}</Badge>}
              {hasFilters && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Limpiar filtros"
                  className="ml-1 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    clearFilters();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      clearFilters();
                    }
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuRadioGroup
                value={draftStatusFilter}
                onValueChange={(value) => setDraftStatusFilter(value as ApplicationFilterStatus)}
              >
                <DropdownMenuLabel>Estado</DropdownMenuLabel>
                <DropdownMenuRadioItem value="active" closeOnClick={false}>
                  Activas
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="inactive" closeOnClick={false}>
                  Inactivas
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="archived" closeOnClick={false}>
                  Archivadas
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all" closeOnClick={false}>
                  Todas
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={draftIssuerFilter}
                onValueChange={setDraftIssuerFilter}
              >
                <DropdownMenuLabel>Emisor</DropdownMenuLabel>
                <DropdownMenuRadioItem value="all" closeOnClick={false}>
                  Todos los emisores
                </DropdownMenuRadioItem>
                {issuers.map((issuer) => (
                  <DropdownMenuRadioItem key={issuer.id} value={issuer.id} closeOnClick={false}>
                    {issuer.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!hasFilters} onClick={clearFilters}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Limpiar filtros
              </DropdownMenuItem>
              <Button
                className="mt-2 w-full disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                disabled={!hasPendingFilterChanges}
                onClick={() => {
                  onIssuerChange(draftIssuerFilter);
                  onStatusChange(draftStatusFilter);
                  setFiltersOpen(false);
                }}
              >
                Aplicar filtros
              </Button>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Más opciones de aplicaciones"
                  className="border-border/70 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                />
              }
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  setDraftStatusFilter("archived");
                  onStatusChange("archived");
                }}
                disabled={statusFilter === "archived"}
              >
                <Archive className="size-4" aria-hidden="true" />
                Archivadas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className={loading ? "relative px-2 pt-3 pb-3 opacity-60" : "relative px-2 pt-3 pb-3"} aria-busy={loading}>
        <DataTable
          columns={columns}
          data={applications}
          emptyMessage="No hay aplicaciones que coincidan con la búsqueda o filtros."
        />
      </div>
      <footer className="flex flex-col gap-3 border-t border-surface-line p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{total ? `${total} ${total === 1 ? "aplicación" : "aplicaciones"}` : "Sin resultados"}</span>
        {totalPages > 0 && (
          <Pagination className="mx-0 w-auto sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  disabled={page === 1 || loading}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    isActive={pageNumber === page}
                    disabled={loading}
                    onClick={() => onPageChange(pageNumber)}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  disabled={page === totalPages || loading}
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClearFilters}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Restablecer filtros
          </Button>
        )}
      </footer>
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && !actingId && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              {pendingAction?.type === "delete" ? (
                <Trash2 className="size-5" aria-hidden="true" />
              ) : pendingAction?.type === "unarchive" ? (
                <ArchiveRestore className="size-5" aria-hidden="true" />
              ) : (
                <Archive className="size-5" aria-hidden="true" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>{pendingAction ? actionLabel(pendingAction.type) : "Acción"} aplicación</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction && actionDescription(pendingAction.type, pendingAction.application.name)}
            </AlertDialogDescription>
            {actionError && <p className="text-sm font-medium text-destructive">{actionError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(actingId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingAction?.type === "delete" || pendingAction?.type === "archive" ? "destructive" : "default"}
              disabled={Boolean(actingId)}
              onClick={() => void executeAction()}
            >
              {actingId && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {actingId ? "Procesando…" : pendingAction ? actionLabel(pendingAction.type) : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function statusLabel(status: ApplicationStatus) {
  if (status === "active") return "Activa";
  if (status === "inactive") return "Inactiva";
  return "Archivada";
}

function statusVariant(status: ApplicationStatus) {
  if (status === "active") return "success" as const;
  if (status === "inactive") return "warning" as const;
  return "neutral" as const;
}

function actionLabel(action: ApplicationAction) {
  if (action === "archive") return "Archivar";
  if (action === "unarchive") return "Desarchivar";
  if (action === "activate") return "Activar";
  if (action === "deactivate") return "Desactivar";
  return "Eliminar";
}

function actionDescription(action: ApplicationAction, name: string) {
  if (action === "delete") {
    return `“${name}” se eliminará de forma lógica y dejará de aparecer en el listado.`;
  }
  if (action === "archive") {
    return `“${name}” quedará archivada y se conservarán sus datos e historial.`;
  }
  if (action === "unarchive") {
    return `“${name}” volverá a estar activa si su emisor está activo.`;
  }
  if (action === "deactivate") {
    return `“${name}” dejará de estar disponible para nuevos documentos.`;
  }
  return `“${name}” volverá a estar disponible para nuevos documentos.`;
}

function ApplicationEmptyState({
  title,
  description,
  action = false,
}: {
  title: string;
  description: string;
  action?: boolean;
}) {
  return (
    <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <AppWindow className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {action && (
          <Button
            render={<Link href="/catalogs/applications/new" />}
            nativeButton={false}
            className="mt-6 px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear aplicación
          </Button>
        )}
      </div>
    </section>
  );
}

function ApplicationErrorState({
  error,
  onRetry,
}: {
  error: LegalApiError | Error;
  onRetry: () => void;
}) {
  return (
    <section role="alert" className="grid min-h-panel-min place-items-center rounded-lg border border-error bg-error-subtle p-6 text-center text-error">
      <div className="max-w-md">
        <h2 className="text-lg font-semibold">No se pudieron cargar las aplicaciones</h2>
        <p className="mt-2 text-sm">{error.message}</p>
        {error instanceof LegalApiError && error.traceId && <p className="mt-1 font-mono text-xs">Referencia: {error.traceId}</p>}
        <Button variant="outline" className="mt-6 px-4" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    </section>
  );
}

function ApplicationsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando aplicaciones…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
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
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
