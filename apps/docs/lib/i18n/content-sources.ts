// The TypeScript copy scripts/i18n-translate.ts translates into
// messages/content/<locale>.json (lib/i18n/content.ts). Read by the scripts
// and tests only, never by pages: a page passes its own data to
// localizeContent().
//
// Each source lists every variant a deployment can render, so all of them
// get translated: the SEO pages drop sentences about custom domains where
// those can't be added (lib/seo-content/availability.ts).

import {
  CATALOG_CATEGORIES,
  CATALOG_KIND_DESCRIPTIONS,
  CATALOG_KIND_LABELS,
  CATALOG_PLAN_LABELS,
  getIntegrationCatalog,
} from "@repo/integrations/src/catalog";
import {
  ALLOWANCES as ART_ALLOWANCES,
  STEPS as ART_STEPS,
  VECTOR_STEPS as ART_VECTOR_STEPS,
} from "@/app/[lang]/(home)/ai/art/content";
import {
  BARCODE_FORMAT_PAGES,
  GS1_AI_NAMES,
} from "@/app/[lang]/(home)/barcode-generator/[format]/content";
import {
  BARCODE_FAQS,
  BARCODE_TIPS,
  BARCODE_USES,
} from "@/app/[lang]/(home)/barcode-generator/content";
import {
  MCP_FAQS,
  MCP_INTRO,
  MCP_PROMPTS,
  MCP_STEPS,
  MCP_TOOLS,
} from "@/app/[lang]/(home)/mcp/content";
import { PLUGINS } from "@/app/[lang]/(home)/plugins/plugin-data";
import { faqItems as artFaqItems } from "@/components/sections/ai-art/faq-items";
import { CHAT_BOTS } from "@/components/sections/chat-bots/bots";
import { BARCODE_FILES } from "@/lib/barcode/files";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import { ALL_PAGE_CODES } from "@/lib/landing/page-codes";
import { listTemplates } from "@/lib/landing/templates";
import { mcpMoreClients, mcpServerUrl } from "@/lib/mcp-clients";
import { baseUrl } from "@/lib/metadata";
import { QR_TYPE_GROUPS, QR_TYPES } from "@/lib/qr-types-content";
import { topicForDeployment } from "@/lib/seo-content/availability";
import { INDUSTRY_GROUPS } from "@/lib/seo-content/industries";
import { PAGE_TYPES } from "@/lib/seo-content/page-types";
import { PLACEMENT_GROUPS } from "@/lib/seo-content/placements";
import type { SeoGroup } from "@/lib/seo-content/types";
import { type ContentRules, contentStrings } from "./content";
import {
  APP_NAV_CONTENT,
  APP_NAV_RULES,
  BARCODE_CONTENT_RULES,
  EDITOR_CONTENT,
  EDITOR_CONTENT_RULES,
  INTEGRATION_RULES,
  MCP_RULES,
  PAGE_CODE_RULES,
  QR_TYPE_RULES,
  TEMPLATE_RULES,
} from "./content-rules";

export interface ContentSource {
  /** The first segment of each string's context path. */
  namespace: string;
  /** Where the strings appear, for the translator. */
  surface: string;
  /** The English data, with every variant a deployment can render. */
  data: () => unknown;
  rules?: ContentRules;
}

/** A collection as rendered with and without custom domains. */
const withVariants = (groups: SeoGroup[]) => [
  groups,
  groups.map((group) => ({
    ...group,
    items: group.items.map((topic) =>
      topicForDeployment(topic, { customDomains: false }),
    ),
  })),
];

export const CONTENT_SOURCES: readonly ContentSource[] = [
  // i18n-play lane: the signed-in app's navigation (components/app-shell).
  {
    namespace: "appNav",
    surface:
      "the signed-in app's navigation: sidebar group headings and items (1 to 3 words, like menu items: 'Codes', 'Pages & forms', 'Plan & usage'), area titles and 'back to' links. Product names stay in English",
    data: APP_NAV_CONTENT,
    rules: APP_NAV_RULES,
  },
  // i18n-play lane: the editor's type picker (components/editor/content-type-*).
  {
    namespace: "contentTypes",
    surface:
      "the QR code editor's type picker: each content type's short name (1 to 3 words, like a menu item) with a one-line description of what the code opens, and the picker's group names. Brand and product names stay in English",
    data: () => EDITOR_CONTENT,
    rules: EDITOR_CONTENT_RULES,
  },
  {
    namespace: "qrTypes",
    surface:
      "the free QR code generator pages (/qr-code-generator/<type>), one per content type: a card summary, the page intro, steps to make the code, notes on what the code contains, and an FAQ",
    data: () => ({ groups: QR_TYPE_GROUPS, types: QR_TYPES }),
    rules: QR_TYPE_RULES,
  },
  {
    namespace: "industries",
    surface:
      "the 'QR codes for <industry>' landing pages (/qr-codes-for/<industry>): how a business in that industry uses QR codes, recommended code types, where people stand when they scan, printing tips, short call-to-action lines printed beside a code, and an FAQ",
    data: () => withVariants(INDUSTRY_GROUPS),
  },
  {
    namespace: "placements",
    surface:
      "the 'QR codes on <placement>' landing pages (/qr-codes-on/<placement>): what to link from a QR code printed on that object or surface, recommended code types, scanning distances, printing tips, short call-to-action lines printed beside a code, and an FAQ",
    data: () => withVariants(PLACEMENT_GROUPS),
  },
  {
    namespace: "pageTypes",
    surface:
      "names and one-line descriptions of the hosted mobile page types a dynamic QR code can open (shown as cards on the landing pages)",
    data: () => PAGE_TYPES,
  },
  {
    namespace: "pageCodes",
    surface:
      "short names under sample QR code tiles on the landing pages (2 to 4 words: what the code is for, e.g. 'Guest Wi-Fi', 'Table menu')",
    data: () => ALL_PAGE_CODES,
    rules: PAGE_CODE_RULES,
  },
  {
    namespace: "barcodes",
    surface:
      "the free barcode generator: each symbology's one-line summary and input hint, file type hints, when to use each barcode type, printing tips and the FAQ",
    data: () => ({
      formats: BARCODE_FORMATS,
      files: BARCODE_FILES,
      uses: BARCODE_USES,
      tips: BARCODE_TIPS,
      faqs: BARCODE_FAQS,
    }),
    rules: BARCODE_CONTENT_RULES,
  },
  {
    namespace: "barcodeFormats",
    surface:
      "one barcode generator page per barcode type (/barcode-generator/<type>): the title, where that barcode is used, whether it needs GS1 numbers, how its input and check digit work, print sizes, names of GS1 Application Identifiers and an FAQ. Barcode names (EAN-13, Code 128), GS1 terms (GTIN, SSCC), sample values and measurements stay exactly as written",
    data: () => ({ pages: BARCODE_FORMAT_PAGES, ais: GS1_AI_NAMES }),
  },
  {
    namespace: "templates",
    surface:
      "the hosted page templates gallery: each page type's name and one-line description, and each template's name and short description (template names are short, like 'Classic' or 'Bistro')",
    data: () => listTemplates(),
    rules: TEMPLATE_RULES,
  },
  {
    namespace: "integrations",
    surface:
      "the integrations directory and each integration's page: categories, a one-line tagline, what the integration does, setup steps, what you get, and button labels. Product names stay in English",
    data: () => ({
      categories: CATALOG_CATEGORIES,
      kinds: CATALOG_KIND_LABELS,
      kindDescriptions: CATALOG_KIND_DESCRIPTIONS,
      plans: CATALOG_PLAN_LABELS,
      entries: getIntegrationCatalog(),
    }),
    rules: INTEGRATION_RULES,
  },
  {
    namespace: "plugins",
    surface:
      "the plugins page: where each plugin runs (short chips such as 'Desktop app for macOS and Windows'), and the chat bots' one-line summaries. Platform and product names stay in English",
    data: () => ({
      platforms: PLUGINS.map((plugin) => plugin.platforms),
      bots: CHAT_BOTS.map((bot) => bot.summary),
    }),
  },
  {
    namespace: "mcp",
    surface:
      "the MCP server page: connecting QRdx to AI assistants, the steps, each tool's title and description, example prompts people send to their assistant (keep every URL, email, phone number, color code and value exactly), setup steps for more MCP apps, and the FAQ. Tool names in code (design_qr) and app names stay in English",
    // Setup steps quote the server URL: the production one is translated;
    // a self-hosted server's own URL shows its steps in English.
    data: () => ({
      intro: MCP_INTRO,
      steps: MCP_STEPS,
      tools: MCP_TOOLS,
      faqs: MCP_FAQS,
      prompts: MCP_PROMPTS,
      clients: mcpMoreClients(mcpServerUrl(baseUrl)),
    }),
    rules: MCP_RULES,
  },
  {
    namespace: "aiArt",
    surface:
      "the AI QR code art page: how a QR code is repainted by an image model and checked to scan, the vector Logo QR and Image QR modes, and the FAQ. Model and product names stay in English",
    data: () => ({
      steps: ART_STEPS,
      vectorSteps: ART_VECTOR_STEPS,
      faqs: artFaqItems(ART_ALLOWANCES),
    }),
  },
];

export interface ContentString {
  english: string;
  /** Where it first appears: "<namespace>.<path>". */
  context: string;
  namespace: string;
}

/** Every English string the sources hold, once each, in source order. */
export function contentEnglish(
  sources: readonly ContentSource[] = CONTENT_SOURCES,
): ContentString[] {
  const seen = new Set<string>();
  const out: ContentString[] = [];
  for (const source of sources) {
    const strings = contentStrings(
      source.namespace,
      source.data(),
      source.rules,
    );
    for (const [english, context] of strings) {
      if (seen.has(english)) continue;
      seen.add(english);
      out.push({ english, context, namespace: source.namespace });
    }
  }
  return out;
}
