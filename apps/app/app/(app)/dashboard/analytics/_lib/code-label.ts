// How Analytics names a code: its title, else its back-half. Client-safe.

export const codeLabel = (code: { title: string | null; slug: string }) =>
  code.title || `/${code.slug}`;

/** A code the compare picker can offer. */
export interface CompareOption {
  id: string;
  label: string;
}

export const toCompareOption = (code: {
  id: string;
  title: string | null;
  slug: string;
}): CompareOption => ({ id: code.id, label: codeLabel(code) });
