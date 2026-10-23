import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type AlertProps = ComponentProps<"div"> & {
  variant?: "default" | "success" | "warning" | "info" | "destructive";
};

export function Alert({ className, variant = "default", ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        {
          default: "border-border bg-card text-card-foreground",
          success: "border-success/30 bg-success-subtle text-success",
          warning: "border-warning/30 bg-warning-subtle text-warning",
          info: "border-info/30 bg-info-subtle text-info",
          destructive: "border-error/30 bg-error-subtle text-error",
        }[variant],
        className,
      )}
      {...props}
    />
  );
}
