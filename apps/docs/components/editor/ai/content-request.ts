// The content dialog's rules, apart from its UI: when the editor counts as
// empty (the preview's "Sample" badge), what a link or a content form must
// hold to continue (the forms' own checks), and putting the editor back on
// Cancel. The dialog only writes to the editor store: no address, no
// analytics, so private content (Wi-Fi passwords, contacts) stays there.
import {
  checkUrl,
  withScheme,
} from "@/components/editor/content-forms/url-check";
import {
  CONTENT_CATEGORIES,
  CONTENT_TYPES_METADATA,
  type ContentType,
  type QRContentConfig,
} from "@/types/qr-content";
import { validateContent } from "@/utils/qr-content-encoder";

interface ContentState {
  contentType: ContentType;
  contentConfigs: Partial<Record<ContentType, QRContentConfig>>;
  value: string;
}

/** True when the code has content; false shows the preview's Sample badge. */
export const hasEditorContent = (state: Pick<ContentState, "value">) =>
  state.value.trim().length > 0;

export type ContentSnapshot = ContentState;

/** What the editor holds now, to put back on Cancel. */
export function snapshotContent(state: ContentState): ContentSnapshot {
  return {
    contentType: state.contentType,
    contentConfigs: { ...state.contentConfigs },
    value: state.value,
  };
}

/** A typed link as the URL form takes it, or why it isn't one yet. */
export function linkContent(
  raw: string,
):
  | { ok: true; config: QRContentConfig; value: string; host: string }
  | { ok: false; message: string | null } {
  const check = checkUrl(raw);
  if (check.status === "ok" || check.status === "warning") {
    return {
      ok: true,
      config: { type: "url", url: withScheme(raw) },
      value: check.url,
      host: check.host,
    };
  }
  return {
    ok: false,
    message: check.status === "error" ? check.message : null,
  };
}

/**
 * Whether the content form for the editor's type is ready to continue: it
 * encodes to something (the form's own rule) and passes the encoder's
 * checks (required fields, Wi-Fi passwords, payload size).
 */
export function contentReady(
  state: ContentState,
): { ok: true; type: ContentType } | { ok: false; message: string } {
  const config = state.contentConfigs[state.contentType];
  if (!config || !hasEditorContent(state)) {
    return { ok: false, message: "Fill in the fields marked * to continue." };
  }
  const checked = validateContent(config);
  return checked.valid
    ? { ok: true, type: state.contentType }
    : { ok: false, message: checked.error ?? "Check the fields above." };
}

const LABELS = new Map(
  CONTENT_TYPES_METADATA.map((meta) => [meta.type, meta.label]),
);

/** A content type's name ("Wi-Fi"), for any type id a tool reports. */
export const contentLabel = (type: string) =>
  LABELS.get(type as ContentType) ?? type;

/** The types shown first, after the link field: the popular ones but URL. */
export const QUICK_CONTENT_TYPES: ContentType[] = (
  CONTENT_CATEGORIES.find((category) => category.id === "popular")?.types ?? []
).filter((type) => type !== "url");

/** Every other type, in the catalogue's order, behind "More types". */
export const MORE_CONTENT_TYPES: ContentType[] = CONTENT_TYPES_METADATA.map(
  (meta) => meta.type,
).filter((type) => type !== "url" && !QUICK_CONTENT_TYPES.includes(type));
