/** How a suggestion looks, drawn as a tiny chip next to its label. */
export interface PromptSwatch {
  fg: string;
  bg: string;
  /** Eye colour, when it differs from the modules. */
  accent?: string;
  shape: "square" | "rounded" | "dot";
}

interface Suggestion {
  label: string;
  prompt: string;
  swatch: PromptSwatch;
}

// Each prompt names exact colours and patterns, so the result matches its chip.
export const PROMPTS: Record<string, Suggestion> = {
  inkPaper: {
    label: "Ink & Paper",
    prompt:
      "A calm, editorial QR code: near-black #111111 modules on a warm paper #FAF7F2 background. bodyPattern rounded, cornerEyePattern rounded, cornerEyeDotPattern rounded. eyeColor and dotColor #111111. Generous margin.",
    swatch: { fg: "#111111", bg: "#FAF7F2", shape: "rounded" },
  },
  midnightGold: {
    label: "Midnight & Gold",
    prompt:
      "An elegant, premium QR code: deep navy #1E2A5A modules on a cream #F4EFE6 background, with antique gold #9A7428 eye dots. bodyPattern rounded, cornerEyePattern gear, cornerEyeDotPattern rounded. eyeColor #1E2A5A, dotColor #9A7428.",
    swatch: {
      fg: "#1E2A5A",
      bg: "#F4EFE6",
      accent: "#9A7428",
      shape: "rounded",
    },
  },
  sunsetCoral: {
    label: "Sunset Coral",
    prompt:
      "A warm sunset QR code: coral #C3412A modules on a soft peach #FFF1E6 background, with amber #C0700B eyes. bodyPattern circle, cornerEyePattern extra-rounded, cornerEyeDotPattern circle. eyeColor and dotColor #C0700B.",
    swatch: { fg: "#C3412A", bg: "#FFF1E6", accent: "#C0700B", shape: "dot" },
  },
  oceanCalm: {
    label: "Ocean Calm",
    prompt:
      "A fresh ocean QR code: deep sea blue #0B5482 modules on a pale aqua #EAF6FB background, with teal #0F9488 eyes. bodyPattern rounded, cornerEyePattern extra-rounded, cornerEyeDotPattern rounded. eyeColor and dotColor #0F9488.",
    swatch: {
      fg: "#0B5482",
      bg: "#EAF6FB",
      accent: "#0F9488",
      shape: "rounded",
    },
  },
  forestMoss: {
    label: "Forest Moss",
    prompt:
      "An organic, natural QR code: forest green #1F5130 modules on a light sage #F0F5EA background, with moss #5E8A3A eyes. bodyPattern circle, cornerEyePattern rounded, cornerEyeDotPattern circle. eyeColor and dotColor #5E8A3A.",
    swatch: { fg: "#1F5130", bg: "#F0F5EA", accent: "#5E8A3A", shape: "dot" },
  },
  pastelDream: {
    label: "Pastel Dream",
    prompt:
      "A soft, dreamy QR code: lavender #6E44B8 modules on a blush #FDF2F8 background, with pink #D9579A eyes. bodyPattern rounded, cornerEyePattern extra-rounded, cornerEyeDotPattern circle. eyeColor and dotColor #D9579A. Keep the modules dark enough to scan.",
    swatch: {
      fg: "#6E44B8",
      bg: "#FDF2F8",
      accent: "#D9579A",
      shape: "rounded",
    },
  },
  neonNight: {
    label: "Neon Night",
    prompt:
      "A glowing neon QR code: electric cyan #22E1FF modules on a near-black #0B0B16 background, with magenta #FF3DF2 eyes. bodyPattern circle, cornerEyePattern circle, cornerEyeDotPattern circle. eyeColor and dotColor #FF3DF2.",
    swatch: { fg: "#22E1FF", bg: "#0B0B16", accent: "#FF3DF2", shape: "dot" },
  },
  retroArcade: {
    label: "Retro Arcade",
    prompt:
      "A retro arcade, pixel-art QR code: royal blue #2B2BD6 modules on a warm cream #FFF4D6 background, with red #E63946 eyes. bodyPattern square, cornerEyePattern square, cornerEyeDotPattern square. eyeColor and dotColor #E63946.",
    swatch: {
      fg: "#2B2BD6",
      bg: "#FFF4D6",
      accent: "#E63946",
      shape: "square",
    },
  },
};

interface RemixPrompt {
  displayContent: string;
  prompt: string;
  basePreset: string;
}

interface Prompt {
  displayContent: string;
  prompt: string;
}

export const CREATE_PROMPTS: Prompt[] = [
  {
    displayContent: "Retro gaming aesthetic with pixelated feel",
    prompt:
      "Create a retro gaming QR code with square patterns throughout. Use vibrant pixel-art inspired colors like bright red or blue on dark background. Set bodyPattern to square, cornerEyePattern to square, cornerEyeDotPattern to square. Set eyeColor and dotColor to match fgColor.",
  },
  {
    displayContent: "Pastel colors with soft rounded edges",
    prompt:
      "Create a soft pastel QR code with gentle colors. Use light pastel colors like soft pink or lavender for foreground on cream background. Use rounded body and extra-rounded corner eyes. Set eyeColor and dotColor to match fgColor.",
  },
  {
    displayContent: "Corporate professional with blue tones",
    prompt:
      "Generate a professional corporate QR code with navy blue or corporate blue foreground on white background. Use rounded or gear patterns for sophisticated look. Set eyeColor and dotColor to match the blue foreground. Clean margins.",
  },
  {
    displayContent: "Sunset vibes with warm colors",
    prompt:
      "Create a sunset-inspired QR code with warm orange or coral foreground on peachy background. Use circle or rounded patterns. Set eyeColor and dotColor to match the warm foreground color for consistency. Artistic yet scannable.",
  },
];

export const REMIX_PROMPTS: RemixPrompt[] = [
  {
    displayContent: "Make @Modern but in vibrant purple",
    prompt:
      "Take @Modern preset but change all colors to vibrant purple foreground on light background. Keep the rounded patterns and maintain eye color consistency.",
    basePreset: "modern",
  },
  {
    displayContent: "What if @Neon was green instead?",
    prompt:
      "Use @Neon preset but change to electric green foreground with matching eye colors. Keep the dark background and circular patterns.",
    basePreset: "neon",
  },
  {
    displayContent: "@Nature but with autumn orange tones",
    prompt:
      "Take @Nature preset but use warm autumn orange and brown colors instead of green. Keep the rounded organic patterns and eye color consistency.",
    basePreset: "nature",
  },
  {
    displayContent: "@Minimal but add some blue accent",
    prompt:
      "Use @Minimal preset but add subtle blue accent to the eye colors while keeping main foreground neutral. Maintain square patterns.",
    basePreset: "minimal",
  },
];

export const VARIANT_PROMPTS: Prompt[] = [
  {
    displayContent: "Make my @Current Style more rounded",
    prompt:
      "Take @Current Style and make all patterns more rounded. Change bodyPattern to rounded, cornerEyePattern to extra-rounded, cornerEyeDotPattern to rounded. Keep all colors the same.",
  },
  {
    displayContent: "Add more contrast to @Current Style",
    prompt:
      "Enhance @Current Style with higher contrast. Make background lighter or darker to increase contrast with foreground. Ensure eyeColor and dotColor remain consistent with foreground for better scanability.",
  },
  {
    displayContent: "Make @Current Style more fluid and artistic",
    prompt:
      "Transform @Current Style to use circle patterns for body and corner eyes. Set bodyPattern to circle, cornerEyePattern to circle. Keep the same color scheme and ensure eyeColor and dotColor match fgColor.",
  },
  {
    displayContent: "Simplify @Current Style to circle dots",
    prompt:
      "Simplify @Current Style by changing bodyPattern to circle. Keep corner eyes with rounded pattern. Maintain all color values and set eyeColor and dotColor to match foreground.",
  },
  {
    displayContent: "Make @Current Style more professional",
    prompt:
      "Refine @Current Style for professional use. Change patterns to rounded or gear, ensure colors are sophisticated with good contrast. Set eyeColor and dotColor to match foreground.",
  },
];
