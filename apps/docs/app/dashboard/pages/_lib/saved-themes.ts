import "server-only";

import { database as db, qrPreset } from "@repo/database";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { SavedThemePalette } from "@/components/landing/editor/theme-controls";
import { paletteFromQrStyle } from "@/components/landing/theme";
import type { ActiveScope } from "@/lib/scope";

/**
 * Saved QR themes of the scope (the user's own plus the active team's) as
 * page palettes, so a page can match its printed QR code.
 */
export async function getSavedThemePalettes(
  scope: ActiveScope,
): Promise<SavedThemePalette[]> {
  const personal = and(
    eq(qrPreset.userId, scope.userId),
    isNull(qrPreset.organizationId),
  );
  const rows = await db
    .select({ id: qrPreset.id, name: qrPreset.name, style: qrPreset.style })
    .from(qrPreset)
    .where(
      scope.organizationId
        ? or(personal, eq(qrPreset.organizationId, scope.organizationId))
        : personal,
    )
    .orderBy(desc(qrPreset.isDefault), desc(qrPreset.updatedAt))
    .limit(24);

  return rows.flatMap((row) => {
    const colors = row.style ? paletteFromQrStyle(row.style) : null;
    return colors ? [{ id: row.id, name: row.name, colors }] : [];
  });
}
