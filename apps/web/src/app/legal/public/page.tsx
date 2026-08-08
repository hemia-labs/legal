export default function LegalLogoutPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div className="rounded-2xl border border-surface-line bg-card p-7 shadow-sm">
        <h1 className="font-display text-3xl font-semibold leading-none">Sesión cerrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu sesión de Hemia Legal se cerró correctamente.
        </p>
      </div>
    </main>
  );
}
