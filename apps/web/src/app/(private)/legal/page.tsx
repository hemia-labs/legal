"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Bell,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Globe2,
  Layers3,
  Plus,
  RefreshCw,
  RotateCcw,
  Rocket,
  Save,
  Scale,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { legalApi, legalApiBlob, legalLogout } from "@/lib/legal-api";

type Tab =
  | "issuers"
  | "applications"
  | "documents"
  | "draft"
  | "acceptances"
  | "notifications"
  | "audit"
  | "public";
type Status =
  | "active"
  | "archived"
  | "published"
  | "superseded"
  | "pending"
  | "sent"
  | "failed"
  | "cancelled";

type Issuer = {
  id: string;
  key: string;
  name: string;
  legalName: string;
  type: string;
  taxId: string | null;
  countryCode: string;
  defaultLocale: string;
  status: Status;
};

type IssuerListResponse = {
  items: Issuer[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

type Application = {
  id: string;
  issuerId: string;
  key: string;
  name: string;
  status: Status;
};

type Document = {
  id: string;
  issuerId: string;
  applicationId: string;
  key: string;
  locale: string;
  title: string;
  status: Status;
};

type Draft = {
  id: string;
  documentId: string;
  contentMarkdown: string;
};

type Version = {
  id: string;
  documentId: string;
  version: string;
  status: Status;
  contentHash: string | null;
  effectiveFrom: string | null;
  acceptanceDeadline: string | null;
};

type Preview = {
  canPublish: boolean;
  conflicts: string[];
  currentPublished: Version | null;
  rulesCount: number;
  version: string;
};

type Acceptance = {
  id: string;
  documentVersionId: string;
  acceptanceRuleId: string;
  acceptanceMode: string;
  roleAtAcceptance: string | null;
  contentHash: string;
  acceptedAt: string;
};

type Notification = {
  id: string;
  channel: string;
  recipientLogicalId: string;
  status: Status;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  actorSubjectId: string;
  createdAt: string;
};

const tabs: { id: Tab; label: string; icon: typeof Scale }[] = [
  { id: "issuers", label: "Issuers", icon: Scale },
  { id: "applications", label: "Applications", icon: Layers3 },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "draft", label: "Draft", icon: Save },
  { id: "acceptances", label: "Acceptances", icon: CheckCircle2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "audit", label: "Audit", icon: ClipboardList },
  { id: "public", label: "Public", icon: Globe2 },
];

export default function LegalPage() {
  const router = useRouter();
  const requestedTab = useSearchParams().get("tab");
  const tab = tabs.some(({ id }) => id === requestedTab)
    ? (requestedTab as Tab)
    : "issuers";
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [evidence, setEvidence] = useState<object | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [publishMessage, setPublishMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loaded = useRef(false);

  const apiUrl = "/v1/legal";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [issuerResponse, applicationRows, documentRows] = await Promise.all([
        api<IssuerListResponse>(apiUrl, "/issuers?limit=100"),
        api<Application[]>(apiUrl, "/applications"),
        api<Document[]>(apiUrl, "/documents"),
      ]);
      setIssuers(issuerResponse.items);
      setApplications(applicationRows);
      setDocuments(documentRows);
      setSelectedDocumentId((current) => current || documentRows[0]?.id || "");
      setAcceptances(await api<Acceptance[]>(apiUrl, "/me/acceptances"));
      setNotifications(await api<Notification[]>(apiUrl, "/notifications"));
      setAuditEvents(await api<AuditEvent[]>(apiUrl, "/audit-events"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar Legal.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!selectedDocumentId) {
      void Promise.resolve().then(() => {
        setDraft(null);
        setDraftText("");
      });
      return;
    }
    void api<Draft>(apiUrl, `/documents/${selectedDocumentId}/draft`)
      .then((row) => {
        setDraft(row);
        setDraftText(row.contentMarkdown);
      })
      .catch(() => {
        setDraft(null);
        setDraftText("");
      });
    void api<Version[]>(apiUrl, `/documents/${selectedDocumentId}/versions`)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [apiUrl, selectedDocumentId]);

  async function submitIssuer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(apiUrl, "/issuers", {
      key: String(data.get("key")),
      name: String(data.get("name")),
      legalName: String(data.get("legalName")),
      type: String(data.get("type")),
      ...(String(data.get("taxId") ?? "").trim()
        ? { taxId: String(data.get("taxId")).trim() }
        : {}),
      countryCode: String(data.get("countryCode")),
      defaultLocale: String(data.get("defaultLocale")),
    });
    event.currentTarget.reset();
    await load();
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate(apiUrl, "/applications", {
      issuerId: String(data.get("issuerId")),
      key: String(data.get("key")),
      name: String(data.get("name")),
    });
    event.currentTarget.reset();
    await load();
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const application = applications.find(
      (row) => row.id === String(data.get("applicationId")),
    );
    if (!application) return;
    await mutate(apiUrl, "/documents", {
      issuerId: application.issuerId,
      applicationId: application.id,
      key: String(data.get("key")),
      locale: String(data.get("locale")),
      title: String(data.get("title")),
    });
    event.currentTarget.reset();
    await load();
  }

  async function saveDraft() {
    if (!selectedDocumentId) return;
    const path = `/documents/${selectedDocumentId}/draft`;
    const body = { contentMarkdown: draftText };
    const saved = draft
      ? await mutate<Draft>(apiUrl, path, body, "PATCH")
      : await mutate<Draft>(apiUrl, path, body);
    setDraft(saved);
    setDraftText(saved.contentMarkdown);
  }

  async function previewPublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDocumentId) return;
    const body = publishBody(new FormData(event.currentTarget));
    const nextPreview = await mutate<Preview>(
      apiUrl,
      `/documents/${selectedDocumentId}/draft/preview-publication`,
      body,
    );
    setPreview(nextPreview);
    setPublishMessage("");
  }

  async function publishDraft(form: HTMLFormElement) {
    if (!selectedDocumentId || !confirm("Publicar version legal?")) return;
    const body = publishBody(new FormData(form));
    const result = await mutate<{ contentHash: string }>(
      apiUrl,
      `/documents/${selectedDocumentId}/draft/publish`,
      body,
    );
    setPublishMessage(`Publicado: ${result.contentHash.slice(0, 12)}`);
    setPreview(null);
    setDraft(null);
    setDraftText("");
    setVersions(
      await api<Version[]>(apiUrl, `/documents/${selectedDocumentId}/versions`),
    );
  }

  async function archive(path: string) {
    await mutate(apiUrl, path, undefined, "DELETE");
    await load();
  }

  async function loadEvidence(id: string) {
    setEvidence(await api<object>(apiUrl, `/acceptances/${id}/evidence`));
  }

  async function retryNotification(id: string) {
    await mutate(apiUrl, `/notifications/${id}/retry`);
    setNotifications(await api<Notification[]>(apiUrl, "/notifications"));
  }

  async function cancelNotification(id: string) {
    if (!confirm("Cancelar notificacion?")) return;
    await mutate(apiUrl, `/notifications/${id}/cancel`);
    setNotifications(await api<Notification[]>(apiUrl, "/notifications"));
  }

  async function downloadAcceptances(format: "csv" | "json") {
    const blob = await legalApiBlob(
      `${apiUrl}/acceptances/export?format=${format}`,
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `legal-acceptances.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-none text-heading">
            Catalogo Legal
          </h1>
          <p className="mt-2 text-sm leading-6 text-supporting">
            Issuers, applications, documents y draft editable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void run(load)} variant="outline" className="h-12 gap-2">
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button onClick={() => void run(legalLogout)} variant="outline" className="h-12 gap-2">
            <XCircle className="size-4" />
            Salir
          </Button>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg bg-muted p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant={tab === id ? "default" : "ghost"}
              onClick={() => router.replace(`/legal?tab=${id}`, { scroll: false })}
              className="h-12 rounded-md gap-2"
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error bg-error-subtle text-sm font-medium text-error">
          {error}
        </div>
      )}

      {tab === "issuers" && (
        <Panel title="Issuers" count={issuers.length}>
          <form
            onSubmit={(event) => void run(() => submitIssuer(event))}
            className="grid gap-3 border-b border-border p-5 md:grid-cols-4"
          >
            <Input
              name="key"
              placeholder="issuer_hemia"
              required
              maxLength={80}
              pattern="issuer_[a-z0-9]+(?:_[a-z0-9]+)*"
              className="h-12"
            />
            <Input
              name="name"
              placeholder="Hemia"
              required
              minLength={2}
              maxLength={160}
              className="h-12"
            />
            <Input
              name="legalName"
              placeholder="Hemia, S.A. de C.V."
              required
              minLength={2}
              maxLength={200}
              className="h-12"
            />
            <Input
              name="type"
              placeholder="hemia"
              required
              pattern="hemia|customer|partner|white_label_brand|internal"
              className="h-12"
            />
            <Input
              name="taxId"
              placeholder="RFC / Tax ID"
              minLength={3}
              maxLength={80}
              className="h-12"
            />
            <Input
              name="countryCode"
              defaultValue="MX"
              required
              minLength={2}
              maxLength={2}
              pattern="[A-Z]{2}"
              className="h-12"
            />
            <Input
              name="defaultLocale"
              defaultValue="es-MX"
              required
              maxLength={12}
              pattern="[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*"
              className="h-12"
            />
            <Button className="h-12 gap-2">
              <Plus className="size-4" />
              Crear
            </Button>
          </form>
          <Rows loading={loading} empty={!issuers.length}>
            {issuers.map((issuer) => (
              <TableRow key={issuer.id}>
                <TableCell className="font-medium">
                  {issuer.key}
                </TableCell>
                <TableCell>{issuer.name}</TableCell>
                <TableCell>{issuer.type}</TableCell>
                <TableCell>
                  <StatusBadge status={issuer.status} />
                </TableCell>
                <TableCell className="text-right">
                  <ArchiveButton
                    disabled={issuer.status === "archived"}
                    onClick={() => void run(() => archive(`/issuers/${issuer.id}`))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </Rows>
        </Panel>
      )}

      {tab === "applications" && (
        <Panel title="Applications" count={applications.length}>
          <form
            onSubmit={(event) => void run(() => submitApplication(event))}
            className="grid gap-3 border-b border-border p-5 md:grid-cols-4"
          >
            <SelectInput
              name="issuerId"
              items={issuers}
              label={(row) => row.name}
            />
            <Input
              name="key"
              placeholder="app_loop_prod"
              required
              className="h-12"
            />
            <Input name="name" placeholder="Loop" required className="h-12" />
            <Button className="h-12 gap-2">
              <Plus className="size-4" />
              Crear
            </Button>
          </form>
          <Rows loading={loading} empty={!applications.length}>
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell className="font-medium">
                  {application.key}
                </TableCell>
                <TableCell>{application.name}</TableCell>
                <TableCell>
                  {nameFor(issuers, application.issuerId)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={application.status} />
                </TableCell>
                <TableCell className="text-right">
                  <ArchiveButton
                    disabled={application.status === "archived"}
                    onClick={() => void run(() => archive(`/applications/${application.id}`))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </Rows>
        </Panel>
      )}

      {tab === "documents" && (
        <Panel title="Documents" count={documents.length}>
          <form
            onSubmit={(event) => void run(() => submitDocument(event))}
            className="grid gap-3 border-b border-border p-5 md:grid-cols-5"
          >
            <SelectInput
              name="applicationId"
              items={applications}
              label={(row) => row.name}
            />
            <Input name="key" placeholder="terms" required className="h-12" />
            <Input
              name="locale"
              placeholder="es-MX"
              required
              className="h-12"
            />
            <Input
              name="title"
              placeholder="Terminos de servicio"
              required
              className="h-12"
            />
            <Button className="h-12 gap-2">
              <Plus className="size-4" />
              Crear
            </Button>
          </form>
          <Rows loading={loading} empty={!documents.length}>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="font-medium">
                  {document.key}
                </TableCell>
                <TableCell>{document.title}</TableCell>
                <TableCell>{document.locale}</TableCell>
                <TableCell>
                  {nameFor(applications, document.applicationId)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={document.status} />
                </TableCell>
                <TableCell className="text-right">
                  <ArchiveButton
                    disabled={document.status === "archived"}
                    onClick={() => void run(() => archive(`/documents/${document.id}`))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </Rows>
        </Panel>
      )}

      {tab === "draft" && (
        <Panel title="Draft" count={draft ? 1 : 0}>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <SelectInput
                name="documentId"
                value={selectedDocumentId}
                onChange={setSelectedDocumentId}
                items={documents.filter((row) => row.status === "active")}
                label={(row) => row.title}
              />
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                className="min-h-80 rounded-md border border-input bg-card p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
                placeholder="# Terminos..."
              />
              <Button
                onClick={() => void run(saveDraft)}
                disabled={!selectedDocumentId || !draftText}
                className="h-12 gap-2"
              >
                <Save className="size-4" />
                Guardar draft
              </Button>
              <form
                onSubmit={(event) => void run(() => previewPublication(event))}
                className="grid gap-3 border-t border-border pt-4"
              >
                <Input
                  name="version"
                  placeholder="1.0.0"
                  required
                  className="h-12"
                />
                <Input
                  name="effectiveFrom"
                  type="datetime-local"
                  required
                  className="h-12"
                />
                <Input
                  name="acceptanceDeadline"
                  type="datetime-local"
                  className="h-12"
                />
                <Input
                  name="gracePeriodDays"
                  type="number"
                  min="0"
                  placeholder="3"
                  className="h-12"
                />
                <SelectInput
                  name="acceptanceMode"
                  items={[
                    { id: "individual", name: "Individual" },
                    {
                      id: "organization_representative",
                      name: "Representante",
                    },
                    { id: "informational", name: "Informativa" },
                  ]}
                  label={(row) => row.name}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input name="role" placeholder="role" className="h-12" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!draft}
                    className="h-12 gap-2"
                    variant="outline"
                  >
                    <Rocket className="size-4" />
                    Vista previa
                  </Button>
                  <Button
                    type="button"
                    disabled={!draft || !preview?.canPublish}
                    onClick={(event) =>
                      void run(() => publishDraft(event.currentTarget.form!))
                    }
                    className="h-12 gap-2"
                  >
                    <Rocket className="size-4" />
                    Publicar
                  </Button>
                </div>
                {preview && (
                  <div className="rounded-md border border-border bg-surface-soft p-3 text-sm">
                    <p className="font-medium">
                      {preview.canPublish
                        ? "Lista para publicar"
                        : "Conflictos"}
                    </p>
                    <p className="text-muted-foreground">
                      {preview.rulesCount} regla, actual:{" "}
                      {preview.currentPublished?.version ?? "ninguna"}
                    </p>
                    {preview.conflicts.map((conflict) => (
                      <p key={conflict} className="text-destructive">
                        {conflict}
                      </p>
                    ))}
                  </div>
                )}
                {publishMessage && (
                  <p className="text-sm font-medium text-emerald-700">
                    {publishMessage}
                  </p>
                )}
              </form>
            </div>
            <pre className="min-h-80 overflow-auto rounded-md border border-border bg-surface-soft p-4 text-sm whitespace-pre-wrap">
              {draftText || "Sin contenido."}
            </pre>
          </div>
          <div className="border-t border-border p-5">
            <h4 className="mb-3 text-sm font-bold">Versiones</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Version
                    </TableHead>
                    <TableHead>
                      Estado
                    </TableHead>
                    <TableHead>
                      Vigencia
                    </TableHead>
                    <TableHead>
                      Hash
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-medium">
                        {version.version}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={version.status} />
                      </TableCell>
                      <TableCell>
                        {version.effectiveFrom ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {version.contentHash?.slice(0, 16) ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!versions.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  Sin versiones publicadas.
                </p>
              )}
            </div>
          </div>
        </Panel>
      )}

      {tab === "acceptances" && (
        <Panel title="Acceptances" count={acceptances.length}>
          <div className="flex flex-wrap gap-2 border-b border-border p-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => void run(() => downloadAcceptances("csv"))}
              className="h-12 gap-2"
            >
              <Download className="size-4" />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void run(() => downloadAcceptances("json"))}
              className="h-12 gap-2"
            >
              <Download className="size-4" />
              JSON
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    Modo
                  </TableHead>
                  <TableHead>
                    Rol
                  </TableHead>
                  <TableHead>
                    Hash
                  </TableHead>
                  <TableHead>
                    Fecha
                  </TableHead>
                  <TableHead className="text-right">
                    Evidencia
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acceptances.map((acceptance) => (
                  <TableRow key={acceptance.id}>
                    <TableCell className="font-medium">
                      {acceptance.acceptanceMode}
                    </TableCell>
                    <TableCell>
                      {acceptance.roleAtAcceptance ?? "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {acceptance.contentHash.slice(0, 16)}
                    </TableCell>
                    <TableCell>
                      {acceptance.acceptedAt}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void run(() => loadEvidence(acceptance.id))}
                        className="h-12"
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!acceptances.length && (
              <p className="p-5 text-sm text-muted-foreground">
                Sin aceptaciones.
              </p>
            )}
          </div>
          {evidence && (
            <pre className="border-t border-border bg-surface-soft p-5 text-xs whitespace-pre-wrap">
              {JSON.stringify(evidence, null, 2)}
            </pre>
          )}
        </Panel>
      )}

      {tab === "notifications" && (
        <Panel title="Notifications" count={notifications.length}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    Canal
                  </TableHead>
                  <TableHead>
                    Estado
                  </TableHead>
                  <TableHead>
                    Destinatario
                  </TableHead>
                  <TableHead>
                    Intentos
                  </TableHead>
                  <TableHead>
                    Error
                  </TableHead>
                  <TableHead className="text-right">
                    Accion
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell className="font-medium">
                      {notification.channel}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={notification.status} />
                    </TableCell>
                    <TableCell className="max-w-80 truncate font-mono text-xs">
                      {notification.recipientLogicalId}
                    </TableCell>
                    <TableCell>
                      {notification.attemptCount}
                    </TableCell>
                    <TableCell>
                      {notification.lastError ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Reintentar"
                          onClick={() => void run(() => retryNotification(notification.id))}
                          className="size-12"
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Cancelar"
                          onClick={() => void run(() => cancelNotification(notification.id))}
                          className="size-12"
                        >
                          <XCircle className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!notifications.length && (
              <p className="p-5 text-sm text-muted-foreground">
                Sin notificaciones.
              </p>
            )}
          </div>
        </Panel>
      )}

      {tab === "audit" && (
        <Panel title="Audit" count={auditEvents.length}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    Accion
                  </TableHead>
                  <TableHead>
                    Entidad
                  </TableHead>
                  <TableHead>
                    Actor
                  </TableHead>
                  <TableHead>
                    Fecha
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      {event.action}
                    </TableCell>
                    <TableCell>
                      {event.entityType}
                    </TableCell>
                    <TableCell>
                      {event.actorSubjectId}
                    </TableCell>
                    <TableCell>
                      {event.createdAt}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!auditEvents.length && (
              <p className="p-5 text-sm text-muted-foreground">
                Sin auditoria.
              </p>
            )}
          </div>
        </Panel>
      )}

      {tab === "public" && (
        <Panel title="Public" count={versions.length}>
          <div className="grid gap-3 p-5 md:grid-cols-3">
            <SelectInput
              name="documentId"
              value={selectedDocumentId}
              onChange={setSelectedDocumentId}
              items={documents}
              label={(row) => row.title}
            />
            <Input
              readOnly
              value={
                selectedDocumentId
                  ? `/legal/public/${documents.find((row) => row.id === selectedDocumentId)?.applicationId}/documents/${documents.find((row) => row.id === selectedDocumentId)?.key}`
                  : ""
              }
              className="h-12 md:col-span-2"
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-surface-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {count} resultados
        </span>
      </div>
      {children}
    </section>
  );
}

function Rows({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading)
    return <p className="p-5 text-sm text-muted-foreground">Cargando...</p>;
  if (empty)
    return <p className="p-5 text-sm text-muted-foreground">Sin registros.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              Clave
            </TableHead>
            <TableHead>
              Nombre
            </TableHead>
            <TableHead>
              Contexto
            </TableHead>
            <TableHead>
              Estado
            </TableHead>
            <TableHead className="text-right">
              Accion
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const variant =
    status === "active" || status === "sent" || status === "published"
      ? "success"
      : status === "pending"
        ? "warning"
        : status === "failed" || status === "cancelled"
          ? "error"
          : "neutral";

  return (
    <Badge variant={variant}>
      {status}
    </Badge>
  );
}

function ArchiveButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Archivar"
      disabled={disabled}
      onClick={onClick}
      className="size-12"
    >
      <Archive className="size-4" />
    </Button>
  );
}

function SelectInput<T extends { id: string }>({
  name,
  items,
  label,
  value,
  onChange,
}: {
  name: string;
  items: T[];
  label: (item: T) => string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      required
      className="h-12 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <option value="">Selecciona...</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {label(item)}
        </option>
      ))}
    </select>
  );
}

function nameFor(rows: { id: string; name: string }[], id: string) {
  return rows.find((row) => row.id === id)?.name ?? id;
}

async function api<T>(apiUrl: string, path: string): Promise<T> {
  return legalApi<T>(`${apiUrl}${path}`);
}

async function mutate<T = unknown>(
  apiUrl: string,
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  return legalApi<T>(`${apiUrl}${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function publishBody(data: FormData) {
  const rule = {
    acceptanceMode: String(data.get("acceptanceMode")),
    role: optional(data.get("role")),
  };
  return {
    version: String(data.get("version")),
    effectiveFrom: toIso(String(data.get("effectiveFrom"))),
    acceptanceDeadline: optionalDate(data.get("acceptanceDeadline")),
    gracePeriodDays: Number(data.get("gracePeriodDays") || 0),
    rules: [rule],
  };
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function optionalDate(value: FormDataEntryValue | null) {
  const text = optional(value);
  return text ? toIso(text) : undefined;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}
