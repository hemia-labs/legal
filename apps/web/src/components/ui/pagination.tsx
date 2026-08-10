import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="Paginación"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-0.5", className)}
      {...props}
    />
  );
}

function PaginationItem({ className, ...props }: ComponentProps<"li">) {
  return <li data-slot="pagination-item" className={cn(className)} {...props} />;
}

function PaginationLink({
  className,
  isActive,
  ...props
}: ComponentProps<"button"> & { isActive?: boolean }) {
  return (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive || undefined}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-transparent px-3 text-sm font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        isActive && "border-border bg-background text-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: ComponentProps<"button">) {
  return (
    <PaginationLink
      aria-label="Ir a la página anterior"
      className={cn("gap-1.5 px-3", className)}
      {...props}
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      <span className="hidden sm:block">Anterior</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: ComponentProps<"button">) {
  return (
    <PaginationLink
      aria-label="Ir a la página siguiente"
      className={cn("gap-1.5 px-3", className)}
      {...props}
    >
      <span className="hidden sm:block">Siguiente</span>
      <ChevronRight className="size-4" aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
