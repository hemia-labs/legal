import { notFound } from "next/navigation";
import { nav } from "@/lib/nav";

export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const item = nav.find(({ href }) => href === `/${section}`);
  if (!item) notFound();
  const Icon = item.icon;

  return (
    <div className="grid min-h-panel-min place-items-center rounded-2xl border border-surface-line bg-card text-center shadow-sm">
      <div className="max-w-md p-6">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-info-subtle text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{item.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{item.empty}</p>
      </div>
    </div>
  );
}
