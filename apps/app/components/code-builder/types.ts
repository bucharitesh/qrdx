import type { QRStyle } from "@/types/theme";

/** Everything the builder's form holds; what a draft saves. */
export interface BuilderFields {
  /** As typed; normalized (https:// added) when saved */
  destination: string;
  title: string;
  /** null = the default short link domain */
  domainId: string | null;
  /** A chosen back-half; empty = generated (new) or unchanged (edit) */
  slug: string;
  /** null = no folder */
  folderId: string | null;
  tagIds: string[];
  /**
   * The design. null = untouched: a new code gets the workspace's default
   * theme on the server, an existing one keeps its design.
   */
  style: QRStyle | null;
}

export const EMPTY_FIELDS: BuilderFields = {
  destination: "",
  title: "",
  domainId: null,
  slug: "",
  folderId: null,
  tagIds: [],
  style: null,
};
