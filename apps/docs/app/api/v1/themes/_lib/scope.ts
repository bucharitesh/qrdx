import { qrPreset } from "@repo/database";
import { eq } from "drizzle-orm";

/**
 * The themes a credential reads. A team API key reads its team's shared
 * themes, as the team sees them in the dashboard. OAuth tokens and personal
 * keys read every theme their user saved, as /v1/themes always has.
 */
export function themesWhere(token: {
  userId: string;
  organizationId: string | null;
}) {
  return token.organizationId
    ? eq(qrPreset.organizationId, token.organizationId)
    : eq(qrPreset.userId, token.userId);
}
