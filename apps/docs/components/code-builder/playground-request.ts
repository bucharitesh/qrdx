// What the playground asks the code builder for: "Make it dynamic…" (More
// menu, open=dynamic), "Link options…" (the Static/Dynamic toggle) and the
// hosted page gallery. Pure, with no store or server imports, so
// lib/playground-apply.ts and the tests can use it as is.

import { FILE_PAGE_TYPES } from "@/lib/landing/file-page-types";
import type { ContentType } from "@/types/qr-content";
import type { QRStyle } from "@/types/theme";
import type { CodeBuilderRequest } from "./store";

/** The playground's dynamic link binding, as the builder needs it. */
export interface LinkedCodeRef {
  id: string;
  /** The account that linked it */
  userId: string;
}

/** Why a content type can't become a dynamic code, by type. */
const STORED_IN_CODE: Partial<Record<ContentType, string>> = {
  wifi: "Wi-Fi details are stored in the code itself.",
  vcard: "Contact details are stored in the code itself.",
  phone: "The phone number is stored in the code itself.",
  email: "The email is stored in the code itself.",
  sms: "The text message is stored in the code itself.",
  text: "The text is stored in the code itself.",
  upi: "Payment details are stored in the code itself.",
  bitcoin: "Payment details are stored in the code itself.",
  ethereum: "Payment details are stored in the code itself.",
};

/**
 * Null when the type can become a dynamic code (only the URL type can), or
 * a short reason. The other link types encode a web address too, but the
 * builder makes URL codes, so they're pointed there.
 */
export function dynamicBlockedReason(type: ContentType): string | null {
  if (type === "url") return null;
  if (type === "dubsh") {
    return "Dub links are already dynamic. Change where they point in Dub.";
  }
  return (
    STORED_IN_CODE[type] ??
    "Only URL codes can be dynamic. Use the URL type for this link."
  );
}

export type PlaygroundBuilderRequest = Extract<
  CodeBuilderRequest,
  { mode: "create" | "edit" }
>;

/**
 * The builder request for the playground's code: edit the dynamic code it's
 * bound to (for this account), else create one with its address and design.
 */
export function builderRequestFor(state: {
  contentType: ContentType;
  /** The URL form's address as typed ("" when empty) */
  url: string;
  style: QRStyle;
  linked: LinkedCodeRef | null;
  userId: string | null;
}):
  | { ok: true; request: PlaygroundBuilderRequest }
  | { ok: false; reason: string } {
  const reason = dynamicBlockedReason(state.contentType);
  if (reason) return { ok: false, reason };
  if (state.linked && state.userId && state.linked.userId === state.userId) {
    return {
      ok: true,
      request: { mode: "edit", codeId: state.linked.id, origin: "playground" },
    };
  }
  return {
    ok: true,
    request: {
      mode: "create",
      initial: { destination: state.url.trim(), style: state.style },
      origin: "playground",
    },
  };
}

/** The hosted page gallery over the playground, with its design. */
export function pageGalleryRequest(
  style: QRStyle,
  { type, template }: { type?: string | null; template?: string | null } = {},
): Extract<CodeBuilderRequest, { mode: "page" }> {
  return {
    mode: "page",
    ...(type && { type }),
    ...(type && template && { template }),
    style,
    origin: "playground",
  };
}

/** False for page types built on uploads where file storage is off. */
export function pageTypeOffered(type: string, fileStorage: boolean): boolean {
  return fileStorage || !FILE_PAGE_TYPES.has(type);
}

// ─── Signed out: the OPEN_CODE_BUILDER post-login action ────────────────────

/**
 * Data of the "OPEN_CODE_BUILDER" post-login action (store/auth-store keeps
 * it across the OAuth redirect). No address or design: those are read from
 * the editor when it runs, so nothing private sits in storage.
 */
export interface OpenCodeBuilderIntent {
  kind: "dynamic" | "page";
  /** kind "page": the page type picked */
  type?: string;
  /** When it was asked for (ms since epoch) */
  at: number;
}

/** As long as a "Dynamic" pick (dynamic-resume.ts): any sign-in fits. */
export const OPEN_CODE_BUILDER_MAX_AGE_MS = 30 * 60 * 1000;

export function openCodeBuilderIntent(
  kind: OpenCodeBuilderIntent["kind"],
  { type }: { type?: string } = {},
  now: number = Date.now(),
): OpenCodeBuilderIntent {
  return { kind, ...(type && { type }), at: now };
}

/** The intent when it is well formed and recent, else null. */
export function resumableIntent(
  intent: unknown,
  now: number = Date.now(),
): OpenCodeBuilderIntent | null {
  if (!intent || typeof intent !== "object") return null;
  const { kind, type, at } = intent as Partial<OpenCodeBuilderIntent>;
  if (kind !== "dynamic" && kind !== "page") return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at > now) return null;
  if (now - at > OPEN_CODE_BUILDER_MAX_AGE_MS) return null;
  if (type !== undefined && typeof type !== "string") return null;
  return { kind, ...(type && { type }), at };
}
