import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  visual?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon = <Inbox className="size-7" />,
  visual,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("grid min-h-panel-min place-items-center p-8 text-center", className)}>
      <div className="max-w-md">
        {visual ?? (
          <div
            aria-hidden="true"
            className="mx-auto grid size-16 place-items-center rounded-full bg-secondary text-primary"
          >
            {icon}
          </div>
        )}
        <h2 className="mt-5 text-lg font-semibold">{title}</h2>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
      </div>
    </div>
  );
}
