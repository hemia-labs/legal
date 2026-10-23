"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/zuno/alert";
import { Button } from "@/components/zuno/button";
import { Card, CardContent, CardFooter } from "@/components/zuno/card";
import { Input } from "@/components/zuno/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/zuno/skeleton";
import { useLegalSession } from "@/components/app-shell";
import { applicationKeyFromName } from "@/lib/application-key";
import { LegalApiError } from "@/lib/legal-api";
import { listIssuerOptions, type IssuerOption } from "@/services/issuer.service";
import { createApplication } from "@/services/application.service";

type FieldName = "issuerId" | "name" | "key";

export default function NewApplicationPage() {
  const router = useRouter();
  const session = useLegalSession();
  const keyInput = useRef<HTMLInputElement>(null);
  const issuerInput = useRef<HTMLButtonElement>(null);
  const keyEdited = useRef(false);
  const [issuers, setIssuers] = useState<IssuerOption[]>([]);
  const [issuerId, setIssuerId] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("app_");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<LegalApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const canCreate = hasPermission(session.permissions, "legal.applications.create");
  const canViewIssuers = hasPermission(session.permissions, "legal.issuers.view");

  useEffect(() => {
    if (!canCreate || !canViewIssuers) return;

    void listIssuerOptions()
      .then(setIssuers)
      .catch((cause) => {
        if (cause instanceof LegalApiError && cause.status === 403) {
          setForbidden(true);
        } else {
          setSubmitError(cause instanceof Error ? cause : new Error("No se pudieron cargar los emisores."));
        }
      })
      .finally(() => setLoading(false));
  }, [canCreate, canViewIssuers, session]);

  if (!canCreate) {
    return (
      <MessagePage
        title="Sin permiso para crear aplicaciones"
        description="Tu rol no incluye el permiso legal.applications.create."
      />
    );
  }

  if (loading) return <ApplicationFormSkeleton />;

  if (forbidden || !canViewIssuers) {
    return (
      <MessagePage
        title="Sin permiso para consultar emisores"
        description="Necesitas el permiso legal.issuers.view para seleccionar el emisor de la aplicación."
      />
    );
  }

  const activeIssuers = issuers.filter((issuer) => issuer.status === "active");

  if (!activeIssuers.length) {
    return (
      <MessagePage
        title="No hay emisores activos"
        description="Crea un emisor activo antes de registrar una aplicación."
        action={{ href: "/catalogs/issuers/new", label: "Crear emisor" }}
      />
    );
  }

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function invalid(field: FieldName, message: string) {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  }

  function updateName(value: string) {
    setName(value);
    clearFieldError("name");
    if (!keyEdited.current) {
      setKey(applicationKeyFromName(value));
      clearFieldError("key");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitError(null);

    if (!issuerId) {
      invalid("issuerId", "Selecciona un emisor.");
      issuerInput.current?.focus();
      return;
    }
    if (!reportFields(form, ["name", "key"])) return;

    setSaving(true);
    try {
      await createApplication({ issuerId, key: key.trim(), name: name.trim() });
      router.push("/catalogs/applications");
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("No se pudo crear la aplicación.");
      if (error instanceof LegalApiError && error.status === 409) {
        invalid("key", "Esta clave ya está en uso para el emisor seleccionado.");
        keyInput.current?.focus();
      } else if (error instanceof LegalApiError && error.status === 403) {
        setForbidden(true);
      } else {
        setSubmitError(error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Nueva aplicación" description="Registra un producto o sistema que consumirá documentos legales." />

      {submitError && (
        <Alert variant="destructive" className="font-medium">
          <p>{submitError.message}</p>
          {submitError instanceof LegalApiError && submitError.traceId && (
            <p className="mt-1 font-mono text-xs">Referencia: {submitError.traceId}</p>
          )}
        </Alert>
      )}

      <form onSubmit={(event) => void submit(event)} noValidate>
        <Card className="gap-0 rounded-md py-0">
          <CardContent className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
            <Field
              htmlFor="application-issuer"
              label="Emisor"
              required
              description="Determina la entidad responsable de la aplicación."
              error={fieldErrors.issuerId}
            >
              <Select
                value={issuerId || null}
                onValueChange={(value) => {
                  setIssuerId(value ?? "");
                  clearFieldError("issuerId");
                }}
              >
                <SelectTrigger
                  ref={issuerInput}
                  id="application-issuer"
                  aria-invalid={Boolean(fieldErrors.issuerId)}
                  aria-describedby="application-issuer-help application-issuer-error"
                  className="w-full"
                >
                  <SelectValue>
                    {activeIssuers.find((issuer) => issuer.id === issuerId)?.name ??
                      "Selecciona un emisor"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {activeIssuers.map((issuer) => (
                    <SelectItem key={issuer.id} value={issuer.id}>
                      {issuer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              htmlFor="application-name"
              label="Nombre visible"
              required
              description="Nombre corto que verán los operadores."
              error={fieldErrors.name}
            >
              <Input
                id="application-name"
                name="name"
                value={name}
                onChange={(event) => updateName(event.target.value)}
                onInvalid={(event) => invalid("name", event.currentTarget.validationMessage)}
                required
                minLength={2}
                maxLength={160}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby="application-name-help application-name-error"
                placeholder="Portal de clientes"
              />
            </Field>

            <Field
              htmlFor="application-key"
              label="Clave técnica"
              required
              description="Identificador estable para integraciones; puedes editar la sugerencia."
              error={fieldErrors.key}
            >
              <Input
                ref={keyInput}
                id="application-key"
                name="key"
                value={key}
                onChange={(event) => {
                  keyEdited.current = true;
                  setKey(event.target.value.toLowerCase());
                  clearFieldError("key");
                }}
                onInvalid={(event) => invalid("key", event.currentTarget.validationMessage)}
                required
                minLength={2}
                maxLength={80}
                pattern="app_[a-z0-9]+(?:_[a-z0-9]+)*"
                aria-invalid={Boolean(fieldErrors.key)}
                aria-describedby="application-key-help application-key-error"
                className="font-mono"
                placeholder="app_portal_clientes"
                autoComplete="off"
              />
            </Field>
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-3 border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
            <Button
              render={<Link href="/catalogs/applications" />}
              nativeButton={false}
              variant="outline"
              className="px-4"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" className="px-4" disabled={saving}>
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {saving ? "Creando…" : "Crear aplicación"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  required = false,
  description,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  description: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label} {required && <span aria-hidden="true">*</span>}
        {required && <span className="sr-only">(obligatorio)</span>}
      </label>
      {children}
      <p id={`${htmlFor}-help`} className="mt-1.5 text-xs text-muted-foreground">
        {description}
      </p>
      {error && <p id={`${htmlFor}-error`} className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function MessagePage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button
          render={<Link href={action?.href ?? "/catalogs/applications"} />}
          nativeButton={false}
          variant="outline"
          className="mt-6 px-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {action?.label ?? "Volver a aplicaciones"}
        </Button>
      </div>
    </section>
  );
}

function ApplicationFormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando formulario…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-2">
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
      </div>
    </div>
  );
}

function hasPermission(granted: string[], required: string) {
  return granted.some(
    (permission) =>
      permission === "*.*" ||
      permission === required ||
      (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))),
  );
}

function reportFields(form: HTMLFormElement, fields: FieldName[]) {
  for (const field of fields) {
    const control = form.elements.namedItem(field);
    if (control instanceof HTMLInputElement && !control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }
  return true;
}
