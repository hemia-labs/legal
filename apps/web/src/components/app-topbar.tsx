"use client";

import { Fragment } from "react";
import Image from "next/image";
import { BrandWordmark } from "@/components/brand-wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { OrganizationSelector } from "@/components/organization-selector";
import { breadcrumbsFor } from "@/lib/nav";
import type { LegalSession } from "@/lib/legal-session";

export function AppTopbar({ session }: { session: LegalSession }) {
  const breadcrumbs = breadcrumbsFor(usePathname());

  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger aria-label="Mostrar u ocultar navegación" className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 hidden h-4 md:block" />
      <Link href="/" aria-label="Hemia Legal" className="flex items-center gap-2 md:hidden">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--hemia-navy)] p-0.5 dark:bg-transparent dark:p-0">
          <Image src="/logo.png" alt="" width={93} height={113} className="h-full w-auto" />
        </span>
        <BrandWordmark compact />
      </Link>
      <Breadcrumb aria-label="Ruta actual" className="hidden min-w-0 md:block">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Hemia Legal</BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbs.map(({ label, href }, index) => (
            <Fragment key={`${label}-${index}`}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                {href ? (
                  <BreadcrumbLink render={<Link href={href} />} className="truncate">{label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="max-w-[32vw] truncate">{label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto hidden min-w-0 md:block">
        <OrganizationSelector session={session} />
      </div>
    </header>
  );
}
