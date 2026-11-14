// Quick looks for AI QR art: a style added on top of the person's own
// description ("a koi pond in the rain" + Watercolor). Unlike the style
// presets (./presets.ts), which are whole scenes, a look only says how the
// picture is made. lib/ai/art-prompt.ts composeArtPrompt adds the words; it
// runs in lib/ai/art-run.ts, so the REST API and MCP server get looks too.
//
// Every look has a preview at public/images/ai-art-looks/<id>.webp: the same
// subject (ART_LOOK_PREVIEW_SUBJECT) in each look, made on the real pipeline
// by scripts/ai/art-previews.ts --looks and kept only when it scans. A look
// whose previews didn't scan reliably isn't listed. No artists' names,
// brands or real people.
//
// Client-safe and small: the chips row imports it directly.

export interface ArtLook {
  id: string;
  label: string;
  /** Added after the description: how the picture is made */
  words: string;
  /** Added to the things to avoid */
  avoid?: string;
}

/** The one subject every look's preview shows, so they compare. */
export const ART_LOOK_PREVIEW_SUBJECT = "a red fox in an autumn forest";

/** Longest `words` and `avoid` a look may have (tests enforce it). */
export const ART_LOOK_WORDS_MAX_LENGTH = 160;

export const ART_LOOKS = [
  {
    id: "watercolor",
    label: "Watercolor",
    words:
      "painted in watercolor on textured paper, with rich, saturated washes and crisp, clean edges",
    avoid: "black outlines, photographic detail, pale washed-out areas",
  },
  {
    id: "oil-painting",
    label: "Oil painting",
    words:
      "as an oil painting with bold, visible brushstrokes, rich saturated color and strong light and shadow",
    avoid: "flat digital shading, muddy low-contrast color",
  },
  {
    id: "anime",
    label: "Anime",
    words:
      "in a hand-drawn anime style, with clean line art, cel shading and bright, saturated color",
    avoid: "photorealism",
  },
  {
    id: "cartoon",
    label: "Cartoon",
    words:
      "as a playful cartoon, with bold outlines, simple rounded shapes and flat, bright colors",
    avoid: "realistic textures",
  },
  {
    id: "pixel-art",
    label: "Pixel art",
    words:
      "as retro pixel art, with a limited palette and crisp square pixels, no anti-aliasing",
    avoid: "smooth gradients, blur",
  },
  {
    id: "pop-art",
    label: "Pop art",
    words:
      "as bold pop art, with halftone dots, thick black outlines and a few flat, saturated colors",
    avoid: "speech bubbles, captions",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    words:
      "as a charcoal drawing on rough paper, with smudged tones, strong contrast and expressive strokes",
    avoid: "color",
  },
  {
    id: "ink",
    label: "Ink",
    words:
      "as an ink wash drawing, with confident brush lines and soft gray washes on white paper",
    avoid: "bright colors",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    words:
      "in a cyberpunk mood: a rain-soaked night lit by neon magenta and cyan, with glowing reflections",
    avoid: "daylight",
  },
  {
    id: "fantasy",
    label: "Fantasy",
    words:
      "as fantasy concept art, with luminous magical light, rich detail and a sense of wonder",
  },
  {
    id: "photographic",
    label: "Photographic",
    words:
      "as a photograph, with natural light, true-to-life textures and a shallow depth of field",
    avoid: "illustration, cartoon, painterly strokes",
  },
  {
    id: "low-poly",
    label: "Low poly",
    words:
      "as low-poly art, with flat-shaded triangular facets, clean geometric forms and soft gradient light",
    avoid: "fine detail, photographic textures",
  },
  {
    id: "papercut",
    label: "Papercut",
    words:
      "as layered papercut art, with stacked paper layers, soft shadows between them and clean cut edges",
    avoid: "glossy surfaces",
  },
] as const satisfies readonly ArtLook[];

export type ArtLookId = (typeof ART_LOOKS)[number]["id"];

export const ART_LOOK_IDS = ART_LOOKS.map((look) => look.id) as [
  ArtLookId,
  ...ArtLookId[],
];

export function findArtLook(id: string | null | undefined): ArtLook | null {
  return ART_LOOKS.find((look) => look.id === id) ?? null;
}

/** The look's preview, a 128 px WebP. */
export const artLookPreview = (id: string): string =>
  `/images/ai-art-looks/${id}.webp`;
