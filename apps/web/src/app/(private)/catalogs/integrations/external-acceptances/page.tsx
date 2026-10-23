"use client";
import Link from "next/link";
import { Plus, Search, Filter, MoreHorizontal, Pencil, Ban, Eye } from "lucide-react";
import { StatusBadge } from "@/components/zuno/status-badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/zuno/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useRef, useState } from "react";
import { useLegalSession } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/zuno/button";
import { Input } from "@/components/zuno/input";
import {
  listIntegrations,
  disableIntegration,
  type Integration,
} from "@/services/integration.service";
import { LegalApiError } from "@/lib/legal-api";
function message(cause: unknown) {
  if (cause instanceof LegalApiError) {
    if (cause.status === 403)
      return "La integración está fuera de tu alcance o falta el permiso requerido.";
    if (cause.status === 409)
      return "Hay un conflicto de identidad o una clave duplicada. Revisa los datos.";
    if (cause.status === 429)
      return "Demasiadas solicitudes. Espera un momento y reintenta.";
    if (cause.status === 400)
      return "Revisa los identificadores, documentos y el origen permitido de verificación.";
  }
  return "No se pudo completar la operación. Reintenta.";
}
export default function ExternalAcceptancesPage() {
  const session = useLegalSession();
  return (
    <IntegrationScreen
      key={`${session.activeOrganizationId}:${session.permissions.join(",")}`}
    />
  );
}
function IntegrationScreen() {
  const session = useLegalSession();
  const allowed = (p: string) => session.permissions.includes(p);
  const [rows, setRows] = useState<Integration[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const query = search.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) =>
    (status === "all" || row.enabled === (status === "enabled")) &&
    [row.name, row.code, row.productCode, row.identityIssuer, row.contextUrl,
      ...row.clients.map((client) => client.clientId)]
      .some((value) => value.toLocaleLowerCase().includes(query)),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const canView = allowed("legal.integrations.view");
  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    let live = true;
    void listIntegrations(controller.signal)
      .then((value) => {
        if (live) setRows(value);
      })
      .catch((c) => {
        if (live) setError(message(c));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [canView, revision, session]);
  async function disable(row: Integration) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await disableIntegration(row.id);
      if (active.current) {
        setLoading(true);
        setRevision((v) => v + 1);
      }
    } catch (c) {
      if (active.current) setError(message(c));
    } finally {
      if (active.current) setSaving(false);
    }
  }
  if (!canView)
    return (
      <PageHeading
        title="Aceptaciones externas"
        description="Necesitas legal.integrations.view dentro del emisor o aplicación correspondiente."
      />
    );
  return (
    <div className="space-y-6">
      <PageHeading
        title="Aceptaciones externas"
        description="Aplicaciones que registran aceptaciones y servicios que validan evidencia legal."
        actions={allowed("legal.integrations.create") ? <Button disabled={saving} render={<Link href="/catalogs/integrations/external-acceptances/new" />} nativeButton={false}>
            <Plus className="size-4" aria-hidden="true" />Nueva integración
          </Button> : undefined}
      />
      {error ? (
        <div role="alert" className="rounded-lg border border-destructive p-4">
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              setError("");
              setRevision((v) => v + 1);
            }}
          >
            Reintentar consulta
          </Button>
        </div>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label="Listado de aceptaciones externas">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : error ? "Consulta no disponible" : `${filteredRows.length} de ${rows.length} integraciones`}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <label className="sr-only" htmlFor="integrations-search">Buscar por nombre, código, cliente, producto u origen</label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="integrations-search" className="pl-10 text-sm" placeholder="Buscar" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-center gap-2 px-4 sm:w-auto" />}>
                <Filter aria-hidden="true" className="size-4" />Filtros{status === "all" ? "" : " (1)"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuRadioGroup aria-label="Estado de integración" value={status} onValueChange={setStatus}>
                  <DropdownMenuRadioItem value="all">Todos los estados</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="enabled">Habilitadas</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="disabled">Deshabilitadas</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {loading ? <p role="status" className="border-t border-border p-5 text-sm text-muted-foreground">Cargando aceptaciones externas…</p> : !error && (
          <div className="overflow-x-auto border-t border-border">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-transparent [&_th:first-child]:rounded-tl-none [&_th:last-child]:rounded-tr-none">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 px-5 text-xs font-medium normal-case text-muted-foreground">Integración</TableHead>
                  <TableHead className="px-2 text-xs font-medium normal-case text-muted-foreground">Producto / origen</TableHead>
                  <TableHead className="px-2 text-xs font-medium normal-case text-muted-foreground">Clientes</TableHead>
                  <TableHead className="px-2 text-xs font-medium normal-case text-muted-foreground">Organizaciones</TableHead>
                  <TableHead className="px-2 text-xs font-medium normal-case text-muted-foreground">Estado</TableHead>
                  <TableHead className="w-14 px-5"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filteredRows.length && <TableRow className="even:bg-transparent hover:bg-transparent"><TableCell colSpan={6} className="h-24 px-5 py-2 text-center text-muted-foreground">
                  {rows.length ? "No hay aceptaciones externas que coincidan con la búsqueda o los filtros." : "No hay aceptaciones externas configuradas en tu alcance."}
                </TableCell></TableRow>}
                {filteredRows.map((row) => (
                  <TableRow key={row.id} className="h-12 even:bg-transparent hover:bg-muted/30">
                    <TableCell className="max-w-60 px-5 py-2 text-foreground">
                      <p className="break-words font-semibold"><Link className="hover:underline" href={`/catalogs/integrations/external-acceptances/${encodeURIComponent(row.id)}`}>{row.name}</Link></p>
                      <p className="break-all text-xs text-muted-foreground">{row.code}</p>
                    </TableCell>
                    <TableCell className="max-w-64 px-2 py-2 text-foreground">
                      <p className="break-all">{row.productCode}</p>
                      <p className="break-all text-xs text-muted-foreground">{row.identityIssuer}</p>
                    </TableCell>
                    <TableCell className="px-2 py-2 text-foreground">{row.clients.filter((client) => client.enabled).length} habilitados</TableCell>
                    <TableCell className="px-2 py-2 text-foreground">{row.organizations.length ? `${row.organizations.filter((org) => org.enabled).length} permitidas` : "Verificadas por el producto"}</TableCell>
                    <TableCell className="px-2 py-2 text-foreground"><StatusBadge status={row.enabled ? "success" : "neutral"}>{row.enabled ? "Habilitada" : "Deshabilitada"}</StatusBadge></TableCell>
                    <TableCell className="px-5 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button aria-label={`Acciones de ${row.name}`} className="size-8" disabled={saving} size="icon" variant="ghost" />}>
                          <MoreHorizontal aria-hidden="true" className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/catalogs/integrations/external-acceptances/${encodeURIComponent(row.id)}`} />}><Eye aria-hidden="true" className="size-4" />Ver detalle</DropdownMenuItem>
                          {allowed("legal.integrations.edit") && <DropdownMenuItem render={<Link href={`/catalogs/integrations/external-acceptances/${encodeURIComponent(row.id)}/edit`} />}><Pencil aria-hidden="true" className="size-4" />Editar</DropdownMenuItem>}
                          {row.enabled && allowed("legal.integrations.disable") && <DropdownMenuItem onClick={() => void disable(row)}><Ban aria-hidden="true" className="size-4" />Deshabilitar</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
