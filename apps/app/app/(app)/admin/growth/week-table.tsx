import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { ReactNode } from "react";
import { formatWeek } from "../_lib/format";

export interface WeekColumn {
  /** Unique within the table */
  id: string;
  label: ReactNode;
  /** One cell per week, in the same order as `weeks` */
  cells: readonly ReactNode[];
  /** The footer cell (all weeks); left empty when not given */
  total?: ReactNode;
}

/**
 * Weeks down, numbers across, newest week first. The newest is the current
 * week, still running.
 */
export function WeekTable({
  weeks,
  columns,
  firstLabel = "Week of",
  totalLabel = `${weeks.length} weeks`,
}: {
  weeks: readonly string[];
  columns: readonly WeekColumn[];
  firstLabel?: string;
  totalLabel?: string;
}) {
  const showTotals = columns.some((column) => column.total !== undefined);
  const order = weeks.map((_, i) => i).reverse();
  const current = weeks.length - 1;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{firstLabel}</TableHead>
          {columns.map((column) => (
            <TableHead className="text-right" key={column.id}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.map((i) => (
          <TableRow key={weeks[i]}>
            <TableCell className="whitespace-nowrap">
              {formatWeek(weeks[i])}
              {i === current && (
                <span className="text-muted-foreground"> · so far</span>
              )}
            </TableCell>
            {columns.map((column) => (
              <TableCell className="text-right tabular-nums" key={column.id}>
                {column.cells[i]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {showTotals && (
        <TableFooter>
          <TableRow>
            <TableCell>{totalLabel}</TableCell>
            {columns.map((column) => (
              <TableCell className="text-right tabular-nums" key={column.id}>
                {column.total}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
