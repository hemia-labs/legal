import { AppShell } from "@/components/app-shell";
import { OrganizationSelector } from "@/components/organization-selector";
import type { LegalSession } from "@/lib/legal-session";
import { legalServerApi } from "@/lib/legal-server-api";

export default async function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await legalServerApi<LegalSession>("/v1/legal/session");

  if (!session.organizations.length) {
    return <AccessDenied message="Tu usuario no tiene acceso administrativo a Legal en ninguna organización." />;
  }
  if (!session.activeOrganizationId) {
    return <OrganizationSelector session={session} blocking />;
  }

  return <AppShell session={session}>{children}</AppShell>;
}

function AccessDenied({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="rounded-2xl border border-surface-line bg-card p-7 shadow-sm">
        <h1 className="text-lg font-semibold">Acceso no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
