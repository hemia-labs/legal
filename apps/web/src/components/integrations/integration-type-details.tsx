"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLegalSession } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/zuno/button";
import { Badge } from "@/components/zuno/badge";
import { getIntegrationCapabilities, type IntegrationCapabilities } from "@/services/integration.service";
import { LegalApiError } from "@/lib/legal-api";
import { integrationsRoot, type IntegrationType } from "@/lib/integration-catalog";

type DetailType = Exclude<IntegrationType, "external-acceptances">;

export function IntegrationTypeDetails({ type }: { type: DetailType }) {
  const session = useLegalSession();
  return <Details key={`${session.activeOrganizationId}:${session.permissions.join(",")}:${type}`} type={type} />;
}

function Details({ type }: { type: DetailType }) {
  const session = useLegalSession();
  const allowed = session.permissions.includes("legal.integrations.view");
  const [capabilities, setCapabilities] = useState<IntegrationCapabilities>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    getIntegrationCapabilities(controller.signal).then((value) => {
      if (!controller.signal.aborted) setCapabilities(value);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof LegalApiError && cause.status === 403 ? "No tienes permiso para consultar estas conexiones." : "No se pudo consultar el estado de las conexiones. Reintenta.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [allowed, revision]);
  if (!allowed) return <PageHeading title="Integraciones" description="Necesitas legal.integrations.view para consultar estas conexiones." />;
  return (
    <div className="space-y-6">
      <PageHeading
        title={type === "events" ? "Eventos y webhooks" : type === "signatures" ? "Firma electrónica" : "Conexiones externas"}
        description={type === "events" ? "Comunicación de Legal con otros sistemas mediante eventos." : type === "signatures" ? "Envío de contratos y recepción de documentos firmados." : "Servicios de almacenamiento y conexiones con otros productos."}
        actions={<Button variant="outline" render={<Link href={integrationsRoot} />} nativeButton={false}>Volver a integraciones</Button>}
      />
      {loading ? <p role="status" className="text-sm text-muted-foreground">Consultando conexiones…</p> : error ? <div role="alert" className="space-y-3 rounded-lg border border-border bg-card p-5"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(""); setCapabilities(undefined); setLoading(true); setRevision((value) => value + 1); }}>Reintentar</Button></div> : capabilities && (
        <section className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-label="Conexiones por tipo">
          {type === "events" && <>
            <Connection title="Bus de eventos" status={!capabilities.events.enabled ? "Deshabilitado" : capabilities.events.connected ? "Conectado" : "Sin conexión"} description="RabbitMQ comunica cambios de organizaciones y membresías entre Access y Legal." />
            <Connection title="Publicación de eventos" status={capabilities.events.publisherEnabled ? "Habilitada" : "Deshabilitada"} description="La outbox de Legal publica las respuestas a los eventos recibidos. Su configuración se administra por despliegue." />
            <Connection title="Webhooks externos" status="Pendiente de implementación" description="Envío de avisos a URLs de otros sistemas, con firma, seguimiento y reintentos. Todavía no hay suscripciones configurables desde Legal." />
          </>}
          {type === "signatures" && <Connection title="Proveedores de firma electrónica" status="Pendiente de implementación" description="Este tipo tendrá su propia configuración para proveedor, credenciales y recepción de resultados. Actualmente Legal registra aceptaciones; no envía contratos a proveedores de firma." />}
          {type === "connections" && <>
            <Connection title="Almacenamiento documental" status={capabilities.connections.storage.configured ? "Configurado" : "Sin configurar"} description="Almacenamiento compatible con S3 para documentos y evidencias. La configuración se administra por despliegue; este estado no verifica la conexión con el proveedor." />
            <Connection title="Notificaciones externas" status="Pendiente de implementación" description="Proveedores de correo o mensajería para solicitudes, recordatorios y avisos legales." />
            <Connection title="CRM, ERP y sincronización" status="Pendiente de implementación" description="Vinculación e intercambio de documentos y evidencias con clientes, pedidos y otros registros externos." />
          </>}
        </section>
      )}
    </div>
  );
}

function Connection({ title, status, description }: { title: string; status: string; description: string }) {
  return <div className="space-y-2 p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{title}</h2><Badge variant="outline">{status}</Badge></div><p className="max-w-3xl text-sm text-muted-foreground">{description}</p></div>;
}
