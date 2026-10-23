"use client";

import {
  Clock3,
  Link2,
  LoaderCircle,
  MoreVertical,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/zuno/badge";
import { StatusBadge } from "@/components/zuno/status-badge";
import { Button } from "@/components/zuno/button";
import { PageHeading } from "@/components/page-heading";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/zuno/dropdown-menu";
import type { DocumentTypeOption, LegalDocument, LegalVersion } from "@/services/document.service";

type DocumentStatusTone = "neutral" | "success" | "warning";
type DocumentDetailTab = "content" | "versions";

export function DocumentDetailHeader({
  document,
  policy,
  currentVersion,
  statusLabel,
  statusVariant,
  refreshing,
  isArchived,
  hasDraft,
  onRefresh,
  onPublish,
  onOpenTab,
}: {
  document: LegalDocument;
  policy: DocumentTypeOption | null;
  currentVersion?: LegalVersion;
  statusLabel: string;
  statusVariant: DocumentStatusTone;
  refreshing: boolean;
  isArchived: boolean;
  hasDraft: boolean;
  onRefresh: () => void;
  onPublish: () => void;
  onOpenTab: (tab: DocumentDetailTab) => void;
}) {
  const documentType = policy?.name ?? documentTypeLabel(document.documentType);
  const application = document.application?.name ?? document.applicationId;

  return (
    <header className="flex flex-col gap-3">
      <PageHeading
        title={document.title}
        description={`Clave ${document.key} · ${documentType} · ${application} · ${document.locale}`}
        actions={
          <>
            <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              Actualizar
            </Button>
            <Button disabled={isArchived} onClick={onPublish}>
              <Upload className="size-4" aria-hidden="true" /> Publicar nueva versión
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" aria-label="Más acciones" size="icon" />}>
                <MoreVertical className="size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpenTab("content")}>
                  <Link2 className="size-4" aria-hidden="true" /> Ver contenido
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenTab("versions")}>
                  <Clock3 className="size-4" aria-hidden="true" /> Historial de versiones
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={statusVariant}>{statusLabel}</StatusBadge>
        {currentVersion && <Badge variant="info">Versión vigente v{currentVersion.version}</Badge>}
        {hasDraft && <Badge variant="info">Borrador pendiente</Badge>}
        {isArchived && <Badge variant="neutral">Solo lectura</Badge>}
        <span className="text-xs text-muted-foreground">Actualizado el {formatDate(document.updatedAt)}</span>
      </div>
    </header>
  );
}

function documentTypeLabel(value: string) {
  return value === "terms_and_conditions" ? "Términos y condiciones" : value.replaceAll("_", " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}
