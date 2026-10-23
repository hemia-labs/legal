import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

type BadgeProps = ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "error" | "info" | "neutral"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        {
          default: "border-transparent bg-primary text-primary-foreground",
          secondary: "border-transparent bg-secondary text-secondary-foreground",
          outline: "border-border text-foreground",
          success: "border-transparent bg-zuno-success-surface text-zuno-success",
          warning: "border-transparent bg-zuno-warning-surface text-zuno-warning",
          error: "border-transparent bg-zuno-error-surface text-zuno-error",
          info: "border-transparent bg-zuno-info-surface text-zuno-info",
          neutral: "border-transparent bg-muted text-muted-foreground",
          destructive: "border-transparent bg-zuno-destructive-solid text-zuno-destructive-solid-foreground",
        }[variant],
        className
      )}
      {...props}
    />
  )
}
