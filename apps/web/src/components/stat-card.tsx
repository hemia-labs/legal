import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  tone = "blue",
  icon,
}: {
  label: string;
  value: string;
  tone?: "blue" | "violet";
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-surface-line bg-card p-7 shadow-sm">
      <div
        className={cn(
          "grid size-12 place-items-center rounded-full",
          tone === "violet" ? "bg-violet-50 text-violet-600" : "bg-info-subtle text-primary"
        )}
      >
        {icon}
      </div>
      <p className="mt-4 truncate text-sm font-bold text-heading">{label}</p>
      <p className="mt-2 font-display text-6xl font-semibold leading-none text-heading">{value}</p>
    </div>
  );
}
