type PublicDocument = {
  document: { title: string; locale: string };
  version: { version: string; effectiveFrom: string | null };
  contentHash: string | null;
  artifacts: { html?: { url: string } };
};

export default async function PublicLegalDocumentPage({
  params,
}: {
  params: Promise<{ applicationId: string; documentKey: string }>;
}) {
  const { applicationId, documentKey } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3017";
  const document = await fetch(
    `${apiUrl}/v1/legal/public/${applicationId}/documents/${documentKey}`,
    { cache: "no-store" },
  ).then((response) => {
    if (!response.ok) throw new Error("Published legal document not found");
    return response.json() as Promise<PublicDocument>;
  });
  const htmlUrl = document.artifacts.html?.url;
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
            {document.contentHash}
          </p>
        </div>
        <div
          className="mt-6 max-w-none text-sm leading-7"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </article>
    </main>
  );
}
