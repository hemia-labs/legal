import { AppWindow, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ApplicationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-heading">Aplicaciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administra los productos y sistemas que consumen documentos legales.
        </p>
      </header>

      <section className="grid min-h-panel-min place-items-center rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="max-w-md">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <AppWindow className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Aún no hay aplicaciones</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Crea una aplicación para definir dónde se publican y solicitan documentos legales.
          </p>
          <Button className="mt-6 h-12 px-4">
            <Plus className="size-4" aria-hidden="true" />
            Crear aplicación
          </Button>
        </div>
      </section>
    </div>
  );
}
