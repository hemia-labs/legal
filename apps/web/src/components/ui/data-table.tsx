"use client";

import { useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { tableFeatures } from "@tanstack/table-core";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const features = tableFeatures({});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof features, TData>;

export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage = "Sin resultados.",
  loading = false,
  loadingMessage = "Cargando…",
  className,
  containerClassName,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  className?: string;
  containerClassName?: string;
}) {
  const table = useTable({ features, columns, data });

  return (
    <div className={cn("overflow-hidden rounded-md border border-border", containerClassName)}>
      <Table className={className}>
        <TableHeader className="bg-card">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn("h-10 px-5 text-xs font-medium normal-case text-muted-foreground", header.column.id === "actions" && "w-16 text-right")}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="bg-card even:bg-card">
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">{loadingMessage}</TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="h-[60px] bg-card even:bg-card hover:bg-muted/30">
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn("px-5 py-3 text-sm text-muted-foreground", cell.column.id === "actions" && "w-16 text-right")}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="bg-card even:bg-card">
              <TableCell colSpan={columns.length} className="h-24 px-5 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
