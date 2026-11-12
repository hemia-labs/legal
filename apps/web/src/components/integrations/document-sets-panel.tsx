"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/zuno/button";
import { legalApi, LegalApiError } from "@/lib/legal-api";
import type { LegalDocument } from "@/services/document.service";
import type { Integration } from "@/services/integration.service";

const actions = {
  accept: "Aceptar",
  acknowledge: "Confirmar lectura",
  consent: "Dar consentimiento",
  informational: "Solo lectura",
};
type Rule = {
  documentId: string;
  requiredAction: keyof typeof actions;
  blocking: boolean;
  requireReacceptance: boolean;
  deadline?: string;
};
type Configuration = {
  sourceId: string;
  name: string;
  enabled: boolean;
  verification: "collector_attested" | "verified_session";
  requiresOrganization: boolean;
  requiresMfa: boolean;
  evidenceScope?: "individual" | "organization";
  usage?: "account";
  effectiveFrom: string;
  documents: Rule[];
};
type DocumentSet = {
  key: string;
  revision: string;
  configuration: Configuration;
};
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const localDateTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

export function DocumentSetsPanel({
  integration,
  documents,
  canEdit,
}: {
  integration: Integration;
  documents: LegalDocument[];
  canEdit: boolean;
}) {
  const path = `/v1/legal/applications/${encodeURIComponent(integration.applicationId)}/document-sets`;
  const [sets, setSets] = useState<DocumentSet[] | null>(null);
  const [editing, setEditing] = useState<DocumentSet | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void legalApi<DocumentSet[]>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSets(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("No se pudieron consultar los conjuntos de documentos.");
      });
    return () => controller.abort();
  }, [path, reload]);
  const available = documents.filter(
    (doc) =>
      integration.documentIds.includes(doc.id) && doc.status === "active",
  );
  const integrationSets = sets?.filter(
    (set) => set.configuration.sourceId === integration.id,
  );

  return (
    <section
      aria-labelledby="document-sets-heading"
      className="space-y-4 rounded-lg border border-border bg-card p-5"
    >
      <h2 id="document-sets-heading" className="text-lg font-semibold">
        Conjuntos de documentos
      </h2>
      <p className="text-sm text-muted-foreground">
        Define qué documentos presenta el producto en el registro o en Cuenta y
        legal.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {sets === null && !error && <p role="status">Cargando conjuntos…</p>}
      {integrationSets?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aún no hay conjuntos para esta integración.
        </p>
      )}
      {!!integrationSets?.length && (
        <ul className="divide-y divide-border">
          {integrationSets.map((set) => (
            <li
              key={set.key}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div>
                <p>{set.configuration.name}</p>
                <p className="text-sm text-muted-foreground">
                  {set.key} · {set.configuration.documents.length} documentos ·{" "}
                  {set.configuration.enabled ? "Habilitado" : "Deshabilitado"}
                </p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!!editing}
                  onClick={() => setEditing(set)}
                >
                  Editar {set.configuration.name}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sets && canEdit && !editing && (
        <Button
          type="button"
          onClick={() =>
            setEditing({
              key: "",
              revision: "",
              configuration: {
                sourceId: integration.id,
                name: "",
                enabled: true,
                verification: "collector_attested",
                requiresOrganization: false,
                requiresMfa: false,
                effectiveFrom: new Date().toISOString(),
                evidenceScope: "individual",
                usage: "account",
                documents: [],
              },
            })
          }
        >
          Nuevo conjunto
        </Button>
      )}
      {editing && (
        <DocumentSetForm
          initial={editing}
          path={path}
          available={available}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setSets(null);
            setError("");
            setReload((value) => value + 1);
          }}
        />
      )}
      {error && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError("");
            setReload((value) => value + 1);
          }}
        >
          Reintentar consulta
        </Button>
      )}
    </section>
  );
}

function DocumentSetForm({
  initial,
  path,
  available,
  onClose,
  onSaved,
}: {
  initial: DocumentSet;
  path: string;
  available: LegalDocument[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(initial.key);
  const [config, setConfig] = useState(initial.configuration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const accountOnly =
    config.evidenceScope === "organization" ||
    config.documents.some((rule) => rule.requiredAction === "informational");
  const validDestination =
    key === "registration"
      ? !config.usage && !accountOnly
      : Boolean(config.usage) || !accountOnly;
  const patch = (value: Partial<Configuration>) =>
    setConfig((current) => ({ ...current, ...value }));
  const updateRule = (documentId: string, value: Partial<Rule>) =>
    setConfig((current) => ({
      ...current,
      documents: current.documents.map((rule) =>
        rule.documentId === documentId ? { ...rule, ...value } : rule,
      ),
    }));
  const options = new Map(
    available.map((doc) => [doc.id, `${doc.title} · ${doc.locale}`]),
  );
  for (const rule of config.documents)
    if (!options.has(rule.documentId))
      options.set(rule.documentId, rule.documentId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !config.documents.length || !validDestination) return;
    setError("");
    setSaving(true);
    try {
      await legalApi(`${path}/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({
          ...config,
          name: config.name.trim(),
          expectedRevision: initial.revision || undefined,
        }),
      });
      onSaved();
    } catch (error) {
      setError(
        error instanceof LegalApiError && error.status === 409
          ? "El conjunto ya existe o cambió desde que lo abriste. Cancela y vuelve a consultar."
          : error instanceof LegalApiError && error.status === 400
            ? "Legal rechazó la configuración. Revisa los documentos vinculados y el servicio de verificación para firmas por consultorio."
            : "No se pudo guardar el conjunto. Reintenta.",
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 border-t border-border pt-4">
      <fieldset disabled={saving} className="space-y-4">
        <legend className="font-medium">
          {initial.revision ? "Editar conjunto" : "Nuevo conjunto"}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            Nombre
            <input
              className={field}
              required
              maxLength={200}
              value={config.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          <label className="grid gap-1">
            Clave
            <input
              className={field}
              required
              pattern="[a-z][a-z0-9_\-]{1,79}"
              disabled={!!initial.revision}
              value={key}
              onChange={(event) => {
                const next = event.target.value;
                setKey(next);
                if (next === "registration" && !accountOnly)
                  patch({ usage: undefined });
              }}
            />
          </label>
          <label className="grid gap-1">
            Dónde se presenta
            <select
              className={field}
              value={config.usage ?? "existing"}
              onChange={(event) => {
                const account = event.target.value === "account";
                patch({ usage: account ? "account" : undefined });
              }}
            >
              <option value="existing" disabled={accountOnly}>
                {key === "registration"
                  ? "Registro"
                  : "Flujo específico del producto"}
              </option>
              <option value="account" disabled={key === "registration"}>
                Cuenta y legal
              </option>
            </select>
          </label>
          <label className="grid gap-1">
            Alcance de la confirmación
            <select
              className={field}
              disabled={!!initial.revision || config.usage !== "account"}
              value={config.evidenceScope ?? "individual"}
              onChange={(event) => {
                const organization = event.target.value === "organization";
                patch({
                  evidenceScope: organization ? "organization" : "individual",
                  verification: organization
                    ? "verified_session"
                    : "collector_attested",
                  requiresOrganization: organization,
                });
              }}
            >
              <option value="individual">Individual</option>
              <option value="organization">
                Representante del consultorio
              </option>
            </select>
          </label>
        </div>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          Conjunto habilitado
        </label>
        <label className="grid gap-1 sm:max-w-xs">
          Conjunto vigente desde
          <input
            className={field}
            type="datetime-local"
            required
            value={localDateTime(config.effectiveFrom)}
            onChange={(event) =>
              patch({
                effectiveFrom: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : "",
              })
            }
          />
        </label>
        {config.evidenceScope === "organization" && (
          <p className="text-sm text-muted-foreground">
            El producto debe verificar la sesión y el permiso del representante
            antes de registrar la firma.
          </p>
        )}
        <h3 className="font-medium">Documentos vinculados a la integración</h3>
        {!options.size && (
          <p className="text-sm text-muted-foreground">
            Vincula los documentos desde Editar integración para poder
            seleccionarlos aquí.
          </p>
        )}
        <ul className="space-y-2">
          {[...options].map(([id, label]) => {
            const rule = config.documents.find(
              (item) => item.documentId === id,
            );
            return (
              <li
                key={id}
                className="space-y-2 rounded-md border border-border p-3"
              >
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={!!rule}
                    disabled={!rule && config.documents.length >= 100}
                    onChange={(event) =>
                      patch({
                        documents: event.target.checked
                          ? [
                              ...config.documents,
                              {
                                documentId: id,
                                requiredAction: "accept",
                                blocking: false,
                                requireReacceptance: true,
                              },
                            ]
                          : config.documents.filter(
                              (item) => item.documentId !== id,
                            ),
                      })
                    }
                  />
                  {label}
                </label>
                {rule && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="grid gap-1">
                      Acción
                      <select
                        className={field}
                        value={rule.requiredAction}
                        onChange={(event) => {
                          const requiredAction = event.target
                            .value as Rule["requiredAction"];
                          updateRule(
                            id,
                            requiredAction === "informational"
                              ? {
                                  requiredAction,
                                  blocking: false,
                                  requireReacceptance: false,
                                  deadline: undefined,
                                }
                              : { requiredAction },
                          );
                        }}
                      >
                        {Object.entries(actions)
                          .filter(
                            ([action]) =>
                              action !== "informational" ||
                              config.usage === "account",
                          )
                          .map(([action, text]) => (
                            <option key={action} value={action}>
                              {text}
                            </option>
                          ))}
                      </select>
                    </label>
                    {rule.requiredAction !== "informational" && (
                      <>
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={rule.blocking}
                            onChange={(event) =>
                              updateRule(id, { blocking: event.target.checked })
                            }
                          />
                          Bloqueante
                        </label>
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={rule.requireReacceptance}
                            onChange={(event) =>
                              updateRule(id, {
                                requireReacceptance: event.target.checked,
                              })
                            }
                          />
                          Confirmar nuevas versiones
                        </label>
                        <label className="grid gap-1">
                          Fecha límite de aceptación
                          <input
                            className={field}
                            type="datetime-local"
                            value={localDateTime(rule.deadline)}
                            onChange={(event) =>
                              updateRule(id, {
                                deadline: event.target.value
                                  ? new Date(event.target.value).toISOString()
                                  : undefined,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!validDestination && (
        <p role="status" className="text-sm text-muted-foreground">
          Usa otra clave para un conjunto con documentos de solo lectura o firma
          por consultorio.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            saving ||
            !config.documents.length ||
            !config.name.trim() ||
            !key ||
            !validDestination
          }
        >
          {saving ? "Guardando…" : "Guardar conjunto"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onClose}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
