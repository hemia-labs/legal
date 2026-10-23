import { integrationTypes, integrationsRoot } from "@/lib/integration-catalog";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  LifeBuoy,
  MessageSquare,
  Settings,
} from "lucide-react";

export const mainNav = [
  {
    href: "/documents",
    label: "Documentos",
    icon: FileText,
    empty: "Aún no hay documentos en esta organización.",
  },
  {
    href: "/acceptances",
    label: "Aceptaciones",
    icon: CheckCircle2,
    empty: "Aún no hay aceptaciones registradas.",
  },
  {
    href: "/notifications",
    label: "Notificaciones",
    icon: Bell,
    empty: "Aún no hay notificaciones legales.",
  },
  {
    href: "/audit",
    label: "Auditoría",
    icon: ClipboardList,
    empty: "Aún no hay eventos de auditoría.",
  },
];

export const adminNav = [
  {
    href: "/catalogs",
    label: "Catálogos",
    icon: BookOpen,
    empty: "Aún no hay emisores ni aplicaciones configurados.",
    children: [
      {
        href: "/catalogs/integrations",
        label: "Integraciones",
        tab: "integrations",
        createLabel: "Nueva integración",
        editLabel: "Editar integración",
      },
      {
        href: "/catalogs/issuers",
        label: "Emisores legales",
        tab: "issuers",
        createLabel: "Nuevo emisor",
        editLabel: "Editar emisor",
      },
      {
        href: "/catalogs/applications",
        label: "Aplicaciones",
        tab: "applications",
        createLabel: "Nueva aplicación",
        editLabel: "Editar aplicación",
      },
    ],
  },
];

export const supportNav = [
  {
    href: "/feedback",
    label: "Feedback",
    icon: MessageSquare,
    empty: "Aún no hay canales de feedback configurados.",
  },
  {
    href: "/help",
    label: "Ayuda y soporte",
    icon: LifeBuoy,
    empty: "La documentación de soporte estará disponible próximamente.",
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: Settings,
    empty: "Aún no hay preferencias adicionales para configurar.",
  },
];

export const nav = [
  ...mainNav,
  ...adminNav.map(({ href, label, icon, empty }) => ({
    href,
    label,
    icon,
    empty,
  })),
  ...supportNav,
];

export function labelFor(pathname: string) {
  const match = nav
    .filter((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Sección";
}

type Breadcrumb = {
  label: string;
  href?: string;
};

const detailLabels: Record<string, string> = {
  "/documents": "Detalle del documento",
  "/acceptances": "Detalle de aceptación",
  "/notifications": "Detalle de notificación",
  "/audit": "Detalle de evento",
};

function detailLabelFor(href: string) {
  return detailLabels[href] ?? "Detalle";
}

export function breadcrumbsFor(pathname: string): Breadcrumb[] {
  const group = adminNav.find(({ href }) => pathname.startsWith(href));

  if (!group) {
    const item = mainNav.find(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
    );
    if (!item) return [{ label: labelFor(pathname) }];
    if (pathname === item.href) return [{ label: item.label }];
    return [
      { label: item.label, href: item.href },
      { label: detailLabelFor(item.href) },
    ];
  }

  const child = group.children.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  const breadcrumbs: Breadcrumb[] = [
    { label: group.label, href: group.children[0].href },
  ];

  if (!child) return breadcrumbs;
  if (pathname === child.href) return [...breadcrumbs, { label: child.label }];

  breadcrumbs.push({ label: child.label, href: child.href });
  if (child.href === integrationsRoot) {
    const type = integrationTypes.find((item) => pathname === `${integrationsRoot}/${item.key}` || pathname.startsWith(`${integrationsRoot}/${item.key}/`));
    if (type) {
      const typePath = `${integrationsRoot}/${type.key}`;
      const suffix = pathname.slice(typePath.length);
      breadcrumbs.push({ label: type.title, ...(suffix ? { href: typePath } : {}) });
      if (suffix === "/new") breadcrumbs.push({ label: "Nueva integración" });
      else {
        const editMatch = suffix.match(/^\/([^/]+)\/edit$/);
        if (editMatch) {
          breadcrumbs.push({
            label: "Detalle de integración",
            href: `${typePath}/${editMatch[1]}`,
          });
          breadcrumbs.push({ label: "Editar integración" });
        } else if (suffix) {
          breadcrumbs.push({ label: "Detalle de integración" });
        }
      }
      return breadcrumbs;
    }
  }
  if (
    pathname.endsWith("/new") &&
    "createLabel" in child &&
    child.createLabel
  ) {
    breadcrumbs.push({ label: child.createLabel });
  } else if (
    pathname.endsWith("/edit") &&
    "editLabel" in child &&
    child.editLabel
  ) {
    breadcrumbs.push({ label: child.editLabel });
  }
  return breadcrumbs;
}
