import "server-only";

import { database as db, qrCode } from "@repo/database";
import { and, eq, isNull } from "drizzle-orm";
import { snapshotCodeVersion } from "@/lib/code-versions";
import { HttpError } from "@/lib/error-response";
import { assertCan } from "@/lib/permissions-server";
import { cheapestPlanWith, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  type PixelConfig,
  parsePixelConfig,
  pixelConfigSchema,
} from "@/lib/redirect/routing";
import { type ActiveScope, isInScope } from "@/lib/scope";

/**
 * The code's pixel settings with precise location on or off (the switch lives
 * in qr_code.pixels); null when nothing is left set.
 */
export function withPreciseLocation(
  pixels: PixelConfig | null,
  preciseLocation: boolean,
): PixelConfig | null {
  const base: PixelConfig = pixels ?? pixelConfigSchema.parse({});
  const { preciseLocation: _previous, ...rest } = base;
  const next: PixelConfig = preciseLocation
    ? { ...rest, preciseLocation: true }
    : rest;
  const empty =
    !(next.ga4 || next.gtm || next.meta || next.tiktok || next.linkedin) &&
    !next.conversions &&
    !next.preciseLocation;
  return empty ? null : next;
}

/** 402 naming the cheapest plan that asks for precise location (lib/plans.ts). */
export function preciseLocationPlanRequired(): HttpError {
  const plan = cheapestPlanWith((limits) => limits.preciseLocation);
  return new HttpError(
    402,
    "PLAN_REQUIRED",
    `Precise scan location ${plan ? `is a ${PLAN_NAMES[plan]} feature` : "isn't on your plan"}. You can still turn it off.`,
  );
}

/**
 * PATCH /v1/codes/{id} `preciseLocation`: turns asking on or off for a code
 * of the scope. Turning it on needs the plan; off never does. Saves a version
 * first, like every other settings change.
 */
export async function setCodePreciseLocation(
  scope: ActiveScope,
  codeId: string,
  enabled: boolean,
): Promise<void> {
  assertCan(scope, "content.write");
  const [row] = await db
    .select({
      id: qrCode.id,
      organizationId: qrCode.organizationId,
      pixels: qrCode.pixels,
    })
    .from(qrCode)
    .where(and(eq(qrCode.id, codeId), isNull(qrCode.deletedAt)))
    .limit(1);
  if (!(row && isInScope(scope, row))) {
    throw new HttpError(404, "NOT_FOUND", "QR code not found");
  }
  const previous = parsePixelConfig(row.pixels);
  if ((previous?.preciseLocation === true) === enabled) return;
  if (enabled && !getPlanLimits(await getPlanForScope(scope)).preciseLocation) {
    throw preciseLocationPlanRequired();
  }
  await snapshotCodeVersion(codeId, scope.userId);
  await db
    .update(qrCode)
    .set({ pixels: withPreciseLocation(previous, enabled) })
    .where(eq(qrCode.id, row.id));
}
