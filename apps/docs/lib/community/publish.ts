import "server-only";

import { createHash } from "node:crypto";
import {
  communityCollectionEntry,
  communityItem,
  communityItemTag,
  communityItemVersion,
  database as db,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import type { QRCustomFrame } from "qrdx/types";
import { COMMUNITY_THEME_TAGS, MAX_TAGS_PER_THEME } from "@/lib/constants";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import type { LandingPageContent } from "@/types/landing";
import type { ThemeStyles } from "@/types/theme";
import { COMMUNITY_LICENSE } from "./licence";
import {
  PAGE_TEMPLATE_MAX_LENGTH,
  type ScrubReport,
  scrubPageContent,
} from "./page-template";
import {
  DESCRIPTION_MAX_LENGTH,
  FRAME_TAGS,
  framePayloadSchema,
  framePreviewStyle,
  NAME_MAX_LENGTH,
  PAGE_TEMPLATE_TAGS,
  stableStringify,
  themePayloadFromStyle,
} from "./payloads";
import { ensurePublishingProfile } from "./profiles";
import { toPublicStyle } from "./public-style-server";
import { checkScanGate, gateFailureMessage, type ScanGate } from "./scan-gate";
import { COMMUNITY_TAG, guarded, guardedRead } from "./store";
import { cleanText, slugify, textProblem } from "./text";
import type { CommunityItemType } from "./types";

// Publishing into community_item: every check runs here on the server
// (schema and limits, text, the scan gate, duplicates), then the item, its
// first immutable version and its tags are written in one batch.

/** A publish refused for a reason the creator can fix. */
export class PublishError extends Error {
  constructor(
    readonly code:
      | "VALIDATION_ERROR"
      | "SCAN_GATE"
      | "ALREADY_PUBLISHED"
      | "LICENSE_REQUIRED",
    message: string,
    readonly slug?: string,
    /** With `slug`: the type of the item that's already there */
    readonly type?: CommunityItemType,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export const payloadHash = (payload: unknown) =>
  createHash("sha256").update(stableStringify(payload)).digest("hex");

/** "wifi-table-card-x7k2": the name plus 4 characters from the id. */
export function itemSlug(name: string, id: string, fallback: string): string {
  const base = slugify(name) || fallback;
  const suffix = createHash("sha256")
    .update(id)
    .digest("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 4);
  return `${base}-${suffix}`;
}

export interface ItemDetails {
  name: string;
  description?: string | null;
  tags?: string[];
}

/** Name, description and tags, cleaned and checked. */
export function cleanDetails(
  details: ItemDetails,
  vocabulary: readonly string[],
): { name: string; description: string | null; tags: string[] } {
  const name = cleanText(details.name, NAME_MAX_LENGTH);
  if (!name) throw new PublishError("VALIDATION_ERROR", "Give it a name.");
  const description =
    cleanText(details.description ?? "", DESCRIPTION_MAX_LENGTH) || null;
  for (const text of [name, description ?? ""]) {
    const problem = textProblem(text);
    if (problem) throw new PublishError("VALIDATION_ERROR", problem);
  }
  const tags = [
    ...new Set((details.tags ?? []).filter((tag) => vocabulary.includes(tag))),
  ].slice(0, MAX_TAGS_PER_THEME);
  return { name, description, tags };
}

interface NewItem {
  userId: string;
  type: CommunityItemType;
  name: string;
  description: string | null;
  tags: string[];
  payload: Record<string, unknown>;
  gate: ScanGate | null;
  sourceKind?: string;
  sourceId?: string;
  facets?: Record<string, unknown>;
  /** Collections and kits: the items they point at, in order */
  entries?: string[];
}

/** Writes a checked item, version 1 and its tags (one batch). */
export async function insertItem(
  item: NewItem,
): Promise<{ id: string; slug: string; type: CommunityItemType }> {
  return guarded(async () => {
    const hash = payloadHash(item.payload);
    const [duplicate] = await db
      .select({ slug: communityItem.slug })
      .from(communityItem)
      .where(
        and(
          eq(communityItem.type, item.type),
          eq(communityItem.payloadHash, hash),
          eq(communityItem.status, "published"),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new PublishError(
        "ALREADY_PUBLISHED",
        "This design is already in the community.",
        duplicate.slug,
        item.type,
      );
    }

    const profile = await ensurePublishingProfile(item.userId);
    const id = cuid();
    const slug = itemSlug(item.name, id, item.type);
    const now = new Date();
    const insertItemRow = db.insert(communityItem).values({
      id,
      type: item.type,
      slug,
      profileId: profile.id,
      createdBy: item.userId,
      name: item.name,
      description: item.description,
      status: "published",
      license: COMMUNITY_LICENSE,
      currentVersion: 1,
      payload: item.payload,
      payloadHash: hash,
      facets: item.facets ?? null,
      scanScore: item.gate?.minScore ?? null,
      scanCheckedAt: item.gate ? now : null,
      isOfficial: profile.official,
      sourceKind: item.sourceKind ?? null,
      sourceId: item.sourceId ?? null,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const insertVersion = db.insert(communityItemVersion).values({
      id: cuid(),
      itemId: id,
      version: 1,
      payload: item.payload,
      payloadHash: hash,
      createdBy: item.userId,
      createdAt: now,
    });
    const insertTags =
      item.tags.length > 0
        ? db
            .insert(communityItemTag)
            .values(item.tags.map((tag) => ({ itemId: id, tag })))
        : null;
    const insertEntries =
      item.entries && item.entries.length > 0
        ? db.insert(communityCollectionEntry).values(
            item.entries.map((itemId, position) => ({
              collectionId: id,
              itemId,
              position,
            })),
          )
        : null;
    if (insertTags && insertEntries) {
      await db.batch([insertItemRow, insertVersion, insertTags, insertEntries]);
    } else if (insertTags) {
      await db.batch([insertItemRow, insertVersion, insertTags]);
    } else if (insertEntries) {
      await db.batch([insertItemRow, insertVersion, insertEntries]);
    } else {
      await db.batch([insertItemRow, insertVersion]);
    }
    revalidateTag(COMMUNITY_TAG, "max");
    if (item.type === "theme") {
      revalidateTag("community-themes", "max");
      revalidateTag("community-tag-counts", "max");
    }
    return { id, slug, type: item.type };
  });
}

async function gateOrThrow(style: ThemeStyles): Promise<ScanGate> {
  const gate = await checkScanGate(style);
  if (!gate.passed) {
    throw new PublishError("SCAN_GATE", gateFailureMessage(gate));
  }
  return gate;
}

/**
 * A design as a theme item: a snapshot without uploaded logos, image art or
 * image fills (./public-style.ts), checked like every publish (text, the
 * Great scan gate on the design as everyone will see it, duplicates).
 * Saved themes and the AI chat's designs both come through here.
 */
export async function publishStyle(input: {
  userId: string;
  style: ThemeStyles;
  details: ItemDetails;
  /** Where it was published from, e.g. a saved theme or a chat draft */
  source?: { kind: string; id: string };
}): Promise<{ id: string; slug: string; type: CommunityItemType }> {
  const built = themePayloadFromStyle(input.style);
  if (!built) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "This theme has settings the community can't show. Save it again in the editor.",
    );
  }
  const details = cleanDetails(input.details, COMMUNITY_THEME_TAGS);
  const gate = await gateOrThrow(
    toPublicStyle(built.payload.style, built.payload.logoIcon),
  );
  return insertItem({
    userId: input.userId,
    type: "theme",
    ...details,
    payload: built.payload,
    gate,
    ...(input.source
      ? { sourceKind: input.source.kind, sourceId: input.source.id }
      : {}),
  });
}

/**
 * A saved theme as a theme item: a snapshot (editing the saved theme later
 * never changes it), without uploaded logos or image art.
 */
export async function publishSavedTheme(input: {
  userId: string;
  theme: { id: string; name: string; style: ThemeStyles };
  tags: string[];
}): Promise<{ id: string; slug: string; type: CommunityItemType }> {
  return publishStyle({
    userId: input.userId,
    style: input.theme.style,
    details: { name: input.theme.name, tags: input.tags },
    source: { kind: "qr_preset", id: input.theme.id },
  });
}

/** A custom frame as a frame item. */
export async function publishFrame(input: {
  userId: string;
  frame: unknown;
  details: ItemDetails;
  /** Where it came from, e.g. the saved theme it was read from */
  source?: { kind: string; id: string };
}): Promise<{ id: string; slug: string; type: CommunityItemType }> {
  const parsed = framePayloadSchema.safeParse({ frame: input.frame });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new PublishError(
      "VALIDATION_ERROR",
      `This frame can't be published: ${first ? `${first.path.join(".")}: ${first.message}` : "it isn't a valid frame spec"}.`,
    );
  }
  const frame: QRCustomFrame = {
    ...parsed.data.frame,
    ...(parsed.data.frame.text !== undefined
      ? { text: cleanText(parsed.data.frame.text, 24) }
      : {}),
    ...(parsed.data.frame.secondaryText !== undefined
      ? { secondaryText: cleanText(parsed.data.frame.secondaryText, 24) }
      : {}),
  };
  const labels = [
    frame.text ?? "",
    frame.secondaryText ?? "",
    ...frame.spec.labels.map((label) => label.text),
  ];
  for (const label of labels) {
    const problem = textProblem(label);
    if (problem) throw new PublishError("VALIDATION_ERROR", problem);
  }
  const details = cleanDetails(input.details, FRAME_TAGS);
  const gate = await gateOrThrow(framePreviewStyle(frame));
  return insertItem({
    userId: input.userId,
    type: "frame",
    ...details,
    payload: { frame },
    gate,
    ...(input.source
      ? { sourceKind: input.source.kind, sourceId: input.source.id }
      : {}),
  });
}

/**
 * A hosted page as a page template: scrubbed of personal data (links,
 * contact details, addresses, Wi-Fi, uploaded photos and files; see
 * ./page-template.ts), validated like a page save, size-capped, then the
 * usual text and duplicate checks. There's no scan check: a template holds
 * no code (its code is checked when someone makes one).
 */
export async function publishPageTemplate(input: {
  userId: string;
  page: { id: string; type: string; content: LandingPageContent };
  details: ItemDetails;
}): Promise<{
  id: string;
  slug: string;
  type: CommunityItemType;
  report: ScrubReport;
}> {
  const { content, report } = scrubPageContent(input.page.content);
  const visible = content.blocks.length;
  if (visible === 0) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "Nothing is left to share once your own details are taken out. Add some blocks people can reuse.",
    );
  }
  const checked = parseLandingPageContent(content, { mode: "write" });
  if (!checked.success) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "This page can't be shared as a template. Publish it again in the page editor first.",
    );
  }
  const payload = { page: { type: input.page.type, content: checked.data } };
  if (JSON.stringify(payload).length > PAGE_TEMPLATE_MAX_LENGTH) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "This page is too large to share as a template. Remove some blocks or shorten long text.",
    );
  }
  const details = cleanDetails(input.details, PAGE_TEMPLATE_TAGS);
  const item = await insertItem({
    userId: input.userId,
    type: "page-template",
    ...details,
    payload,
    gate: null,
    sourceKind: "landing_page",
    sourceId: input.page.id,
    facets: { pageType: input.page.type },
  });
  return { ...item, report };
}

/**
 * The creator takes their item out of the community. The row stays
 * (status "removed"); copies people made are theirs (CC0).
 */
export async function unpublishItem(
  userId: string,
  itemId: string,
): Promise<boolean> {
  return guarded(async () => {
    const removed = await db
      .update(communityItem)
      .set({
        status: "removed",
        removedAt: new Date(),
        removedReason: "creator",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityItem.id, itemId),
          eq(communityItem.createdBy, userId),
          ne(communityItem.status, "removed"),
        ),
      )
      .returning({ id: communityItem.id, type: communityItem.type });
    if (removed.length === 0) return false;
    revalidateTag(COMMUNITY_TAG, "max");
    if (removed[0]?.type === "theme") revalidateTag("community-themes", "max");
    return true;
  });
}

/**
 * The published item `userId` made from `source` (e.g. a chat draft), or
 * null: how the chat learns whether the person really published its draft.
 */
export async function findPublishedFrom(
  userId: string,
  source: { kind: string; id: string },
): Promise<{ type: CommunityItemType; slug: string } | null> {
  return guardedRead(async () => {
    const [row] = await db
      .select({ type: communityItem.type, slug: communityItem.slug })
      .from(communityItem)
      .where(
        and(
          eq(communityItem.createdBy, userId),
          eq(communityItem.sourceKind, source.kind),
          eq(communityItem.sourceId, source.id),
          eq(communityItem.status, "published"),
        ),
      )
      .limit(1);
    return row ? { type: row.type as CommunityItemType, slug: row.slug } : null;
  }, null);
}
