"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLegalSession } from "@/components/app-shell";
import { legalApi, LegalApiError } from "@/lib/legal-api";

type Issuer = {
  id: string;
  key: string;
  name: string;
  legalName: string;
  type: string;
  taxId: string | null;
  countryCode: string;
  defaultLocale: string;
};

type FieldName = "name" | "legalName" | "type" | "taxId" | "countryCode" | "defaultLocale";

const issuerTypes = [
  ["hemia", "Propio de Hemia"],
  ["customer", "Cliente"],
  ["partner", "Socio"],
  ["white_label_brand", "Marca blanca"],
  ["internal", "Interno"],
] as const;

export default function EditIssuerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useLegalSession();
  const [issuer, setIssuer] = useState<Issuer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [type, setType] = useState("");
  const [taxId, setTaxId] = useState("");
  const [countryCode, setCountryCode] = useState("MX");
  const [defaultLocale, setDefaultLocale] = useState("es-MX");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<LegalApiError | Error | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const requestedKey = useRef<string | null>(null);

  const canEdit = hasPermission(session.permissions, "legal.issuers.edit");
  const loadKey = `${session.activeOrganizationId ?? "none"}:${id}`;

  useEffect(() => {
    if (!canEdit) return;
    if (requestedKey.current === loadKey) return;
    requestedKey.current = loadKey;
    void legalApi<Issuer>(`/v1/legal/issuers/${id}`)
      .then((match) => {
        setIssuer(match);
        setName(match.name);
        setLegalName(match.legalName);
        setType(match.type);
        setTaxId(match.taxId ?? "");
        setCountryCode(match.countryCode);
        setDefaultLocale(match.defaultLocale);
      })
      .catch((cause) => {
        setLoadError(cause instanceof Error ? cause : new Error("No se pudo cargar el emisor."));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canEdit, id, loadKey]);

  if (!canEdit || forbidden) {
    return (
      <MessagePage
        title="Sin permiso para editar emisores"
        description="Tu rol no incluye el permiso legal.issuers.edit."
      />
    );
  }

  if (loading) return <EditIssuerSkeleton />;
  if (loadError || !issuer) {
    return (
      <MessagePage
        title="No se pudo cargar el emisor"
        description={loadError?.message ?? "El emisor no está disponible."}
      />
    );
  }
  const issuerId = issuer.id;

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
    if (!reportFields(form, ["name", "legalName", "taxId", "countryCode", "defaultLocale"])) return;
    if (!type) {
      invalid("type", "Selecciona un tipo de emisor.");
      document.getElementById("issuer-type")?.focus();
      return;
    }

    setSaving(true);
    try {
      await legalApi<Issuer>(`/v1/legal/issuers/${issuerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          legalName: legalName.trim(),
          type,
          taxId: taxId.trim() || null,
          countryCode,
          defaultLocale,
        }),
      });
      router.push("/catalogs/issuers");
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("No se pudo actualizar el emisor.");
      if (error instanceof LegalApiError && error.status === 403) setForbidden(true);
      else setSubmitError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-eyebrow">Catálogo de emisores</p>
          <h1 className="mt-1 text-2xl font-bold text-heading">Editar emisor legal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actualiza los datos que identifican a esta entidad responsable.
          </p>
        </div>
        <Button render={<Link href="/catalogs/issuers" />} nativeButton={false} variant="outline" className="px-4">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a emisores
        </Button>
      </header>

      {submitError && (
        <div role="alert" className="rounded-lg border border-error bg-error-subtle px-4 py-3 text-sm font-medium text-error">
          {submitError.message}
        </div>
      )}

      <form onSubmit={(event) => void submit(event)} noValidate className="rounded-lg border border-border bg-card shadow-sm">
        <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
          <Field htmlFor="issuer-name" label="Nombre visible" required description="Nombre corto que verán los operadores." error={fieldErrors.name}>
            <Input
              ref={nameInput}
              id="issuer-name"
              name="name"
              value={name}
              onChange={(event) => { setName(event.target.value); clearFieldError("name"); }}
              onInvalid={(event) => invalid("name", event.currentTarget.validationMessage)}
              required minLength={2} maxLength={160}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby="issuer-name-help issuer-name-error"
            />
          </Field>
          <Field htmlFor="issuer-legal-name" label="Razón social" required description="Nombre legal registrado de la entidad." error={fieldErrors.legalName}>
            <Input
              id="issuer-legal-name"
              name="legalName"
              value={legalName}
              onChange={(event) => { setLegalName(event.target.value); clearFieldError("legalName"); }}
              onInvalid={(event) => invalid("legalName", event.currentTarget.validationMessage)}
              required minLength={2} maxLength={200}
              aria-invalid={Boolean(fieldErrors.legalName)}
              aria-describedby="issuer-legal-name-help issuer-legal-name-error"
            />
          </Field>
          <Field htmlFor="issuer-type" label="Tipo" required description="Relación del emisor con el ecosistema." error={fieldErrors.type}>
            <Select name="type" value={type || null} onValueChange={(value) => { setType(value ?? ""); clearFieldError("type"); }}>
              <SelectTrigger id="issuer-type" aria-invalid={Boolean(fieldErrors.type)} aria-describedby="issuer-type-help issuer-type-error" className="w-full">
                <SelectValue>{issuerTypes.find(([value]) => value === type)?.[1] ?? "Selecciona un tipo"}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {issuerTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field htmlFor="issuer-key" label="Clave interna" description="Identificador permanente del emisor.">
            <Input id="issuer-key" value={issuer.key} readOnly aria-readonly="true" className="bg-muted font-mono text-muted-foreground" />
          </Field>
          <Field htmlFor="issuer-tax-id" label="Identificador fiscal" description="Opcional y sin validación específica por país." error={fieldErrors.taxId}>
            <Input id="issuer-tax-id" name="taxId" value={taxId} onChange={(event) => { setTaxId(event.target.value); clearFieldError("taxId"); }} maxLength={80} aria-invalid={Boolean(fieldErrors.taxId)} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field htmlFor="issuer-country" label="País" required description="Código ISO de dos letras." error={fieldErrors.countryCode}>
              <Input id="issuer-country" name="countryCode" value={countryCode} onChange={(event) => { setCountryCode(event.target.value.toUpperCase()); clearFieldError("countryCode"); }} required minLength={2} maxLength={2} pattern="[A-Z]{2}" className="uppercase" aria-invalid={Boolean(fieldErrors.countryCode)} />
            </Field>
            <Field htmlFor="issuer-locale" label="Idioma" required description="Locale predeterminado." error={fieldErrors.defaultLocale}>
              <Input id="issuer-locale" name="defaultLocale" value={defaultLocale} onChange={(event) => { setDefaultLocale(event.target.value); clearFieldError("defaultLocale"); }} required maxLength={12} pattern="[a-z]{2}(?:-[A-Z]{2})?" aria-invalid={Boolean(fieldErrors.defaultLocale)} />
            </Field>
          </div>
        </div>
        <footer className="flex flex-col-reverse gap-3 border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button render={<Link href="/catalogs/issuers" />} nativeButton={false} variant="outline" className="px-4" disabled={saving}>Cancelar</Button>
          <Button type="submit" className="px-4" disabled={saving}>
            {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function Field({ htmlFor, label, required = false, description, error, children }: { htmlFor: string; label: string; required?: boolean; description: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label} {required && <span aria-hidden="true">*</span>}
        {required && <span className="sr-only">(obligatorio)</span>}
      </label>
      {children}
      <p id={`${htmlFor}-help`} className="mt-1.5 text-xs text-muted-foreground">{description}</p>
      {error && <p id={`${htmlFor}-error`} className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function MessagePage({ title, description }: { title: string; description: string }) {
  return (
    <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button render={<Link href="/catalogs/issuers" />} nativeButton={false} variant="outline" className="mt-6 px-4">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a emisores
        </Button>
      </div>
    </section>
  );
}

function EditIssuerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando emisor…</span>
      <div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-5 w-96 max-w-full" /></div>
      <div className="grid gap-5 rounded-lg border border-border bg-card p-6 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}
      </div>
    </div>
  );
}

function hasPermission(granted: string[], required: string) {
  return granted.some((permission) => permission === "*.*" || permission === required || (permission.endsWith(".*") && required.startsWith(permission.slice(0, -1))));
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
