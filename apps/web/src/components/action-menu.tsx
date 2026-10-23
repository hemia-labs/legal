"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/zuno/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/zuno/dropdown-menu";
import { cn } from "@/lib/utils";

export type ActionMenuOption =
  | { type: "separator"; id?: string }
  | {
      type?: "item";
      label: string;
      icon?: ReactNode;
      href?: string;
      onSelect?: () => void;
      destructive?: boolean;
      disabled?: boolean;
    };

export function ActionMenu({
  options,
  label = "Abrir menú de acciones",
  contentClassName = "min-w-48",
  triggerClassName,
}: {
  options: Array<ActionMenuOption | false | null | undefined>;
  label?: string;
  contentClassName?: string;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-9", triggerClassName)}
            aria-label={label}
            title={label}
          />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {options
          .filter((option): option is ActionMenuOption => Boolean(option))
          .map((option, index) => {
            if (option.type === "separator") {
              return <DropdownMenuSeparator key={option.id ?? `separator-${index}`} />;
            }

            const item = option.href
              ? { render: <Link href={option.href} /> }
              : { onClick: option.onSelect };

            return (
              <DropdownMenuItem
                key={`${option.label}-${index}`}
                className={option.destructive ? "text-zuno-error data-[highlighted]:bg-zuno-error-surface data-[highlighted]:text-zuno-error" : undefined}
                disabled={option.disabled}
                {...item}
              >
                {option.icon}
                {option.label}
              </DropdownMenuItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
