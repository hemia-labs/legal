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
  className,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  emptyMessage?: string;
  className?: string;
}) {
  const table = useTable({ features, columns, data });

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Table className={cn(className)}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="bg-card even:bg-card">
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="bg-card even:bg-card">
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
