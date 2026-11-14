import { SHORT_LINK_BASE, shortLinkUrl } from "@/lib/short-links";

/**
 * What the preview encodes before a generated back-half exists. A reserved
 * word is never issued on the shared short domain, so scanning the preview
 * can't open someone else's code. Tests keep it reserved.
 */
export const PREVIEW_SLUG = "success";

export interface PreviewLink {
  /** What the QR encodes */
  value: string;
  /** The link shown under it */
  label: string;
  /** Not the code's live link (yet) */
  isPreview: boolean;
}

/**
 * The link the QR shows: the code's own while editing leaves domain and
 * back-half alone, else the link it will get.
 */
export function previewLink({
  current,
  host,
  slug,
  slugUsable,
}: {
  /** The code being edited: its link and back-half */
  current: { shortLink: string; slug: string; domainChanged: boolean } | null;
  /** The chosen custom domain's hostname; null = the default short link */
  host: string | null;
  /** The back-half as typed */
  slug: string;
  /** The typed back-half passed the checks (or nothing is typed) */
  slugUsable: boolean;
}): PreviewLink {
  const typed = slug.trim();
  if (current) {
    const slugChanged = Boolean(typed) && typed !== current.slug;
    if (!(slugChanged || current.domainChanged)) {
      return {
        value: current.shortLink,
        label: current.shortLink,
        isPreview: false,
      };
    }
    const next = shortLinkUrl(
      slugChanged && slugUsable ? typed : current.slug,
      host,
    );
    return { value: next, label: next, isPreview: true };
  }
  if (typed && slugUsable) {
    const next = shortLinkUrl(typed, host);
    return { value: next, label: next, isPreview: true };
  }
  const base = host ? `https://${host}/` : `${SHORT_LINK_BASE}/q/`;
  return {
    value: shortLinkUrl(PREVIEW_SLUG, host),
    label: `${base}…`,
    isPreview: true,
  };
}
