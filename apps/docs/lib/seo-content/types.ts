import type { useCaseImages } from "@/components/mockups/visuals";
import type { ContentType } from "@/types/qr-content";
import type { PageTypeId } from "./page-types";

/**
 * Copy for the /qr-codes-for/[slug] (industries) and /qr-codes-on/[slug]
 * (placements) pages. Every entry must be specific to its topic: shared
 * boilerplate lives in the page component, not here.
 */

export type Recommendation =
  /** A free static code from /qr-code-generator/<type>. */
  | { kind: "static"; type: ContentType; why: string }
  /** A dynamic redirect code (editable destination, scan analytics). */
  | { kind: "dynamic"; label: string; why: string }
  /** A dynamic code that opens a hosted page of this type. */
  | { kind: "page"; page: PageTypeId; why: string };

export interface SeoFaq {
  question: string;
  answer: string;
}

export interface SeoUseCase {
  title: string;
  description: string;
}

export interface SeoDistance {
  /** Where the person stands, e.g. "Across the table". */
  label: string;
  meters: number;
}

export interface SeoTopic {
  slug: string;
  /** Title-case name for cards and breadcrumbs, e.g. "Real estate". */
  name: string;
  /** In-sentence form, e.g. "real estate", "TV and video". */
  noun: string;
  /** Page H1. */
  title: string;
  /** <title> before the "| QRdx" suffix. */
  seoTitle: string;
  metaDescription: string;
  /** One line for hub cards. */
  summary: string;
  intro: [string, string];
  useCases: SeoUseCase[];
  recommended: Recommendation[];
  /** Typical scanning distances for the sizing table. */
  distances: SeoDistance[];
  /** Sizing and placement tips. */
  tips: string[];
  /** Example call-to-action lines to print next to the code. */
  ctas: string[];
  faqs: SeoFaq[];
  /** Slugs in the other collection (industry → placements and back). */
  related: string[];
  image?: keyof typeof useCaseImages;
}

export interface SeoGroup {
  id: string;
  title: string;
  description: string;
  items: SeoTopic[];
}
