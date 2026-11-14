"use server";

import { aiUsage, database as db } from "@repo/database";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/shared";
import { ValidationError } from "@/types/errors";

const getDaysSinceEpoch = (daysAgo: number = 0) =>
  Math.floor(Date.now() / (24 * 60 * 60 * 1000)) - daysAgo;

// Schema for timeframe validation
const timeframeSchema = z.union([
  z.literal("1d"),
  z.literal("7d"),
  z.literal("30d"),
]);

// Types
type Timeframe = z.infer<typeof timeframeSchema>;

// Simplified user-facing interface - only shows requests
interface UsageStats {
  requests: number;
  timeframe: Timeframe;
}

interface ChartDataPoint {
  daysSinceEpoch?: number;
  hoursSinceEpoch?: number;
  date: string;
  totalRequests: number;
}

export async function getMyUsageStats(
  timeframe: Timeframe,
): Promise<UsageStats> {
  try {
    const userId = await getCurrentUserId();

    const validation = timeframeSchema.safeParse(timeframe);
    if (!validation.success) {
      throw new ValidationError("Invalid timeframe");
    }

    const days = timeframe === "1d" ? 1 : timeframe === "7d" ? 7 : 30;
    const startDay = getDaysSinceEpoch(days);

    // Get user's events in time range
    const events = await db
      .select()
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.userId, userId),
          gte(aiUsage.daysSinceEpoch, startDay.toString()),
        ),
      );

    return {
      requests: events.length,
      timeframe,
    };
  } catch (error) {
    console.error("Error getting usage stats:", error);
    throw error;
  }
}

export async function getMyUsageChartData(
  timeframe: Timeframe,
): Promise<ChartDataPoint[]> {
  try {
    const userId = await getCurrentUserId();

    const validation = timeframeSchema.safeParse(timeframe);
    if (!validation.success) {
      throw new ValidationError("Invalid timeframe");
    }

    // For 1d, we want hourly granularity
    if (timeframe === "1d") {
      const hours = 24;
      const startTime = Date.now() - hours * 60 * 60 * 1000;

      // Get user's events in the last 24 hours
      const events = await db
        .select()
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.userId, userId),
            gte(aiUsage.createdAt, new Date(startTime)),
          ),
        );

      // Group by hour
      const chartData: ChartDataPoint[] = [];
      for (let i = hours - 1; i >= 0; i--) {
        const hourStart = Date.now() - i * 60 * 60 * 1000;
        const hourEnd = Date.now() - (i - 1) * 60 * 60 * 1000;
        const hourEvents = events.filter(
          (e) =>
            e.createdAt.getTime() >= hourStart &&
            e.createdAt.getTime() < hourEnd,
        );

        const totalRequests = hourEvents.length;

        chartData.push({
          hoursSinceEpoch: Math.floor(hourStart / (60 * 60 * 1000)),
          date: new Date(hourStart).toISOString(),
          totalRequests,
        });
      }

      return chartData;
    }

    // Daily logic for 7d and 30d
    const days = timeframe === "7d" ? 7 : 30;
    const startDay = getDaysSinceEpoch(days);

    // Get user's events in time range
    const events = await db
      .select()
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.userId, userId),
          gte(aiUsage.daysSinceEpoch, startDay.toString()),
        ),
      );

    // Group by day
    const chartData: ChartDataPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const daysSince = getDaysSinceEpoch(i);
      const dayEvents = events.filter(
        (e) => parseInt(e.daysSinceEpoch, 10) === daysSince,
      );

      const totalRequests = dayEvents.length;

      chartData.push({
        daysSinceEpoch: daysSince,
        date: new Date(daysSince * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        totalRequests,
      });
    }

    return chartData;
  } catch (error) {
    console.error("Error getting usage chart data:", error);
    throw error;
  }
}
