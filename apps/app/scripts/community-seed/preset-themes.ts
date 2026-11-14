// Built-in themes (utils/qr-presets.ts) that QRdx publishes as official
// @qrdx community themes. packages/database/scripts/seed-community.mjs reads
// them from community-seed-presets.json, which ./generate.ts writes from
// this module; tests/database/seed-community.test.ts fails while that file
// is stale.
//
// Each item is the theme as a publish would store it: the payload is the
// app's own themePayloadFromStyle() of the preset's styles (no uploaded
// logo, image art or image fill; the QRdx mark of `showLogo` is kept, as
// publishing keeps it), the name is the preset's label, and the tags are the
// preset's tags and gallery shelf that are in the community vocabulary.

import { MAX_TAGS_PER_THEME } from "@repo/config";
import {
  type ThemePayload,
  themePayloadFromStyle,
} from "@/lib/community/payloads";
import { slugify } from "@/lib/community/text";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import type { ThemePreset } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

/**
 * The themes published, by preset id, in library order, with their gallery
 * descriptions: the 41 looks added in November 2026 (commit f39a99b4).
 */
export const PRESET_THEME_DESCRIPTIONS: Record<string, string> = {
  aurora:
    "Mixed dots in a radial teal to violet gradient, on a pale blue-white ground. For posters and creative studios.",
  orchid:
    "Small square modules in a radial magenta to indigo gradient, on pale pink. For beauty and fashion labels.",
  ember:
    "Mosaic modules in a radial dark red to orange gradient, with shield-shaped eyes, on warm cream. For grills and food trucks.",
  dusk: "Horizontal lines that shade from navy through violet to magenta, on pale lavender. For music and nightlife flyers.",
  meadow:
    "Large round dots in a green to blue gradient, with petal eyes and leaf-shaped centers. For parks and outdoor events.",
  acid: 'Black plus-shaped modules on neon lime, in a black sticker frame that says "Scan me". For gig posters and streetwear tags.',
  hotline:
    'Near-black rounded modules on hot pink, in a phone frame that says "Get the app". For app download links.',
  laser:
    'Dark vertical lines on neon cyan, with a black ribbon underneath that says "Scan me". For tech events and packaging.',
  pistachio:
    "Mixed dots in deep olive green, with leaf-shaped eyes, on pale green. For cafés and plant shops.",
  periwinkle:
    'Indigo hexagons on pale periwinkle, in a border with a speech bubble below that says "Say hello". For contact cards and welcome signs.',
  moss: "Dark olive modules with shield-shaped eyes, on warm stone. For outdoor gear and trail signs.",
  clay: "Terracotta brown hexagons with beveled eyes, on pale clay. For pottery studios and craft markets.",
  fern: "Deep forest green in flowing vertical strokes, on pale green. For garden centers and botanical labels.",
  onyx: "Black on cream, with shield-shaped eyes and gold eye centers. For jewelry and fine dining.",
  velvet:
    "Deep burgundy dots with rose heart centers in the eyes, on blush white. For wine bars and weddings.",
  obsidian:
    'Black squares with gold eye centers, in a black to gold gradient border that says "Scan to enter". For galas and VIP entry.',
  cobalt:
    "Cobalt blue squares with red eye centers, on white. For corporate cards and sports clubs.",
  signal:
    'Black squares with red eyes on white, between two black banners that say "Scan me" and "Point your camera". For posters and printed signs.',
  tangerine:
    'Burnt orange dots with dark brown speech-shaped eyes, in a chat bubble frame that says "Chat with us". For support and messaging links.',
  ultramarine:
    "Rounded modules in a deep blue to indigo gradient, with pink eye centers, on white. For startups and product pages.",
  graphite:
    "Dark grey horizontal lines with square eyes, on white. For minimal print and stationery.",
  pebble:
    "Dark stone grey rounded modules on pale stone, with the QRdx logo in the center. For business cards and labels; swap in your own logo in the editor.",
  ink: "Black mosaic modules on white, inside a heavy square border. For print and labels.",
  logotype:
    "Black rounded modules on white, with the QRdx logo in the center. For brand materials; swap in your own logo in the editor.",
  twinkle:
    "Navy star-shaped modules with amber flower centers in the eyes, on warm cream. For night markets and kids' events.",
  blossom:
    "Deep pink dots with petal eyes and flower centers, on blush pink. For florists and spring sales.",
  pinwheel:
    "Purple plus-shaped modules with teal eyes, on pale lavender. For toy shops and kids' activities.",
  bubbles:
    "Dark cyan round dots with rounded eyes, on pale aqua. For swim schools and party invites.",
  loveNote:
    'Deep rose heart-shaped modules in an envelope frame that says "Open me". For Valentine\'s cards and gift notes.',
  gallery:
    'Near-black on off-white, inside a heavy border that says "Scan for the story". For museum labels and exhibit captions.',
  helpDesk:
    'Dark slate rounded modules with teal eyes, under a teal speech bubble that says "Need help?". For support desks and help pages.',
  seal: 'Dark green dots in a round seal that reads "Scan me" and "Thank you". For certificates and packaging.',
  viewfinder:
    'Black squares with red eye centers inside camera focus corners, above the words "Point and scan". For posters and photo spots.',
  bakery:
    'Dark brown dots on cream, with a brown banner on top that says "Order ahead". For bakeries and pickup orders.',
  blaze:
    'Black modules on bright orange, under a black speech bubble that says "Scan me". For sale posters and shop windows.',
  glacier:
    "Diamond modules in a teal to navy gradient, with gear-shaped eyes, on pale mint. For winter sports and cool-toned brands.",
  ladybug:
    "Large black dots with red drop-shaped eyes, on pale pink. For garden shops and kids' crafts.",
  taxi: 'Black squares on taxi yellow, with a black banner below that says "Book a ride". For taxis and ride booking.',
  sprinkles:
    "Scattered purple dots with pink eyes, on pale pink. For dessert shops and birthday parties.",
  brass:
    "Charcoal diamonds with brass hexagon eye centers, on cream, in an art deco mood. For cocktail bars and hotels.",
  seafoam:
    'Deep sea green in flowing liquid modules, inside a rounded border that says "Scan to book". For spas and salons.',
};

/** A built-in theme as the seed publishes it. */
export interface PresetSeedTheme {
  /** The preset's id: the item is ci_official_theme_<id> */
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  payload: ThemePayload;
}

const VOCABULARY: readonly string[] = COMMUNITY_THEME_TAGS;

/** "loveNote" → "love-note", the item's slug (/community/themes/love-note). */
export const presetSlug = (id: string): string =>
  slugify(id.replace(/([a-z0-9])([A-Z])/g, "$1-$2"));

/**
 * The preset's tags and shelf ("art deco" read as "art-deco") that are
 * community tags: a publish keeps only those (cleanDetails in
 * lib/community/publish.ts), at most five.
 */
export function presetSeedTags(preset: ThemePreset): string[] {
  const words = [...(preset.tags ?? []), preset.category ?? ""].map((tag) =>
    tag.trim().toLowerCase().replace(/\s+/g, "-"),
  );
  return [...new Set(words.filter((tag) => VOCABULARY.includes(tag)))].slice(
    0,
    MAX_TAGS_PER_THEME,
  );
}

/** Every built-in theme the seed publishes, from the presets themselves. */
export function buildPresetSeedThemes(): PresetSeedTheme[] {
  return Object.entries(PRESET_THEME_DESCRIPTIONS).map(([id, description]) => {
    const preset = defaultPresets[id];
    if (!preset?.label) throw new Error(`${id}: no built-in theme`);
    const built = themePayloadFromStyle(preset.styles);
    if (!built) throw new Error(`${id}: the community can't store its style`);
    if (built.removed.length > 0) {
      throw new Error(
        `${id}: publishing drops its ${built.removed.join(", ")}`,
      );
    }
    return {
      id,
      slug: presetSlug(id),
      name: preset.label,
      description,
      tags: presetSeedTags(preset),
      payload: built.payload,
    };
  });
}
