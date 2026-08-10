"use client";

import { Fragment } from "react";
import { Bell, LayoutGrid, PanelLeft, PanelRight, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
        className="absolute left-0 top-1/2 z-30 hidden size-9 -translate-x-1/2 -translate-y-1/2 place-items-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring md:grid"
      >
        {sidebarCollapsed ? (
          <PanelRight className="size-4" />
        ) : (
          <PanelLeft className="size-4" />
        )}
      </button>
      <Breadcrumb aria-label="Ruta actual" className="min-w-0">
        <BreadcrumbList className="flex-nowrap gap-3 overflow-hidden text-sm">
          <BreadcrumbItem className="hidden shrink-0 sm:inline-flex">
            <BreadcrumbLink render={<Link href="/" />}>
              <span className="inline-flex items-center gap-2">
                <LayoutGrid className="size-4 shrink-0" />
                Hemia
              </span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbs.map(({ label, href }, index) => (
            <Fragment key={label}>
              <BreadcrumbSeparator className={index === 0 ? "hidden sm:block" : undefined} />
              <BreadcrumbItem className="min-w-0 shrink-0">
                {href ? (
                  <BreadcrumbLink render={<Link href={href} />} className="truncate">
                    {label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate font-semibold">{label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
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
          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Settings className="size-4" />
        </Link>
      </div>
    </header>
  );
}
