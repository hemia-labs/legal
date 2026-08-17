import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
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
    <EmptyState
      className="rounded-2xl border border-surface-line bg-card shadow-sm"
      icon={<Icon className="size-7" />}
      title={item.label}
      description={item.empty}
    />
  );
}
