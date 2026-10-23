import type { ComponentProps } from "react";
import { Badge } from "@/components/zuno/badge";

type Status = "neutral" | "success" | "warning" | "info" | "error";

export function StatusBadge({
  status = "neutral",
  indicator = true,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant"> & { status?: Status; indicator?: boolean }) {
  return (
    <Badge variant={status} className={className} {...props}>
      {indicator && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </Badge>
  );
}
