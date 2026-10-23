export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error === "access_unavailable"
    ? "Access no está disponible temporalmente. Intenta ingresar nuevamente cuando se restablezca el servicio."
    : error === "access_denied"
      ? "No se pudo autorizar tu acceso. Solicita al administrador que revise tu acceso a Legal."
      : "No se pudo completar el inicio de sesión. Intenta ingresar nuevamente.";
  const loginUrl = new URL("/auth/login", process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3017");
  loginUrl.searchParams.set("returnTo", "/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="max-w-lg space-y-6 rounded-xl border p-8" aria-labelledby="error-title">
        <p className="text-sm text-muted-foreground">Hemia Legal</p>
        <h1 id="error-title" className="text-2xl font-semibold">No pudimos iniciar tu sesión</h1>
        <p role="alert">{message}</p>
        <a className="inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4" href={loginUrl.toString()}>
          Reintentar inicio de sesión
        </a>
      </section>
    </main>
  );
}
