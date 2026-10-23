"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useLegalSession } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/zuno/alert";
import { Button } from "@/components/zuno/button";
import { Input } from "@/components/zuno/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listApplications,
  type Application,
} from "@/services/application.service";
import { listDocuments, type LegalDocument } from "@/services/document.service";
import {
  listSystemOptions,
  saveIntegration,
  type SystemOption,
  type Integration,
} from "@/services/integration.service";
import { integrationSelectionPayload } from "@/lib/integration-selection";

export function IntegrationForm({
  integration,
  onSaved,
  onCancel,
}: {
  integration?: Integration;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const session = useLegalSession();
  const router = useRouter();
  const canManage = session.permissions.includes(
    integration ? "legal.integrations.edit" : "legal.integrations.create",
  );
  const canDisable = session.permissions.includes("legal.integrations.disable");
  const canSelectResources =
    session.permissions.includes("legal.applications.view") &&
    session.permissions.includes("legal.documents.view");
  const [systemId, setSystemId] = useState(integration?.systemId ?? "");
  const [applicationId, setApplicationId] = useState(
    integration?.applicationId ?? "",
  );
  const [documentIds, setDocumentIds] = useState<string[]>(
    integration?.documentIds ?? [],
  );
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const active = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!canManage || !canSelectResources) return;
    let live = true;
    const controller = new AbortController();
    Promise.all([
      listSystemOptions(controller.signal),
      loadApplications(),
      listDocuments(),
    ])
      .then(([systemRows, apps, docs]) => {
        if (live) {
          setSystems(systemRows);
          setApplications(apps.items);
          setDocuments(docs);
          setLoadError("");
        }
      })
      .catch(() => {
        if (live)
          setLoadError(
            "No se pudieron cargar los sistemas, aplicaciones o documentos. Reintenta.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [canManage, canSelectResources, revision]);
  function cancel() {
    if (onCancel) onCancel();
    else router.push("/catalogs/integrations/external-acceptances");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    try {
      setError("");
      const payload = integrationSelectionPayload({
        systemId,
        applicationId,
        documentIds,
        ...(integration ? { enabled } : {}),
      });
      submitting.current = true;
      setSaving(true);
      await saveIntegration(payload, integration?.id);
      if (active.current) {
        if (onSaved) onSaved();
        else router.push("/catalogs/integrations/external-acceptances");
      }
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo guardar la integración.",
        );
    } finally {
      submitting.current = false;
      if (active.current) setSaving(false);
    }
  }
  const systemOptions = [...systems];
  if (integration && !systemOptions.some((s) => s.id === integration.systemId))
    systemOptions.push({
      id: integration.systemId,
      name: integration.name,
      code: integration.code,
    });
  const appOptions = applications
    .filter((a) => a.status === "active")
    .map((a) => ({
      value: a.id,
      label: `${a.name}${a.issuer?.name ? ` · ${a.issuer.name}` : ""}`,
    }));
  if (integration && !appOptions.some((a) => a.value === applicationId))
    appOptions.push({
      value: integration.applicationId,
      label: `Aplicación registrada · ${integration.applicationId}`,
    });
  const selectedApplication = applications.find((a) => a.id === applicationId);
  const available = documents.filter(
    (d) => d.applicationId === applicationId && d.status === "active",
  );
  for (const id of documentIds)
    if (
      !available.some((d) => d.id === id) &&
      !documents.some((d) => d.id === id && d.applicationId !== applicationId)
    )
      available.push({
        id,
        title: `Documento registrado · ${id}`,
        locale: "",
        documentType: "",
      } as LegalDocument);
  const visible = available.filter((d) =>
    `${d.title} ${d.locale} ${d.documentType}`
      .toLocaleLowerCase("es-MX")
      .includes(search.trim().toLocaleLowerCase("es-MX")),
  );
  if (!canManage)
    return (
      <PageHeading
        title="Aceptaciones externas"
        description={`Necesitas ${integration ? "legal.integrations.edit" : "legal.integrations.create"} para administrar esta integración.`}
      />
    );
  if (!canSelectResources)
    return (
      <Alert variant="warning">
        Necesitas consultar aplicaciones y documentos para seleccionar los
        recursos de la integración.
      </Alert>
    );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeading
        title={integration ? "Editar integración" : "Nueva integración"}
        description="Selecciona el sistema, la aplicación y los documentos que aceptarán sus usuarios."
      />
      {loadError && (
        <Alert variant="destructive">
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setLoading(true);
              setLoadError("");
              setRevision((v) => v + 1);
            }}
          >
            Reintentar
          </Button>
        </Alert>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      <form
        onSubmit={(e) => void submit(e)}
        className="rounded-lg border bg-card shadow-sm"
        aria-busy={saving || loading}
      >
        <fieldset
          disabled={saving || loading || Boolean(loadError)}
          className="min-w-0 divide-y divide-border"
        >
          <Section
            title="1. Sistema"
            description="Su configuración y clientes autorizados se administran en Console."
          >
            <Field
              id="systemId"
              label="Sistema"
              help={
                integration
                  ? "El sistema es fijo para conservar la identidad del historial."
                  : "Selecciona el sistema que registrará las aceptaciones."
              }
            >
              <Choice
                id="systemId"
                value={systemId}
                options={systemOptions.map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                onChange={setSystemId}
                disabled={Boolean(integration)}
                placeholder={
                  loading ? "Cargando sistemas…" : "Selecciona un sistema"
                }
              />
            </Field>
            {!loading && !systems.length && !integration && (
              <p role="status" className="text-sm text-muted-foreground">
                No hay sistemas habilitados con aceptaciones legales. Registra
                uno en Console → Catálogos → Sistemas.
              </p>
            )}
          </Section>
          <Section
            title="2. Aplicación legal"
            description="El emisor se obtiene automáticamente de la aplicación."
          >
            <Field id="applicationId" label="Aplicación">
              <Choice
                id="applicationId"
                value={applicationId}
                options={appOptions}
                hasHelp={false}
                onChange={(id) => {
                  setApplicationId(id);
                  setDocumentIds([]);
                  setSearch("");
                }}
                placeholder="Selecciona una aplicación"
              />
            </Field>
            {selectedApplication?.issuer?.name && (
              <p className="text-sm text-muted-foreground">
                Emisor: {selectedApplication.issuer.name}
              </p>
            )}
          </Section>
          <Section
            title="3. Documentos"
            description="Marca los documentos que deberán aceptar los usuarios de este sistema."
          >
            {!applicationId ? (
              <p className="text-sm text-muted-foreground">
                Selecciona una aplicación para consultar sus documentos.
              </p>
            ) : (
              <>
                <Input
                  aria-label="Buscar documentos"
                  placeholder="Buscar por título, tipo o idioma…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-96 divide-y overflow-y-auto rounded-lg border">
                  {visible.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-start gap-3 p-4 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={documentIds.includes(d.id)}
                        disabled={
                          !documentIds.includes(d.id) &&
                          documentIds.length >= 100
                        }
                        onChange={(e) =>
                          setDocumentIds((ids) =>
                            e.target.checked
                              ? [...ids, d.id]
                              : ids.filter((id) => id !== d.id),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">
                          {d.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {d.documentType}
                          {d.locale ? ` · ${d.locale}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!visible.length && (
                    <p className="p-4 text-sm text-muted-foreground">
                      {available.length
                        ? "No hay documentos que coincidan con la búsqueda."
                        : "Esta aplicación no tiene documentos activos."}
                    </p>
                  )}
                </div>
              </>
            )}
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {documentIds.length} documentos seleccionados · máximo 100
            </p>
          </Section>
          {integration && (
            <div className="p-5">
              <label className="flex min-h-10 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={Boolean(integration.enabled && !canDisable)}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Integración habilitada
              </label>
            </div>
          )}
        </fieldset>
        <div className="flex justify-end gap-3 border-t bg-muted/50 p-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={cancel}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              saving ||
              loading ||
              Boolean(loadError) ||
              !systemId ||
              !applicationId ||
              !documentIds.length
            }
          >
            {saving ? "Guardando…" : "Guardar integración"}
          </Button>
        </div>
      </form>
    </div>
  );
}
async function loadApplications() {
  const result = await listApplications({ status: "active" });
  for (let page = 2; page <= result.meta.totalPages; page += 1) {
    const next = await listApplications({ status: "active", page });
    result.items.push(...next.items);
  }
  return result;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 p-5 md:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
function Field({
  id,
  label,
  help,
  error,
  children,
  required = true,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}{" "}
        {required && (
          <>
            <span aria-hidden="true">*</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="mt-1.5 text-xs text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="mt-1 text-xs font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
function Choice({
  id,
  value,
  options,
  onChange,
  disabled,
  error,
  placeholder = "Selecciona una opción",
  required = true,
  hasHelp = true,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  required?: boolean;
  hasHelp?: boolean;
}) {
  return (
    <Select
      value={value || null}
      onValueChange={(next) => onChange(next ?? "")}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className="h-10 w-full rounded-lg bg-background"
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [hasHelp ? `${id}-help` : null, error ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        <SelectValue className="min-w-0 truncate">
          {options.find((item) => item.value === value)?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
