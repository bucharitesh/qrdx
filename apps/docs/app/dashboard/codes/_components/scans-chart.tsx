"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { DailyCount } from "@/lib/scans";
import { formatDay } from "./format";

const config = { count: { label: "Scans", color: "var(--primary)" } };

export function ScansChart({ data }: { data: DailyCount[] }) {
  return (
    <ChartContainer className="h-[220px] w-full" config={config}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="scans-fill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-count)"
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor="var(--color-count)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
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
        <Area
          dataKey="count"
          fill="url(#scans-fill)"
          stroke="var(--color-count)"
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
