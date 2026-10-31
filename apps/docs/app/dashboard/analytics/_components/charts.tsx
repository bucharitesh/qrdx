"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { formatDay } from "@/app/dashboard/codes/_components/format";

const barConfig = { count: { label: "Scans", color: "var(--primary)" } };

/** Vertical bars for a fixed set of buckets (hours, weekdays). */
export function CountBarChart({
  data,
  label,
}: {
  data: { label: string; count: number }[];
  /** Accessible summary of the chart */
  label: string;
}) {
  return (
    <ChartContainer
      aria-label={label}
      className="h-[180px] w-full"
      config={barConfig}
      role="img"
    >
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          interval="preserveStartEnd"
          minTickGap={8}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <ChartTooltip content={(props) => <ChartTooltipContent {...props} />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

// Fixed palette (chart tokens) so a code keeps its color across views.
const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

/** Daily scans of up to four codes. */
export function CompareChart({
  dates,
  series,
}: {
  /** One date (YYYY-MM-DD) per count */
  dates: string[];
  series: { id: string; label: string; counts: number[] }[];
}) {
  const config = Object.fromEntries(
    series.map((item, index) => [
      item.id,
      { label: item.label, color: SERIES_COLORS[index % SERIES_COLORS.length] },
    ]),
  );
  const data = dates.map((date, index) => ({
    date,
    ...Object.fromEntries(
      series.map((item) => [item.id, item.counts[index] ?? 0]),
    ),
  }));
  return (
    <ChartContainer className="h-[260px] w-full" config={config}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          minTickGap={24}
          tickFormatter={formatDay}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <ChartTooltip
          content={(props) => <ChartTooltipContent {...props} />}
          labelFormatter={(value) => formatDay(String(value))}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((item) => (
          <Line
            dataKey={item.id}
            dot={false}
            key={item.id}
            stroke={`var(--color-${item.id})`}
            strokeWidth={2}
            type="monotone"
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
