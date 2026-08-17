import type { PublicDocument } from "@/services/document.service";

export default async function PublicLegalDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string; documentKey: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { applicationId, documentKey } = await params;
  const { locale } = await searchParams;
  if (!locale) return <LocaleRequiredState />;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3017";
  const endpoint = new URL(
    `/v1/legal/public/${applicationId}/documents/${documentKey}`,
    apiUrl,
  );
  endpoint.searchParams.set("locale", locale);
  const document = await fetch(
    endpoint,
    { cache: "no-store" },
  ).then((response) => {
    if (!response.ok) throw new Error("Published legal document not found");
    return response.json() as Promise<PublicDocument>;
  });
  const htmlUrl = document.artifacts.html?.url;
  const pdfUrl = document.artifacts.pdf?.url;
  const contentHtml = htmlUrl
    ? await fetch(htmlUrl, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Published legal document content not found");
        return response.text();
      })
    : "";

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-surface-line bg-card p-7 shadow-sm">
        <div className="border-b border-border pb-4">
          <h1 className="font-display text-4xl font-semibold leading-none">
            {document.document.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Version {document.version.version} - {document.document.locale}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            contentHash: {document.version.contentHash}
          </p>
        </div>
        {htmlUrl ? (
          <div
            className="mt-6 max-w-none text-sm leading-7"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        ) : pdfUrl ? (
          <div className="mt-6 space-y-4">
            <a
              className="inline-flex h-12 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir documento PDF
            </a>
            <iframe className="h-[70vh] w-full rounded-lg border border-border" src={pdfUrl} title={document.document.title} />
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Este documento no tiene un artefacto visual disponible.</p>
        )}
      </article>
    </main>
  );
}

function LocaleRequiredState() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <h1 className="font-display text-3xl font-semibold">Idioma requerido</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Indica el locale del documento en la URL, por ejemplo <code>?locale=es-MX</code>.
        </p>
      </div>
    </main>
  );
}
