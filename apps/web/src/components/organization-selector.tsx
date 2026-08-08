"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { legalApi } from "@/lib/legal-api";
import type { LegalSession } from "@/lib/legal-session";
import { Button } from "@/components/ui/button";

export function OrganizationSelector({
  session,
  blocking = false,
}: {
  session: LegalSession;
  blocking?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(session.activeOrganizationId ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function select() {
    if (!selected || selected === session.activeOrganizationId) return;
    setLoading(true);
    setError("");
    try {
      await legalApi("/v1/legal/context", {
        method: "POST",
        body: JSON.stringify({ organizationId: selected }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar la organización.");
      setLoading(false);
    }
  }

  const active = session.organizations.find(
    (organization) => organization.organizationId === session.activeOrganizationId,
  );

  if (!blocking && session.organizations.length === 1) return null;

  if (blocking) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-sm">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-surface-line bg-card p-7 text-left shadow-sm">
          <div>
            <h1 className="text-lg font-semibold">Selecciona una organización</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Elige el contexto Legal que quieres utilizar.
            </p>
          </div>
          <SelectorInput
            organizations={session.organizations}
            value={selected}
            onChange={setSelected}
          />
          <Button disabled={!selected || loading} onClick={select}>
            {loading ? "Cargando…" : "Continuar"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <SelectorInput
        organizations={session.organizations}
        value={selected}
        onChange={setSelected}
        aria-label="Organización activa"
      />
      <span className="hidden text-xs text-muted-foreground xl:inline">
        Tenant {session.productTenantId?.slice(0, 8) ?? "—"}
      </span>
      <span className="hidden max-w-56 truncate text-xs text-muted-foreground 2xl:inline">
        {session.permissions.length
          ? session.permissions.join(", ")
          : "Sin permisos locales"}
      </span>
      {selected !== session.activeOrganizationId && (
        <Button type="button" variant="outline" onClick={select} disabled={loading}>
          {loading ? "Cargando…" : "Cambiar"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
      {active && <span className="sr-only">{active.name}</span>}
    </div>
  );
}

function SelectorInput({
  organizations,
  value,
  onChange,
  ...props
}: {
  organizations: LegalSession["organizations"];
  value: string;
  onChange: (value: string) => void;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 max-w-56 rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {!value && <option value="">Selecciona organización…</option>}
      {organizations.map((organization) => (
        <option key={organization.organizationId} value={organization.organizationId}>
          {organization.name}
        </option>
      ))}
    </select>
  );
}
