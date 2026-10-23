"use client";

import Link from "next/link";
import { useLegalSession } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/zuno/button";
import { Badge } from "@/components/zuno/badge";
import { externalAcceptancesPath, integrationTypes, integrationsRoot } from "@/lib/integration-catalog";

export function IntegrationCatalog({ creating = false }: { creating?: boolean }) {
  const session = useLegalSession();
  const allowed = session.permissions.includes(creating ? "legal.integrations.create" : "legal.integrations.view");
  if (!allowed) return <PageHeading title="Integraciones" description={`Necesitas ${creating ? "legal.integrations.create" : "legal.integrations.view"} para acceder a esta sección.`} />;
  return (
    <div className="space-y-6">
      <PageHeading
        title={creating ? "Nueva integración" : "Integraciones"}
        description={creating ? "Elige el tipo de conexión que necesitas configurar." : "Conecta Legal con aplicaciones, servicios y proveedores externos."}
        actions={creating ? <Button variant="outline" render={<Link href={integrationsRoot} />} nativeButton={false}>Volver</Button> : session.permissions.includes("legal.integrations.create") ? <Button render={<Link href={`${integrationsRoot}/new`} />} nativeButton={false}>Nueva integración</Button> : undefined}
      />
      <section aria-label="Catálogo de integraciones" className="grid gap-4 md:grid-cols-2">
        {integrationTypes.map((item) => (
          <article key={item.key} aria-labelledby={`integration-type-${item.key}`} className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2"><h2 id={`integration-type-${item.key}`} className="text-base font-semibold">{item.title}</h2><Badge variant="outline">{item.availability}</Badge></div>
              <p className="max-w-2xl text-sm text-muted-foreground">{item.description}</p>
            </div>
            {(!creating || item.key === "external-acceptances") && <Button className="mt-auto w-fit" variant="outline" render={<Link href={creating ? `${externalAcceptancesPath}/new` : `${integrationsRoot}/${item.key}`} />} nativeButton={false}>
              {creating ? "Configurar" : item.key === "external-acceptances" ? "Administrar" : item.key === "signatures" ? "Ver alcance" : "Consultar"}
            </Button>}
          </article>
        ))}
      </section>
      {creating && <p className="text-sm text-muted-foreground">El alta está disponible para aceptaciones externas. Eventos y almacenamiento se administran por despliegue; los demás conectores requieren implementación.</p>}
    </div>
  );
}
