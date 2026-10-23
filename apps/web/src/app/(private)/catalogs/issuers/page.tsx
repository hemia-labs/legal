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
  Copy,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  CircleOff,
  LoaderCircle,
  Pencil,
  Funnel,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/zuno/alert";
import { Card, CardContent, CardFooter } from "@/components/zuno/card";
import { Badge } from "@/components/zuno/badge";
import { StatusBadge } from "@/components/zuno/status-badge";
import { Button } from "@/components/zuno/button";
import { PageHeading } from "@/components/page-heading";
import { ActionMenu } from "@/components/action-menu";
import { Input } from "@/components/zuno/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/zuno/dropdown-menu";
import { Skeleton } from "@/components/zuno/skeleton";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { LegalApiError } from "@/lib/legal-api";
import { useLegalSession } from "@/components/app-shell";
import {
  archiveIssuer as archiveIssuerRequest,
  deleteIssuer as deleteIssuerRequest,
  listIssuers,
  unarchiveIssuer as unarchiveIssuerRequest,
  updateIssuerStatus as updateIssuerStatusRequest,
  type Issuer,
  type IssuerFilterStatus,
  type IssuerListResponse,
} from "@/services/issuer.service";

const PAGE_SIZE = 10;

type IssuerStatusAction = "active" | "inactive" | "archive" | "unarchive";

const typeNames: Record<string, string> = {
  hemia: "Propio de Hemia",
  customer: "Cliente",
  partner: "Socio",
  white_label_brand: "Marca blanca",
  internal: "Interno",
};

export default function IssuersPage() {
  const session = useLegalSession();
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssuerFilterStatus>("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [meta, setMeta] = useState<IssuerListResponse["meta"]>({
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
    const normalizedSearch = search.trim();
    const timer = window.setTimeout(() => {
      setQuery(normalizedSearch);
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (requestedPage: number) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      if (!hasPermission(session.permissions, "legal.issuers.view")) return;
      const response = await listIssuers({
        page: requestedPage,
        limit: PAGE_SIZE,
        search: query,
        status: statusFilter,
        type: typeFilter,
      });
      if (version !== requestVersion.current) return;
      setIssuers(response.items);
      setMeta(response.meta);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(cause instanceof Error ? cause : new Error("No se pudieron cargar los emisores."));
    } finally {
      if (version === requestVersion.current) {
        setHasLoadedOnce(true);
        setLoading(false);
      }
    }
  }, [query, session, statusFilter, typeFilter]);

  useEffect(() => {
    const requestKey = `${organizationKey}:${page}:${query}:${statusFilter}:${typeFilter}`;
    if (loadedRequest.current === requestKey) return;
    loadedRequest.current = requestKey;
    void load(page);
  }, [load, organizationKey, page, query, statusFilter, typeFilter]);

  if (loading && !hasLoadedOnce) return <IssuersSkeleton />;

  const permissions = session.permissions;
  const forbidden = error instanceof LegalApiError && error.status === 403;
  const canView = hasPermission(permissions, "legal.issuers.view");
  const canCreate =
    !forbidden && hasPermission(permissions, "legal.issuers.create");
  const canEdit = !forbidden && hasPermission(permissions, "legal.issuers.edit");
  const canArchive = !forbidden && hasPermission(permissions, "legal.issuers.archive");
  const canDelete = !forbidden && hasPermission(permissions, "legal.issuers.delete");

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Emisores legales"
        description="Administra las entidades y marcas responsables de los documentos legales."
        actions={canCreate ? (
          <Button
            render={<Link href="/catalogs/issuers/new" />}
            nativeButton={false}
            className="px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear emisor
          </Button>
        ) : undefined}
      />

      {error && !forbidden ? (
        <IssuerErrorState error={error} onRetry={() => void load(page)} />
      ) : forbidden || !canView ? (
        <IssuerEmptyState
          title="Sin acceso a emisores legales"
          description="Tu rol no incluye el permiso legal.issuers.view."
        />
      ) : (
        <IssuerTable
          issuers={issuers}
          loading={loading}
          canEdit={canEdit}
          canArchive={canArchive}
          canDelete={canDelete}
          search={search}
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          page={page}
          total={meta.total}
          totalPages={meta.totalPages}
          onQueryChange={(value) => {
            setSearch(value);
          }}
          onApplyFilters={(status, type) => {
            setStatusFilter(status);
            setTypeFilter(type);
            setPage(1);
          }}
          onPageChange={setPage}
          onRefresh={() => void load(page)}
          onClearFilters={() => {
            setSearch("");
            setQuery("");
            setStatusFilter("active");
            setTypeFilter("all");
            setPage(1);
          }}
          onStatusChanged={(id, status) =>
            setIssuers((current) =>
              current.map((issuer) =>
                issuer.id === id ? { ...issuer, status } : issuer,
              ),
            )
          }
          onDeleted={(id) => {
            setIssuers((current) => current.filter((issuer) => issuer.id !== id));
            setMeta((current) => {
              const total = Math.max(0, current.total - 1);
              return { ...current, total, totalPages: Math.ceil(total / PAGE_SIZE) };
            });
          }}
        />
      )}
    </div>
  );
}

function IssuerTable({
  issuers,
  loading,
  canEdit,
  canArchive,
  canDelete,
  search,
  statusFilter,
  typeFilter,
  page,
  total,
  totalPages,
  onQueryChange,
  onApplyFilters,
  onPageChange,
  onRefresh,
  onClearFilters,
  onStatusChanged,
  onDeleted,
}: {
  issuers: Issuer[];
  loading: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  search: string;
  statusFilter: IssuerFilterStatus;
  typeFilter: string;
  page: number;
  total: number;
  totalPages: number;
  onQueryChange: (value: string) => void;
  onApplyFilters: (status: IssuerFilterStatus, type: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  onStatusChanged: (id: string, status: Issuer["status"]) => void;
  onDeleted: (id: string) => void;
}) {
  const [archiveTarget, setArchiveTarget] = useState<Issuer | null>(null);
  const [archivingId, setArchivingId] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Issuer | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [statusTarget, setStatusTarget] = useState<{
    issuer: Issuer;
    status: "active" | "inactive";
  } | null>(null);
  const [statusChangingId, setStatusChangingId] = useState("");
  const [statusError, setStatusError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<IssuerFilterStatus>(statusFilter);
  const [draftTypeFilter, setDraftTypeFilter] = useState(typeFilter);
  const activeFilterCount = Number(statusFilter !== "active") + Number(typeFilter !== "all");
  const draftFilterCount =
    Number(draftStatusFilter !== "active") + Number(draftTypeFilter !== "all");
  const hasPendingFilterChanges =
    draftStatusFilter !== statusFilter || draftTypeFilter !== typeFilter;
  const visibleFilterCount = hasPendingFilterChanges
    ? draftFilterCount
    : activeFilterCount;
  const hasAnyFilters = Boolean(search) || visibleFilterCount > 0;
  const hasAppliedFilters = Boolean(search.trim()) || statusFilter !== "active" || typeFilter !== "all";
  const pageCount = Math.max(1, totalPages);

  function clearFilters() {
    setDraftStatusFilter("active");
    setDraftTypeFilter("all");
    onClearFilters();
    setFiltersOpen(false);
  }

  async function archiveIssuer() {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setArchivingId(target.id);
    setArchiveError("");
    try {
      await archiveIssuerRequest(target.id);
      onStatusChanged(target.id, "archived");
      setArchiveTarget(null);
    } catch (cause) {
      setArchiveError(
        cause instanceof Error ? cause.message : "No se pudo archivar el emisor.",
      );
    } finally {
      setArchivingId("");
    }
  }

  async function deleteIssuer() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeletingId(target.id);
    setDeleteError("");
    try {
      await deleteIssuerRequest(target.id);
      onDeleted(target.id);
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "No se pudo eliminar el emisor.",
      );
    } finally {
      setDeletingId("");
    }
  }

  async function changeIssuerStatus(issuer: Issuer, action: IssuerStatusAction) {
    if (action === "archive") {
      setArchiveError("");
      setArchiveTarget(issuer);
      return;
    }

    if (action === "active" || action === "inactive") {
      setStatusError("");
      setStatusTarget({ issuer, status: action });
      return;
    }

    setStatusChangingId(issuer.id);
    setStatusError("");
    try {
      if (action === "unarchive") {
        await unarchiveIssuerRequest(issuer.id);
        onStatusChanged(issuer.id, "active");
      } else {
        await updateIssuerStatusRequest(issuer.id, action);
        onStatusChanged(issuer.id, action);
      }
    } catch (cause) {
      setStatusError(
        cause instanceof Error ? cause.message : "No se pudo actualizar el estado del emisor.",
      );
    } finally {
      setStatusChangingId("");
    }
  }

  async function confirmStatusChange() {
    if (!statusTarget) return;
    const target = statusTarget;
    setStatusChangingId(target.issuer.id);
    setStatusError("");
    try {
      await updateIssuerStatusRequest(target.issuer.id, target.status);
      onStatusChanged(target.issuer.id, target.status);
      setStatusTarget(null);
    } catch (cause) {
      setStatusError(
        cause instanceof Error ? cause.message : "No se pudo actualizar el estado del emisor.",
      );
    } finally {
      setStatusChangingId("");
    }
  }

  const columns: DataTableColumn<Issuer>[] = [
    {
      accessorKey: "name",
      header: "Emisor",
      cell: ({ row }) => (
        <>
          <p className="max-w-56 truncate font-semibold text-foreground" title={row.original.name}>{row.original.name}</p>
          <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground">
            {row.original.legalName}
          </p>
        </>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => typeNames[row.original.type] ?? row.original.type,
    },
    {
      accessorKey: "key",
      header: "Clave",
      cell: ({ row }) => <span className="block max-w-44 truncate font-mono text-xs" title={row.original.key}>{row.original.key}</span>,
    },
    {
      accessorKey: "countryCode",
      header: "Región",
      cell: ({ row }) => `${row.original.countryCode} · ${row.original.defaultLocale}`,
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge
          status={
            row.original.status === "active"
              ? "success"
              : row.original.status === "inactive"
                ? "warning"
                : "neutral"
          }
        >
          {row.original.status === "active"
            ? "Activo"
            : row.original.status === "inactive"
              ? "Desactivado"
              : "Archivado"}
        </StatusBadge>
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
      cell: ({ row }) => {
        const issuer = row.original;
        const canChangeStatus =
          (canEdit && issuer.status !== "archived") || canArchive;

        return (
          <ActionMenu
            label={`Acciones para ${issuer.name}`}
            options={[
              canEdit && issuer.status === "active"
                ? {
                    label: "Editar",
                    href: `/catalogs/issuers/${issuer.id}/edit`,
                    icon: <Pencil className="size-4" aria-hidden="true" />,
                  }
                : null,
              {
                label: "Copiar clave",
                onSelect: () => void navigator.clipboard.writeText(issuer.key),
                icon: <Copy className="size-4" aria-hidden="true" />,
              },
              {
                label: "Copiar razón social",
                onSelect: () => void navigator.clipboard.writeText(issuer.legalName),
                icon: <Copy className="size-4" aria-hidden="true" />,
              },
              canChangeStatus || canDelete ? { type: "separator" as const } : null,
              canEdit && issuer.status === "inactive"
                ? {
                    label: "Activar",
                    disabled: statusChangingId === issuer.id,
                    onSelect: () => void changeIssuerStatus(issuer, "active"),
                    icon: <CheckCircle2 className="size-4" aria-hidden="true" />,
                  }
                : null,
              canEdit && issuer.status === "active"
                ? {
                    label: "Desactivar",
                    disabled: statusChangingId === issuer.id,
                    onSelect: () => void changeIssuerStatus(issuer, "inactive"),
                    icon: <CircleOff className="size-4" aria-hidden="true" />,
                  }
                : null,
              canArchive && issuer.status !== "archived"
                ? {
                    label: "Archivar",
                    destructive: true,
                    onSelect: () => void changeIssuerStatus(issuer, "archive"),
                    icon: <Archive className="size-4" aria-hidden="true" />,
                  }
                : null,
              canArchive && issuer.status === "archived"
                ? {
                    label: "Desarchivar",
                    disabled: statusChangingId === issuer.id,
                    onSelect: () => void changeIssuerStatus(issuer, "unarchive"),
                    icon: <ArchiveRestore className="size-4" aria-hidden="true" />,
                  }
                : null,
              canDelete && canChangeStatus ? { type: "separator" as const } : null,
              canDelete
                ? {
                    label: "Eliminar",
                    destructive: true,
                    disabled: deletingId === issuer.id,
                    onSelect: () => {
                      setDeleteError("");
                      setDeleteTarget(issuer);
                    },
                    icon: <Trash2 className="size-4" aria-hidden="true" />,
                  }
                : null,
            ]}
          />
        );
      },
    },
  ];

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-4 p-5">
        {statusError && <Alert variant="destructive" className="font-medium">{statusError}</Alert>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {loading ? "Actualizando emisores…" : `${total} ${total === 1 ? "emisor" : "emisores"}`}
            </p>
            <Badge variant="info">{statusFilter === "all" ? "Todos" : statusFilter === "active" ? "Activos" : statusFilter === "inactive" ? "Desactivados" : "Archivados"}</Badge>
            {typeFilter !== "all" && <Badge variant="outline">{typeNames[typeFilter] ?? typeFilter}</Badge>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar emisores…"
                aria-label="Buscar emisores"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu
                open={filtersOpen}
                onOpenChange={(open) => {
                  if (open) {
                    setDraftStatusFilter(statusFilter);
                    setDraftTypeFilter(typeFilter);
                  }
                  setFiltersOpen(open);
                }}
              >
                <DropdownMenuTrigger render={<Button variant="outline" className="min-w-28 px-4" />}>
                  <Funnel className="size-4" aria-hidden="true" />
                  Filtros
                  {visibleFilterCount > 0 && <Badge variant="info">{visibleFilterCount}</Badge>}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0">
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <p className="text-sm font-semibold">Filtros</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Refina los emisores por estado o tipo.</p>
                  </div>
                  <div className="max-h-[min(22rem,60vh)] space-y-2 overflow-y-auto p-2">
                    <div className="rounded-md border border-border p-1">
                      <p className="px-3 py-1 text-xs font-semibold text-muted-foreground">Estado</p>
                      <DropdownMenuRadioGroup aria-label="Estado del emisor" value={draftStatusFilter} onValueChange={(value) => setDraftStatusFilter(value as IssuerFilterStatus)}>
                        <DropdownMenuRadioItem className="min-h-10" value="active" closeOnClick={false}>Activos</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem className="min-h-10" value="inactive" closeOnClick={false}>Desactivados</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem className="min-h-10" value="archived" closeOnClick={false}>Archivados</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem className="min-h-10" value="all" closeOnClick={false}>Todos los estados</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </div>
                    <div className="rounded-md border border-border p-1">
                      <p className="px-3 py-1 text-xs font-semibold text-muted-foreground">Tipo</p>
                      <DropdownMenuRadioGroup aria-label="Tipo de emisor" value={draftTypeFilter} onValueChange={setDraftTypeFilter}>
                        <DropdownMenuRadioItem className="min-h-10" value="all" closeOnClick={false}>Todos los tipos</DropdownMenuRadioItem>
                        {Object.entries(typeNames).map(([value, label]) => (
                          <DropdownMenuRadioItem className="min-h-10" key={value} value={value} closeOnClick={false}>{label}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-border p-2">
                    <Button variant="link" size="sm" className="flex-1 text-muted-foreground" disabled={!hasAnyFilters} onClick={clearFilters}>Restablecer</Button>
                    <Button size="sm" className="flex-1" disabled={!hasPendingFilterChanges} onClick={() => {
                      onApplyFilters(draftStatusFilter, draftTypeFilter);
                      setFiltersOpen(false);
                    }}>Aplicar</Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon" aria-label="Recargar emisores" title="Recargar emisores" disabled={loading} onClick={onRefresh}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <div className="border-t border-border" aria-busy={loading}>
        <DataTable
          columns={columns}
          data={issuers}
          loading={loading}
          loadingMessage="Cargando emisores…"
          emptyMessage={hasAppliedFilters
            ? "No hay emisores que coincidan con la búsqueda o filtros."
            : "Aún no hay emisores activos. Cambia el filtro de estado para consultar otros emisores."}
          className="min-w-[940px]"
          containerClassName="rounded-none border-0"
        />
      </div>
      <CardFooter className="flex flex-col gap-3 border-t border-border bg-card px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {loading ? "Cargando…" : issuers.length
            ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + issuers.length} de ${total} ${total === 1 ? "emisor" : "emisores"}`
            : `0 de ${total} ${total === 1 ? "emisor" : "emisores"}`}
        </p>
        <Pagination className="mx-0 w-auto sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                disabled={loading || page === 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              />
            </PaginationItem>
            <PaginationItem><span className="flex h-10 items-center px-2 tabular-nums">{page} de {pageCount}</span></PaginationItem>
            <PaginationItem>
              <PaginationNext
                disabled={loading || page >= pageCount}
                onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </CardFooter>
      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && !statusChangingId && setStatusTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia
              className={statusTarget?.status === "inactive"
                ? "bg-zuno-warning-surface text-zuno-warning"
                : "bg-zuno-success-surface text-zuno-success"}
            >
              {statusTarget?.status === "inactive" ? (
                <CircleOff className="size-5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {statusTarget?.status === "inactive"
                ? "¿Desactivar emisor?"
                : "¿Activar emisor?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.status === "inactive"
                ? `“${statusTarget.issuer.name}” dejará de estar disponible para nuevas operaciones. Podrás activarlo después.`
                : `“${statusTarget?.issuer.name}” volverá a estar disponible para nuevas operaciones.`}
            </AlertDialogDescription>
            {statusError && <p className="text-sm font-medium text-destructive">{statusError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={Boolean(statusChangingId)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={Boolean(statusChangingId)}
              onClick={() => void confirmStatusChange()}
            >
              {statusChangingId && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {statusChangingId
                ? statusTarget?.status === "inactive"
                  ? "Desactivando…"
                  : "Activando…"
                : statusTarget?.status === "inactive"
                  ? "Desactivar"
                  : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && !archivingId && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-zuno-error-surface text-zuno-error">
              <Archive className="size-5" aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Archivar emisor</AlertDialogTitle>
            <AlertDialogDescription>
              “{archiveTarget?.name}” dejará de estar disponible y se conservarán sus datos e historial. Podrás desarchivarlo después.
            </AlertDialogDescription>
            {archiveError && <p className="text-sm font-medium text-destructive">{archiveError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={Boolean(archivingId)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={Boolean(archivingId)}
              onClick={() => void archiveIssuer()}
            >
              {archivingId && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
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
            <AlertDialogMedia className="bg-zuno-error-surface text-zuno-error">
              <Trash2 className="size-5" aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Eliminar emisor</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” se eliminará lógicamente, dejará de aparecer en los listados y conservará su historial.
            </AlertDialogDescription>
            {deleteError && <p className="text-sm font-medium text-destructive">{deleteError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={Boolean(deletingId)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={Boolean(deletingId)}
              onClick={() => void deleteIssuer()}
            >
              {deletingId && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {deletingId ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function IssuerEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-info-subtle text-primary">
          <Scale className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}

function IssuerErrorState({
  error,
  onRetry,
}: {
  error: LegalApiError | Error;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      className="grid min-h-panel-min place-items-center rounded-lg border border-error bg-error-subtle p-6 text-center text-error"
    >
      <div className="max-w-md">
        <h2 className="text-lg font-semibold">No se pudieron cargar los emisores</h2>
        <p className="mt-2 text-sm">{error.message}</p>
        {error instanceof LegalApiError && error.traceId && (
          <p className="mt-1 font-mono text-xs">Referencia: {error.traceId}</p>
        )}
        <Button variant="outline" className="mt-6 px-4" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Reintentar
        </Button>
      </div>
    </section>
  );
}

function IssuersSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando emisores legales…</span>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <Skeleton className="h-5 w-24" />
          <div className="flex flex-wrap gap-2"><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="h-10 w-28" /></div>
        </div>
        <div className="space-y-3 border-t border-border p-5">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </div>
        <div className="border-t border-border p-5"><Skeleton className="h-5 w-44" /></div>
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
