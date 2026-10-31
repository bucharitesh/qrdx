import "server-only";

import { database as db, landingPage, qrCode } from "@repo/database";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { cache } from "react";
import {
  getPageSettings,
  type PageSettings,
} from "@/components/landing/page-settings-block";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { type RedirectCode, redirectCodeColumns } from "@/lib/redirect/code";
import { isValidSlug } from "@/lib/short-links";
import type { LandingPageContent } from "@/types/landing";

export interface PublicPage {
  /** The scanned code (lifecycle inputs included) */
  code: RedirectCode;
  page: {
    id: string;
    type: string;
    title: string | null;
    userId: string;
    organizationId: string | null;
  };
  content: LandingPageContent;
  settings: PageSettings;
  plan: Plan;
  branding: {
    /** "Made with QRdx" footer (Free) */
    badge: boolean;
    /** No QRdx branding at all (Business) */
    whiteLabel: boolean;
    customCss: boolean;
  };
}

const columns = {
  ...redirectCodeColumns,
  pageRowId: landingPage.id,
  pageType: landingPage.type,
  pageTitle: landingPage.title,
  pageUserId: landingPage.userId,
  pageOrganizationId: landingPage.organizationId,
  content: landingPage.content,
};

/**
 * A published hosted page: an active code of kind 'page' with its landing
 * page. Looked up by the code's slug (/p/<slug>) or by page id (any active
 * code of the page; used by /api/vcard). On a custom domain only that
 * domain's codes resolve. Plan limits never stop a page from rendering.
 */
export const loadPublicPage = cache(
  async (
    key: { slug: string } | { pageId: string },
    customDomainId: string | null,
  ): Promise<PublicPage | null> => {
    let where: SQL | undefined;
    if ("slug" in key) {
      if (!isValidSlug(key.slug)) return null;
      where = eq(qrCode.slug, key.slug);
    } else {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(key.pageId)) return null;
      where = and(
        eq(qrCode.pageId, key.pageId),
        eq(qrCode.kind, "page"),
        eq(qrCode.isActive, true),
        isNull(qrCode.archivedAt),
        isNull(qrCode.deletedAt),
        customDomainId ? eq(qrCode.domainId, customDomainId) : undefined,
      );
    }

    const [row] = await db
      .select(columns)
      .from(qrCode)
      .innerJoin(landingPage, eq(landingPage.id, qrCode.pageId))
      .where(where)
      .limit(1);
    if (
      !row ||
      row.kind !== "page" ||
      !row.isActive ||
      row.archivedAt ||
      row.deletedAt ||
      (customDomainId && row.domainId !== customDomainId)
    ) {
      return null;
    }

    const parsed = parseLandingPageContent(row.content, { mode: "read" });
    if (!parsed.success) {
      console.error(
        `Invalid landing page content (${row.pageRowId}):`,
        parsed.error.issues[0],
      );
      return null;
    }

    const {
      pageRowId,
      pageType,
      pageTitle,
      pageUserId,
      pageOrganizationId,
      content: _content,
      ...code
    } = row;
    const plan = await getPlanForScope({
      userId: pageUserId,
      organizationId: pageOrganizationId,
    });
    const limits = getPlanLimits(plan);

    return {
      code,
      page: {
        id: pageRowId,
        type: pageType,
        title: pageTitle,
        userId: pageUserId,
        organizationId: pageOrganizationId,
      },
      content: parsed.data,
      settings: getPageSettings(parsed.data),
      plan,
      branding: {
        badge: limits.landingPageBadge,
        whiteLabel: limits.whiteLabel,
        customCss: limits.customCss,
      },
    };
  },
);

type Block = LandingPageContent["blocks"][number];

const firstOf = (
  content: LandingPageContent,
  type: string,
): Block | undefined =>
  content.blocks.find((block) => block.type === type && !block.hidden);

const str = (value: unknown) => (typeof value === "string" ? value : "");
const imageUrl = (value: unknown) =>
  value && typeof value === "object" && "url" in value
    ? str((value as { url: unknown }).url)
    : "";

/** Title, description and share image for metadata, from settings and blocks. */
export function pageSummary(page: PublicPage) {
  const { content, settings } = page;
  const header = firstOf(content, "header")?.props ?? {};
  const contact = firstOf(content, "contact")?.props ?? {};
  const text = firstOf(content, "text")?.props ?? {};

  const contactName = [str(contact.firstName), str(contact.lastName)]
    .filter(Boolean)
    .join(" ");
  const title =
    page.page.title?.trim() ||
    str(header.title) ||
    contactName ||
    str(contact.company) ||
    "Untitled page";
  const rawDescription =
    settings.description ||
    str(header.subtitle) ||
    [str(contact.jobTitle), str(contact.company)].filter(Boolean).join(" · ") ||
    str(text.body);
  const description = rawDescription.replace(/\s+/g, " ").trim().slice(0, 200);
  const image =
    settings.shareImage?.url ||
    imageUrl(header.avatar) ||
    imageUrl(header.cover) ||
    imageUrl(contact.photo) ||
    content.theme.logo?.url ||
    "";
  const icon =
    content.theme.logo?.url ||
    imageUrl(header.avatar) ||
    imageUrl(contact.photo);
  return { title, description, image, icon };
}
