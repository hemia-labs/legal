"use client";

import { Fragment } from "react";
import { Bell, LayoutGrid, PanelLeft, PanelRight, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { breadcrumbsFor } from "@/lib/nav";
import { OrganizationSelector } from "@/components/organization-selector";
import type { LegalSession } from "@/lib/legal-session";

export function AppTopbar({
  session,
  sidebarCollapsed,
  onSidebarToggle,
}: {
  session: LegalSession;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}) {
  const breadcrumbs = breadcrumbsFor(usePathname());
  return (
    <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-4 border-b border-border bg-card px-4 sm:px-5 lg:px-6">
      <button
        type="button"
        onClick={onSidebarToggle}
        aria-label={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
        aria-expanded={!sidebarCollapsed}
        className="absolute left-0 top-1/2 z-30 hidden size-9 -translate-x-1/2 -translate-y-1/2 place-items-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:grid"
      >
        {sidebarCollapsed ? (
          <PanelRight className="size-4" />
        ) : (
          <PanelLeft className="size-4" />
        )}
      </button>
      <nav aria-label="Ruta actual" className="flex min-w-0 items-center gap-3 text-sm">
        <LayoutGrid className="size-4 shrink-0 text-hemia-500" />
        <Link href="/" className="hidden text-hemia-500 hover:text-foreground sm:inline">
          Hemia
        </Link>
        {breadcrumbs.map(({ label, href }, index) => (
          <Fragment key={label}>
            <span className={index === 0 ? "hidden text-hemia-300 sm:inline" : "text-hemia-300"}>
              /
            </span>
            {href ? (
              <Link href={href} className="text-hemia-500 hover:text-foreground">
                {label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-foreground">{label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <OrganizationSelector session={session} />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificaciones"
        >
          <Bell className="size-4" />
        </Button>
        <Link
          href="/settings"
          aria-label="Configuración legal"
          title="Configuración legal"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Settings className="size-4" />
        </Link>
      </div>
    </header>
  );
}
