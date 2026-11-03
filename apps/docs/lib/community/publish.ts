import "server-only";

import { createHash } from "node:crypto";
import {
  communityItem,
  communityItemTag,
  communityItemVersion,
  database as db,
} from "@repo/database";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import type { QRCustomFrame } from "qrdx/types";
import { COMMUNITY_THEME_TAGS, MAX_TAGS_PER_THEME } from "@/lib/constants";
import type { ThemeStyles } from "@/types/theme";
import { COMMUNITY_LICENSE } from "./licence";
import {
  DESCRIPTION_MAX_LENGTH,
  FRAME_TAGS,
  framePayloadSchema,
  framePreviewStyle,
  NAME_MAX_LENGTH,
  stableStringify,
  themePayloadFromStyle,
} from "./payloads";
import { ensurePublishingProfile } from "./profiles";
import { toPublicStyle } from "./public-style-server";
import { checkScanGate, gateFailureMessage, type ScanGate } from "./scan-gate";
import { COMMUNITY_TAG, guarded } from "./store";
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
    if (item.tags.length > 0) {
      await db.batch([
        insertItemRow,
        insertVersion,
        db
          .insert(communityItemTag)
          .values(item.tags.map((tag) => ({ itemId: id, tag }))),
      ]);
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
 * A saved theme as a theme item: a snapshot (editing the saved theme later
 * never changes it), without uploaded logos or image art.
 */
export async function publishSavedTheme(input: {
  userId: string;
  theme: { id: string; name: string; style: ThemeStyles };
  tags: string[];
}): Promise<{ id: string; slug: string; type: CommunityItemType }> {
  const built = themePayloadFromStyle(input.theme.style);
  if (!built) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "This theme has settings the community can't show. Save it again in the editor.",
    );
  }
  const details = cleanDetails(
    { name: input.theme.name, tags: input.tags },
    COMMUNITY_THEME_TAGS,
  );
  const gate = await gateOrThrow(
    toPublicStyle(built.payload.style, built.payload.logoIcon),
  );
  return insertItem({
    userId: input.userId,
    type: "theme",
    ...details,
    payload: built.payload,
    gate,
    sourceKind: "qr_preset",
    sourceId: input.theme.id,
  });
}

/** A custom frame as a frame item. */
export async function publishFrame(input: {
  userId: string;
  frame: unknown;
  details: ItemDetails;
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
  });
}
