"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  contentClassName = "w-48",
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
            size="icon-sm"
            className={cn("size-8", triggerClassName)}
            aria-label={label}
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
              variant={option.destructive ? "destructive" : "default"}
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
