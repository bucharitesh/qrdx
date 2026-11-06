// QRdx's own page templates (lib/landing/templates, the library behind
// Dashboard → Pages → Page templates) as official @qrdx community page
// templates, and a few official kits that pair one with a matching seeded
// theme and/or official frame. packages/database/scripts/seed-community.mjs
// reads them from community-seed-pages.json. The page renderer needs Next's
// compiler (fonts), so the file is written by the seed test rather than a
// tsx script:
//
//   cd apps/docs && UPDATE_COMMUNITY_SEED_PAGES=1 pnpm exec vitest run tests/database/seed-community.test.ts
//
// and the test fails while the file is stale. Items already seeded never
// change (published versions are immutable).
//
// Each template goes through the same scrub a real publish uses
// (lib/community/page-template.ts scrubPageContent, nothing kept): sample
// text, sample links and contact details, and no photos at all. A variant
// is left out when the scrub drops one of its blocks (its page type needs
// its own file: PDF, audio, uploaded video, downloads), when fewer than two
// blocks are left, or when it scrubs to the same page as an earlier one.

import { createHash } from "node:crypto";
import { scrubPageContent } from "@/lib/community/page-template";
import { PAGE_TEMPLATE_TAGS, stableStringify } from "@/lib/community/payloads";
import { textProblem } from "@/lib/community/text";
import { buildTemplateContent, listTemplates } from "@/lib/landing/templates";
import type { LandingPageContent } from "@/types/landing";

export interface SeedPageTemplate {
  /** "<page type>-<variant>", also the slug */
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  payload: { page: { type: string; content: LandingPageContent } };
}

export interface SeedKit {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Seeded item refs: "page-template:<id>", "theme:<id>", "frame:<id>" */
  page: string;
  theme?: string;
  frame?: string;
}

/** The tag of each page type, when it's in the vocabulary. */
const TYPE_TAGS: Record<string, string> = {
  links: "links",
  business: "business",
  vcard: "contact",
  menu: "menu",
  coupon: "coupon",
  event: "event",
  feedback: "feedback",
  images: "portfolio",
};

const hashOf = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

/**
 * The page with every block and item id made stable (a hash of the
 * template and its place in the page): the library gives them random ids,
 * and the generated file must come out the same on every run.
 */
function stableIds<T>(value: T, seed: string, path = ""): T {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      stableIds(item, seed, `${path}.${index}`),
    ) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] =
        key === "id" && typeof child === "string"
          ? createHash("sha256")
              .update(`${seed}${path}`)
              .digest("hex")
              .slice(0, 12)
          : stableIds(child, seed, `${path}.${key}`);
    }
    return next as T;
  }
  return value;
}

/**
 * The page without its event start dates. Parsing fills them in as a week
 * from today (lib/landing/blocks/event-schema.tsx), so a stored date would
 * change the generated file every day and later put the template's event
 * in the past. Left out, the date is filled in when someone uses the
 * template (readPageTemplate parses the content again).
 */
export function withoutEventStarts(
  content: LandingPageContent,
): LandingPageContent {
  return {
    ...content,
    blocks: content.blocks.map((block) => {
      if (block.type !== "event") return block;
      const { start: _start, ...props } = block.props as Record<
        string,
        unknown
      >;
      return { ...block, props } as typeof block;
    }),
  };
}

export function buildSeedPageTemplates(): SeedPageTemplate[] {
  const seen = new Set<string>();
  const out: SeedPageTemplate[] = [];
  for (const template of listTemplates()) {
    for (const variant of template.variants) {
      const id = `${template.type}-${variant.id}`;
      const { content, report } = scrubPageContent(
        stableIds(buildTemplateContent(template.type, variant.id), id),
      );
      if (report.blocks.length > 0 || content.blocks.length < 2) continue;
      const payload = {
        page: { type: template.type, content: withoutEventStarts(content) },
      };
      const hash = hashOf(payload);
      if (seen.has(hash)) continue;
      seen.add(hash);
      const written = variant.description ?? template.description;
      const description = textProblem(written) ? template.description : written;
      const tag = TYPE_TAGS[template.type];
      out.push({
        id,
        slug: id,
        name: `${template.label}: ${variant.name}`.slice(0, 60),
        description: description.slice(0, 500),
        tags: tag && PAGE_TEMPLATE_TAGS.includes(tag) ? [tag] : [],
        payload,
      });
    }
  }
  return out;
}

/**
 * Official kits: a page template with the seeded look it goes with. The
 * hand-made themes (community-seed.json) carry their official frame, so
 * they pair with a page alone; a built-in theme pairs with a frame.
 */
export const SEED_KITS: SeedKit[] = [
  {
    id: "cafe-table",
    slug: "cafe-table",
    name: "Café table kit",
    description:
      "A café menu page with the Café Crema look on a table tent card. Use it to get the page as a draft and the look as a saved theme.",
    page: "page-template:menu-cafe",
    theme: "theme:cafe-crema",
  },
  {
    id: "order-at-table",
    slug: "order-at-table",
    name: "Order at table kit",
    description:
      "A restaurant menu page with the Bistro Ink look on an order at table frame.",
    page: "page-template:menu-restaurant",
    theme: "theme:bistro-ink",
  },
  {
    id: "review-counter",
    slug: "review-counter",
    name: "Review counter kit",
    description:
      "A guest feedback form with the Review Gold look on a review card, for counters and receipts.",
    page: "page-template:feedback-guest-feedback",
    theme: "theme:review-gold",
  },
  {
    id: "event-ticket",
    slug: "event-ticket",
    name: "Event ticket kit",
    description:
      "An event page with the Ticket Red look on a ticket stub, for launches and parties.",
    page: "page-template:event-party",
    theme: "theme:ticket-red",
  },
  {
    id: "salon-booking",
    slug: "salon-booking",
    name: "Salon booking kit",
    description:
      "A salon and studio page with the Clinic Mint look on a book now frame.",
    page: "page-template:business-studio",
    theme: "theme:clinic-mint",
  },
  {
    id: "property-sign",
    slug: "property-sign",
    name: "Property sign kit",
    description:
      "A real estate agent card with the Realty Navy look on a sign rider frame.",
    page: "page-template:vcard-realtor",
    theme: "theme:realty-navy",
  },
  {
    id: "business-card",
    slug: "business-card",
    name: "Business card kit",
    description:
      "A contact card page with the Onyx look on a save my contact frame, for printed business cards.",
    page: "page-template:vcard-classic",
    theme: "theme:onyx",
    frame: "frame:save-contact",
  },
  {
    id: "app-download",
    slug: "app-download",
    name: "App download kit",
    description:
      "An app launch page with the Hotline look in its get the app phone frame.",
    page: "page-template:apps-app-launch",
    theme: "theme:hotline",
  },
];
