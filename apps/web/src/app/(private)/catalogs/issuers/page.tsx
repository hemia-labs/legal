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
  LoaderCircle,
  Pencil,
  Funnel,
  MoreVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { legalApi, LegalApiError } from "@/lib/legal-api";
import { useLegalSession } from "@/components/app-shell";

const PAGE_SIZE = 10;

type Issuer = {
  id: string;
  key: string;
  name: string;
  legalName: string;
  type: string;
  taxId: string | null;
  countryCode: string;
  defaultLocale: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type IssuerListResponse = {
  items: Issuer[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

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
  const [statusFilter, setStatusFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [meta, setMeta] = useState<IssuerListResponse["meta"]>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
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
      const params = new URLSearchParams({
        page: String(requestedPage),
        limit: String(PAGE_SIZE),
      });
      if (query.trim()) params.set("search", query.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const response = await legalApi<IssuerListResponse>(
        `/v1/legal/issuers?${params.toString()}`,
      );
      if (version !== requestVersion.current) return;
      setIssuers(response.items);
      setMeta(response.meta);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(cause instanceof Error ? cause : new Error("No se pudieron cargar los emisores."));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [query, session, statusFilter, typeFilter]);

  useEffect(() => {
    const requestKey = `${organizationKey}:${page}:${query}:${statusFilter}:${typeFilter}`;
    if (loadedRequest.current === requestKey) return;
    loadedRequest.current = requestKey;
    void load(page);
  }, [load, organizationKey, page, query, statusFilter, typeFilter]);

  if (loading) return <IssuersSkeleton />;

  const permissions = session.permissions;
  const forbidden = error instanceof LegalApiError && error.status === 403;
  const canView = hasPermission(permissions, "legal.issuers.view");
  const canCreate =
    !forbidden && hasPermission(permissions, "legal.issuers.create");
  const canEdit = !forbidden && hasPermission(permissions, "legal.issuers.edit");
  const canArchive = !forbidden && hasPermission(permissions, "legal.issuers.archive");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-heading">Emisores legales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra las entidades y marcas responsables de los documentos legales.
          </p>
        </div>
        {canCreate && meta.total > 0 && (
          <Button
            render={<Link href="/catalogs/issuers/new" />}
            nativeButton={false}
            className="px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear emisor
          </Button>
        )}
      </header>

      {error && !forbidden ? (
        <IssuerErrorState error={error} onRetry={() => void load(page)} />
      ) : forbidden || !canView ? (
        <IssuerEmptyState
          title="Sin acceso a emisores legales"
          description="Tu rol no incluye el permiso legal.issuers.view."
        />
      ) : meta.total > 0 || search || query || typeFilter !== "all" ? (
        <IssuerTable
          issuers={issuers}
          canEdit={canEdit}
          canArchive={canArchive}
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
          onClearFilters={() => {
            setSearch("");
            setQuery("");
            setStatusFilter("active");
            setTypeFilter("all");
            setPage(1);
          }}
          onArchived={(id) =>
            setIssuers((current) =>
              current.map((issuer) =>
                issuer.id === id ? { ...issuer, status: "archived" } : issuer,
              ),
            )
          }
        />
      ) : (
        <IssuerEmptyState
          title="Aún no hay emisores legales"
          description="Crea el primer emisor para comenzar a registrar aplicaciones y documentos."
          action={canCreate}
        />
      )}
    </div>
  );
}

function IssuerTable({
  issuers,
  canEdit,
  canArchive,
  search,
  statusFilter,
  typeFilter,
  page,
  total,
  totalPages,
  onQueryChange,
  onApplyFilters,
  onPageChange,
  onClearFilters,
  onArchived,
}: {
  issuers: Issuer[];
  canEdit: boolean;
  canArchive: boolean;
  search: string;
  statusFilter: string;
  typeFilter: string;
  page: number;
  total: number;
  totalPages: number;
  onQueryChange: (value: string) => void;
  onApplyFilters: (status: string, type: string) => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
  onArchived: (id: string) => void;
}) {
  const [archiveTarget, setArchiveTarget] = useState<Issuer | null>(null);
  const [archivingId, setArchivingId] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState(statusFilter);
  const [draftTypeFilter, setDraftTypeFilter] = useState(typeFilter);
  const activeFilterCount = Number(statusFilter === "archived") + Number(typeFilter !== "all");
  const draftFilterCount =
    Number(draftStatusFilter === "archived") + Number(draftTypeFilter !== "all");
  const hasPendingFilterChanges =
    draftStatusFilter !== statusFilter || draftTypeFilter !== typeFilter;
  const visibleFilterCount = hasPendingFilterChanges
    ? draftFilterCount
    : activeFilterCount;
  const hasAnyFilters = Boolean(search) || visibleFilterCount > 0;

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
      await legalApi(`/v1/legal/issuers/${target.id}`, { method: "DELETE" });
      onArchived(target.id);
      setArchiveTarget(null);
    } catch (cause) {
      setArchiveError(
        cause instanceof Error ? cause.message : "No se pudo archivar el emisor.",
      );
    } finally {
      setArchivingId("");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-surface-line bg-card p-1 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-surface-line p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search ?? ""}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar emisores…"
            aria-label="Buscar emisores"
            className="pl-9"
          />
        </div>
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
            {hasAnyFilters && (
              <span className="ml-1 inline-flex items-center gap-1">
                {visibleFilterCount > 0 && (
                  <Badge variant="secondary">{visibleFilterCount}</Badge>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Limpiar filtros"
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuRadioGroup
              value={draftStatusFilter}
              onValueChange={setDraftStatusFilter}
            >
              <DropdownMenuLabel>Estado</DropdownMenuLabel>
              <DropdownMenuRadioItem value="active" closeOnClick={false}>
                Activos
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="archived" closeOnClick={false}>
                Archivados
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={draftTypeFilter}
              onValueChange={setDraftTypeFilter}
            >
              <DropdownMenuLabel>Tipo</DropdownMenuLabel>
              <DropdownMenuRadioItem value="all" closeOnClick={false}>
                Todos
              </DropdownMenuRadioItem>
              {Object.entries(typeNames).map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value} closeOnClick={false}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!hasAnyFilters}
              onClick={clearFilters}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Limpiar filtros
            </DropdownMenuItem>
            <Button
              className="mt-2 w-full disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={!hasPendingFilterChanges}
              onClick={() => {
                onApplyFilters(draftStatusFilter, draftTypeFilter);
                setFiltersOpen(false);
              }}
            >
              Aplicar filtros
            </Button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pt-3">
        <Table className="[&_thead_th:first-child]:rounded-l-lg [&_thead_th:last-child]:rounded-r-lg">
        <TableHeader className="bg-transparent [&_tr]:border-0">
          <TableRow className="border-0 bg-surface-soft hover:bg-surface-soft even:bg-surface-soft">
            <TableHead className="h-10 px-4 normal-case">Emisor</TableHead>
            <TableHead className="h-10 px-4 normal-case">Tipo</TableHead>
            <TableHead className="h-10 px-4 normal-case">Clave</TableHead>
            <TableHead className="h-10 px-4 normal-case">Región</TableHead>
            <TableHead className="h-10 px-4 normal-case">Estado</TableHead>
            <TableHead className="h-10 px-4 normal-case">Actualizado</TableHead>
            <TableHead className="h-10 w-12 px-2 text-right normal-case">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issuers.length ? issuers.map((issuer) => (
            <TableRow
              key={issuer.id}
              className="border-surface-line bg-card even:bg-card hover:bg-surface-soft/60"
            >
              <TableCell className="px-4 py-3">
                <p className="font-medium text-foreground">{issuer.name}</p>
                <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground">
                  {issuer.legalName}
                </p>
              </TableCell>
              <TableCell className="px-4 py-3">{typeNames[issuer.type] ?? issuer.type}</TableCell>
              <TableCell className="px-4 py-3 font-mono text-xs">{issuer.key}</TableCell>
              <TableCell className="px-4 py-3">
                {issuer.countryCode} · {issuer.defaultLocale}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Badge variant={issuer.status === "active" ? "success" : "neutral"}>
                  {issuer.status === "active" ? "Activo" : "Archivado"}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-3">{formatDate(issuer.updatedAt)}</TableCell>
              <TableCell className="w-12 px-1 py-1 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-8"
                        aria-label={`Acciones para ${issuer.name}`}
                      />
                    }
                  >
                    <MoreVertical className="size-4" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canEdit && issuer.status === "active" && (
                      <DropdownMenuItem
                        render={<Link href={`/catalogs/issuers/${issuer.id}/edit`} />}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        Editar emisor
                      </DropdownMenuItem>
                    )}
                    {canArchive && issuer.status === "active" && (
                      <DropdownMenuItem onClick={() => setArchiveTarget(issuer)}>
                        <Archive className="size-4" aria-hidden="true" />
                        Archivar emisor
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => void navigator.clipboard.writeText(issuer.key)}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      Copiar clave
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void navigator.clipboard.writeText(issuer.legalName)
                      }
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      Copiar razón social
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow className="bg-card hover:bg-card even:bg-card">
              <TableCell colSpan={7} className="h-24 px-4 py-3 text-center text-sm text-muted-foreground">
                No hay emisores que coincidan con la búsqueda o filtros.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        </Table>
      </div>
      <footer className="flex flex-col gap-3 border-t border-surface-line p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {issuers.length
            ? `Mostrando ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} de ${total} ${total === 1 ? "emisor" : "emisores"}`
            : "Sin resultados"}
        </p>
        {totalPages > 1 && (
          <Pagination className="mx-0 w-auto sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  disabled={page === 1}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      isActive={pageNumber === page}
                      aria-label={`Ir a la página ${pageNumber}`}
                      onClick={() => onPageChange(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  disabled={page === totalPages}
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </footer>
      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && !archivingId && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Archive className="size-5" aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Archivar emisor</AlertDialogTitle>
            <AlertDialogDescription>
              “{archiveTarget?.name}” dejará de estar disponible para nuevas operaciones. Sus datos e historial se conservarán.
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
    </section>
  );
}

function IssuerEmptyState({
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
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-info-subtle text-primary">
          <Scale className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {action && (
          <Button
            render={<Link href="/catalogs/issuers/new" />}
            nativeButton={false}
            className="mt-6 px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear emisor
          </Button>
        )}
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
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
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
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
