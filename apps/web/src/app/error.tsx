"use client";

import { AlertCircle } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/zuno/alert";
import { Button } from "@/components/zuno/button";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 p-6">
      <PageHeading title="Error al cargar" description="No pudimos mostrar esta sección de Legal." />
      <Alert variant="destructive" className="flex items-start gap-3 p-5">
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">No fue posible cargar la información.</p>
          <p className="mt-1">Intenta nuevamente. Si el problema continúa, contacta al equipo de soporte.</p>
          <Button className="mt-4" variant="outline" onClick={retry}>Reintentar</Button>
        </div>
      </Alert>
    </main>
  );
}
