"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/zuno/alert";
import { Button } from "@/components/zuno/button";
import { Card } from "@/components/zuno/card";
import { Input } from "@/components/zuno/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/zuno/select";
import { useLegalSession } from "@/components/app-shell";
import { issuerKeyFromName } from "@/lib/issuer-key";
import { legalApi, LegalApiError } from "@/lib/legal-api";

type FieldName =
  | "key"
  | "name"
  | "legalName"
  | "type"
  | "taxId"
  | "countryCode"
  | "defaultLocale";

const issuerTypes = [
  ["hemia", "Propio de Hemia"],
  ["customer", "Cliente"],
  ["partner", "Socio"],
  ["white_label_brand", "Marca blanca"],
  ["internal", "Interno"],
] as const;

export default function IssuerForm() {
  const router = useRouter();
  const session = useLegalSession();
  const keyInput = useRef<HTMLInputElement>(null);
  const keyEdited = useRef(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("issuer_");
  const [type, setType] = useState("");
  const [countryCode, setCountryCode] = useState("MX");
  const [defaultLocale, setDefaultLocale] = useState("es-MX");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<LegalApiError | Error | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  if (forbidden || !hasPermission(session.permissions, "legal.issuers.create")) {
    return (
      <MessagePage
        title="Sin permiso para crear emisores"
        description="Tu rol no incluye el permiso legal.issuers.create."
      />
    );
  }

  function updateName(value: string) {
    setName(value);
    clearFieldError("name");
    if (!keyEdited.current) {
      setKey(issuerKeyFromName(value));
      clearFieldError("key");
    }
  }

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function invalid(field: FieldName, message: string) {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitError(null);

    if (!reportFields(form, ["name", "legalName"])) return;
    if (!type) {
      invalid("type", "Selecciona un tipo de emisor.");
      document.getElementById("issuer-type")?.focus();
      return;
    }
    if (!reportFields(form, ["key", "taxId", "countryCode", "defaultLocale"])) return;

    const data = new FormData(form);
    const taxId = String(data.get("taxId") ?? "").trim();
    setSaving(true);
    try {
      await legalApi("/v1/legal/issuers", {
        method: "POST",
        body: JSON.stringify({
          key: key.trim(),
          name: name.trim(),
          legalName: String(data.get("legalName")).trim(),
          type,
          ...(taxId ? { taxId } : {}),
          countryCode,
          defaultLocale,
        }),
      });
      router.push("/catalogs/issuers");
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("No se pudo crear el emisor.");
      if (error instanceof LegalApiError && error.status === 409) {
        invalid("key", "Esta clave ya está en uso.");
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeading title="Nuevo emisor legal" description="Registra la entidad o marca responsable de publicar documentos legales." />

      <Card className="shadow-sm">
        <form className="p-5 md:p-6" onSubmit={(event) => void submit(event)} noValidate>
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              htmlFor="issuer-name"
              label="Nombre visible"
              required
              description="Nombre corto que verán los operadores."
              error={fieldErrors.name}
            >
              <Input
                id="issuer-name"
                name="name"
                value={name}
                onChange={(event) => updateName(event.target.value)}
                onInvalid={(event) => invalid("name", event.currentTarget.validationMessage)}
                required
                minLength={2}
                maxLength={160}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={`issuer-name-help${fieldErrors.name ? " issuer-name-error" : ""}`}
                placeholder="ACME"
              />
            </Field>

            <Field
              htmlFor="issuer-legal-name"
              label="Razón social"
              required
              description="Nombre legal registrado de la entidad."
              error={fieldErrors.legalName}
            >
              <Input
                id="issuer-legal-name"
                name="legalName"
                onInput={() => clearFieldError("legalName")}
                onInvalid={(event) => invalid("legalName", event.currentTarget.validationMessage)}
                required
                minLength={2}
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.legalName)}
                aria-describedby={`issuer-legal-name-help${fieldErrors.legalName ? " issuer-legal-name-error" : ""}`}
                placeholder="ACME Servicios Digitales, S.A. de C.V."
              />
            </Field>

            <Field
              htmlFor="issuer-type"
              label="Tipo"
              required
              description="Relación del emisor con el ecosistema."
              error={fieldErrors.type}
            >
              <Select
                name="type"
                value={type || null}
                onValueChange={(value) => {
                  setType(value ?? "");
                  clearFieldError("type");
                }}
              >
                <SelectTrigger
                  id="issuer-type"
                  aria-invalid={Boolean(fieldErrors.type)}
                  aria-describedby={`issuer-type-help${fieldErrors.type ? " issuer-type-error" : ""}`}
                  className="w-full rounded-lg bg-background font-normal"
                >
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent align="start">
                  {issuerTypes.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              htmlFor="issuer-key"
              label="Clave interna"
              required
              description="Se sugiere desde el nombre y no podrá cambiarse después."
              error={fieldErrors.key}
            >
              <Input
                ref={keyInput}
                id="issuer-key"
                name="key"
                value={key}
                onChange={(event) => {
                  keyEdited.current = true;
                  setKey(event.target.value.toLowerCase());
                  clearFieldError("key");
                }}
                onInvalid={(event) => invalid("key", event.currentTarget.validationMessage)}
                required
                maxLength={80}
                pattern="issuer_[a-z0-9]+(?:_[a-z0-9]+)*"
                aria-invalid={Boolean(fieldErrors.key)}
                aria-describedby={`issuer-key-help${fieldErrors.key ? " issuer-key-error" : ""}`}
                className="font-mono"
                placeholder="issuer_acme"
                autoComplete="off"
              />
            </Field>

            <Field
              htmlFor="issuer-tax-id"
              label="Identificador fiscal"
              description="Opcional y sin validación específica por país."
              error={fieldErrors.taxId}
            >
              <Input
                id="issuer-tax-id"
                name="taxId"
                onInput={() => clearFieldError("taxId")}
                onInvalid={(event) => invalid("taxId", event.currentTarget.validationMessage)}
                minLength={3}
                maxLength={80}
                aria-invalid={Boolean(fieldErrors.taxId)}
                aria-describedby={`issuer-tax-id-help${fieldErrors.taxId ? " issuer-tax-id-error" : ""}`}
                placeholder="ACM010101ABC"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                htmlFor="issuer-country"
                label="País"
                required
                description="Código ISO de dos letras."
                error={fieldErrors.countryCode}
              >
                <Input
                  id="issuer-country"
                  name="countryCode"
                  value={countryCode}
                  onChange={(event) => {
                    setCountryCode(event.target.value.toUpperCase());
                    clearFieldError("countryCode");
                  }}
                  onInvalid={(event) => invalid("countryCode", event.currentTarget.validationMessage)}
                  required
                  minLength={2}
                  maxLength={2}
                  pattern="[A-Z]{2}"
                  aria-invalid={Boolean(fieldErrors.countryCode)}
                  aria-describedby={`issuer-country-help${fieldErrors.countryCode ? " issuer-country-error" : ""}`}
                  className="uppercase"
                />
              </Field>

              <Field
                htmlFor="issuer-locale"
                label="Idioma"
                required
                description="Locale predeterminado."
                error={fieldErrors.defaultLocale}
              >
                <Input
                  id="issuer-locale"
                  name="defaultLocale"
                  value={defaultLocale}
                  onChange={(event) => {
                    setDefaultLocale(event.target.value);
                    clearFieldError("defaultLocale");
                  }}
                  onInvalid={(event) => invalid("defaultLocale", event.currentTarget.validationMessage)}
                  required
                  maxLength={12}
                  pattern="[a-z]{2}(?:-[A-Z]{2})?"
                  aria-invalid={Boolean(fieldErrors.defaultLocale)}
                  aria-describedby={`issuer-locale-help${fieldErrors.defaultLocale ? " issuer-locale-error" : ""}`}
                />
              </Field>
            </div>
          </div>

          {submitError && (
            <Alert variant="destructive" className="mt-5 font-medium">
              <p>{submitError.message}</p>
              {submitError instanceof LegalApiError && submitError.traceId && (
                <p className="mt-1 font-mono text-xs">Referencia: {submitError.traceId}</p>
              )}
            </Alert>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-5">
            <Button
              render={<Link href="/catalogs/issuers" />}
              nativeButton={false}
              variant="outline"
              className="px-4"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Crear emisor
            </Button>
          </div>
        </form>
      </Card>
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
  children: React.ReactNode;
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
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function MessagePage({ title, description }: { title: string; description: string }) {
  return (
    <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button
          render={<Link href="/catalogs/issuers" />}
          nativeButton={false}
          variant="outline"
          className="mt-6 px-4"
        >
          <ArrowLeft className="size-4" />
          Volver a emisores
        </Button>
      </div>
    </section>
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
