"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  Search,
  Settings,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { adminNav, mainNav, supportNav } from "@/lib/nav";
import { legalLogout } from "@/lib/legal-api";
import type { LegalSession } from "@/lib/legal-session";

export function AppSidebar({
  session,
  collapsed,
}: {
  session: LegalSession;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const userName = session.user.name || session.user.email || "Usuario Legal";
  const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
  const filterNav = <T extends { label: string }>(items: T[]) =>
    normalizedQuery
      ? items.filter(({ label }) => label.toLocaleLowerCase("es-MX").includes(normalizedQuery))
      : items;
  const visibleMainNav = filterNav(mainNav);
  const visibleAdminNav = adminNav.flatMap((item) => {
    const itemMatches = item.label.toLocaleLowerCase("es-MX").includes(normalizedQuery);
    const children = itemMatches ? item.children : filterNav(item.children);
    return children.length ? [{ ...item, children }] : [];
  });
  const visibleSupportNav = filterNav(supportNav);

  function toggleTheme() {
    const nextDark = !dark;
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
    setDark(nextDark);
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await legalLogout();
    } catch {
      setLogoutError("No se pudo cerrar la sesión. Intenta nuevamente.");
      setLoggingOut(false);
    }
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out md:flex",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar",
      )}
    >
      <div
        className={cn(
          "flex h-topbar shrink-0 items-center gap-3 border-b border-sidebar-border px-4",
          collapsed && "justify-center gap-0 px-0",
        )}
      >
        <Link href="/" aria-label="Hemia Legal" className="shrink-0">
          <Image
            src="/icon-ligth.png"
            alt=""
            width={28}
            height={28}
            className="size-7 dark:hidden"
          />
          <Image
            src="/icon-dark.png"
            alt=""
            width={28}
            height={28}
            className="hidden size-7 dark:block"
          />
        </Link>
        {!collapsed && (
          <span className="truncate text-base font-semibold text-foreground">
            Hemia <span className="font-semibold text-muted-foreground">Legal</span>
          </span>
        )}
      </div>
      {!collapsed && (
        <div className="relative mx-3 my-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar en la navegación"
            className="bg-card pl-9 shadow-xs dark:bg-sidebar-accent"
          />
        </div>
      )}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto",
          collapsed && "pt-3",
        )}
      >
        {!collapsed && !!visibleMainNav.length && (
          <p className="mb-2 px-4 pt-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Navegación principal
          </p>
        )}
        <nav className={cn("flex flex-col gap-1", collapsed ? "px-2" : "px-3")}>
          {visibleMainNav.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </nav>
        {!collapsed && !!visibleAdminNav.length && (
          <p className="mb-2 mt-6 px-4 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administración
          </p>
        )}
        <nav className={cn("flex flex-col gap-1", collapsed ? "mt-4 px-2" : "px-3")}>
          {visibleAdminNav.map((item) => (
            <SidebarNavGroup
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </nav>
        {!collapsed &&
          !visibleMainNav.length &&
          !visibleAdminNav.length &&
          !visibleSupportNav.length && (
          <p className="px-6 py-4 text-xs text-muted-foreground">Sin resultados</p>
          )}
        <div className="flex-1" />
        {!collapsed && !!visibleSupportNav.length && (
          <p className="mb-2 mt-6 px-4 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Soporte
          </p>
        )}
        <nav className={cn("flex flex-col gap-1", collapsed ? "px-2" : "px-3")}>
          {visibleSupportNav.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </div>
      <div className={cn("mb-3 mt-4", collapsed ? "mx-2" : "mx-3")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Abrir menú de usuario"
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-md border border-sidebar-border bg-card px-2 shadow-xs outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring",
                  collapsed && "justify-center px-0",
                )}
                title={collapsed ? userName : undefined}
              />
            }
          >
            <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-hemia-bright text-xs font-semibold text-white">
              {getInitials(userName)}
              <span className="absolute right-0 bottom-0 size-2 rounded-full border border-sidebar bg-success" />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {userName}
                  </span>
                  {session.user.email && session.user.email !== userName && (
                    <span className="block truncate text-2xs text-muted-foreground">
                      {session.user.email}
                    </span>
                  )}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-[20rem]"
          >
            <div className="mb-1 flex min-h-16 items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-soft text-sm font-semibold text-foreground">
                {getInitials(userName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
                {session.user.email && (
                  <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                )}
              </div>
            </div>

            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/settings" />}
                className="h-9 gap-3 px-3"
              >
                <UserRound className="size-4 text-muted-foreground" />
                Tu perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link href="/settings" />}
                className="h-9 gap-3 px-3"
              >
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                Preferencias
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link href="/notifications" />}
                className="h-9 gap-3 px-3"
              >
                <Bell className="size-4 text-muted-foreground" />
                Notificaciones
                <span className="ml-auto size-2 rounded-full bg-primary" aria-label="Activas" />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <div className="flex h-9 items-center gap-3 rounded-md px-3 text-sm">
              <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>Tema</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {dark ? "Oscuro" : "Claro"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={dark}
                aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                onClick={toggleTheme}
                className={cn(
                  "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring",
                  dark ? "bg-primary" : "bg-muted-foreground/35",
                )}
              >
                <span
                  className={cn(
                    "size-4 rounded-full bg-white shadow-sm transition-transform",
                    dark && "translate-x-4",
                  )}
                />
              </button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/help" />}
                className="h-9 gap-3 px-3"
              >
                <CircleHelp className="size-4 text-muted-foreground" />
                Ayuda y soporte
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link href="/settings" />}
                className="h-9 gap-3 px-3"
              >
                <Settings className="size-4 text-muted-foreground" />
                Configuración
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              className="h-9 gap-3 px-3"
            >
              <LogOut className="size-4" />
              {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
            </DropdownMenuItem>
            {logoutError && (
              <p className="px-2.5 py-2 text-xs text-destructive" role="alert">
                {logoutError}
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

function SidebarNavGroup({
  item,
  pathname,
  collapsed,
}: {
  item: (typeof adminNav)[number];
  pathname: string;
  collapsed: boolean;
}) {
  const active = pathname.startsWith(item.href);
  const Icon = item.icon;

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={item.label}
              title={item.label}
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-md transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-hemia-royal/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            />
          }
        >
          <Icon className={cn("size-4", !active && "text-hemia-500 dark:text-muted-foreground")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-52">
          {item.children.map((child) => (
            <DropdownMenuItem key={child.href} render={<Link href={child.href} />}>
              {child.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <details open={active || undefined} className="group">
      <summary
        className={cn(
          "flex h-9 cursor-pointer list-none items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring [&::-webkit-details-marker]:hidden",
          active
            ? "text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-hemia-500 dark:text-muted-foreground")} />
        <span className="flex-1">{item.label}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="relative ml-5 mt-1 flex flex-col gap-1 pl-4">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[1.125rem] left-0 top-0 w-px bg-sidebar-border"
        />
        {item.children.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            className={cn(
              "relative flex h-9 items-center rounded-md px-3 text-[13px] font-medium transition-colors before:absolute before:-left-4 before:top-0 before:h-1/2 before:w-3 before:rounded-bl-md before:border-b before:border-l before:border-sidebar-border focus-visible:ring-3 focus-visible:ring-sidebar-ring",
              pathname === child.href || pathname.startsWith(`${child.href}/`)
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-hemia-royal/20"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {child.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function SidebarNavItem({
  item: { href, label, icon: Icon },
  pathname,
  collapsed,
}: {
  item: (typeof mainNav)[number] | (typeof supportNav)[number];
  pathname: string;
  collapsed: boolean;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md text-[13px] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-hemia-royal/20"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          !active && "text-hemia-500 dark:text-muted-foreground",
        )}
      />
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </Link>
  );
}

function getInitials(value: string) {
  return (
    value
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "HL"
  );
}
