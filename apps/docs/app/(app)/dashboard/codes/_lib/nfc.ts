import "server-only";

import { database as db, landingPage } from "@repo/database";
import { eq } from "drizzle-orm";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { workspaceLink } from "@/lib/workspace-paths";

// The NFC page of a code (/dashboard/<workspace>/codes/<id>/nfc): write its
// NFC link to a tag. vCard Plus codes get the business card version.

/** The template type that makes a hosted page a digital business card. */
export const BUSINESS_CARD_PAGE_TYPE = "vcard";

/** Link to a code's NFC page in workspace `slug` (null: the default workspace). */
export function nfcPageHref(slug: string | null, codeId: string): string {
  return workspaceLink(slug, `/codes/${encodeURIComponent(codeId)}/nfc`);
}

/** Whether the code opens a vCard Plus page (an NFC business card). */
export async function opensBusinessCard(
  code: Pick<QrCodeView, "kind" | "pageId">,
): Promise<boolean> {
  if (code.kind !== "page" || !code.pageId) return false;
  const [row] = await db
    .select({ type: landingPage.type })
    .from(landingPage)
    .where(eq(landingPage.id, code.pageId))
    .limit(1);
  return row?.type === BUSINESS_CARD_PAGE_TYPE;
}
