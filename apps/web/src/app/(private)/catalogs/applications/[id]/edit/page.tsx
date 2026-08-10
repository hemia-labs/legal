"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
import { LegalApiError } from "@/lib/legal-api";
import { listIssuerOptions, type IssuerOption } from "@/services/issuer.service";
import {
  listApplications,
  updateApplication,
  type Application,
} from "@/services/application.service";

export default function EditApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useLegalSession();
  const requestedKey = useRef<string | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [issuers, setIssuers] = useState<IssuerOption[]>([]);
  const [issuerId, setIssuerId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [submitError, setSubmitError] = useState<LegalApiError | Error | null>(null);
  const [nameError, setNameError] = useState("");
  const [issuerError, setIssuerError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const canEdit = hasPermission(session.permissions, "legal.applications.edit");
  const canViewIssuers = hasPermission(session.permissions, "legal.issuers.view");
  const loadKey = `${session.activeOrganizationId ?? "none"}:${id}`;

  useEffect(() => {
    if (!canEdit || !canViewIssuers || requestedKey.current === loadKey) return;
    requestedKey.current = loadKey;
    void Promise.all([
      listApplications({ status: "active" }),
      canViewIssuers
        ? listIssuerOptions()
        : Promise.resolve(null),
    ])
      .then(([applications, issuerResponse]) => {
        const match = applications.items.find((item) => item.id === id);
        if (!match) throw new Error("La aplicación no está disponible.");
        setApplication(match);
        setName(match.name);
        setIssuers((issuerResponse ?? []).filter((issuer) => issuer.status === "active"));
        setIssuerId(match.issuerId);
      })
      .catch((cause) => {
        if (cause instanceof LegalApiError && cause.status === 403) {
          setForbidden(true);
        } else {
          setLoadError(cause instanceof Error ? cause : new Error("No se pudo cargar la aplicación."));
        }
      })
      .finally(() => setLoading(false));
  }, [canEdit, canViewIssuers, id, loadKey, session]);

  if (!canEdit || forbidden || !canViewIssuers) {
    return (
      <MessagePage
        title={!canEdit ? "Sin permiso para editar aplicaciones" : "Sin permiso para consultar emisores"}
        description={!canEdit ? "Tu rol no incluye el permiso legal.applications.edit." : "Tu rol no incluye el permiso legal.issuers.view."}
      />
    );
  }

  if (loading) return <ApplicationFormSkeleton />;
  if (loadError || !application) {
    return (
      <MessagePage
        title="No se pudo cargar la aplicación"
        description={loadError?.message ?? "La aplicación no está disponible."}
      />
    );
  }
  const applicationId = application.id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setNameError("");
    setIssuerError("");
    if (!issuerId) {
      setIssuerError("Selecciona un emisor.");
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setNameError("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    setSaving(true);
    try {
      await updateApplication(applicationId, { name: trimmedName, issuerId });
      router.push("/catalogs/applications");
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("No se pudo actualizar la aplicación.");
      if (error instanceof LegalApiError && error.status === 403) {
        setForbidden(true);
      } else if (error instanceof LegalApiError && error.status === 409) {
        setSubmitError(new Error("No se puede cambiar el emisor porque la aplicación ya tiene documentos asociados o la clave ya está en uso."));
      } else {
        setSubmitError(error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-heading">Editar aplicación</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Actualiza el nombre visible y el emisor digital de la aplicación.
        </p>
      </header>

      {submitError && (
        <div role="alert" className="rounded-lg border border-error bg-error-subtle px-4 py-3 text-sm font-medium text-error">
          <p>{submitError.message}</p>
          {submitError instanceof LegalApiError && submitError.traceId && <p className="mt-1 font-mono text-xs">Referencia: {submitError.traceId}</p>}
        </div>
      )}

      <form onSubmit={(event) => void submit(event)} noValidate>
        <Card className="gap-0 rounded-md py-0">
          <CardContent className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
            <Field htmlFor="application-name" label="Nombre visible" required description="Nombre corto que verán los operadores." error={nameError}>
              <Input
                id="application-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={160}
                aria-invalid={Boolean(nameError)}
                aria-describedby="application-name-help application-name-error"
              />
            </Field>
            <Field htmlFor="application-issuer" label="Emisor" required description="Solo puedes cambiarlo si la aplicación no tiene documentos asociados." error={issuerError}>
              <Select
                value={issuerId || null}
                onValueChange={(value) => {
                  setIssuerId(value ?? "");
                  setIssuerError("");
                }}
              >
                <SelectTrigger
                  id="application-issuer"
                  aria-invalid={Boolean(issuerError)}
                  aria-describedby="application-issuer-help application-issuer-error"
                  className="w-full"
                >
                  <SelectValue>
                    {issuers.find((issuer) => issuer.id === issuerId)?.name ?? "Selecciona un emisor"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {issuers.map((issuer) => (
                    <SelectItem key={issuer.id} value={issuer.id}>
                      {issuer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field htmlFor="application-key" label="Clave técnica" description="La clave identifica la aplicación en integraciones.">
              <Input id="application-key" value={application.key} readOnly className="font-mono" />
            </Field>
          </CardContent>
          <CardFooter className="flex flex-col-reverse gap-3 border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
            <Button render={<Link href="/catalogs/applications" />} nativeButton={false} variant="outline" className="px-4" disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" className="px-4" disabled={saving}>
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {saving ? "Guardando…" : "Guardar cambios"}
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
        <Button render={<Link href="/catalogs/applications" />} nativeButton={false} variant="outline" className="mt-6 px-4">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a aplicaciones
        </Button>
      </div>
    </section>
  );
}

function ApplicationFormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando aplicación…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
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
