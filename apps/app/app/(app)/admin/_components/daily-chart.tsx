"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "../_lib/queries";

const formatDay = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function DailyChart({
  data,
  label,
}: {
  data: DailyPoint[];
  label: string;
}) {
  const config = { count: { label, color: "var(--primary)" } };

  return (
    <ChartContainer config={config} className="h-[180px] w-full">
      <BarChart data={data}>
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          axisLine={false}
          tickLine={false}
          minTickGap={16}
          className="text-xs"
        />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          content={(props) => <ChartTooltipContent {...props} />}
          labelFormatter={(value) => formatDay(String(value))}
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
