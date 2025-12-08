export const PROMPTS = {
  modernMinimal: {
    label: "Modern Minimal",
    prompt:
      "Create a clean, modern QR code with rounded patterns throughout. Use black foreground on white background with matching eye colors. Set bodyPattern to rounded, cornerEyePattern to rounded, and cornerEyeDotPattern to rounded. Keep moderate margin.",
  },
  vibrantColorful: {
    label: "Vibrant & Colorful",
    prompt:
      "Generate a vibrant, eye-catching QR code with bold colors. Use a bright, saturated foreground color with high contrast background. Set all eye colors to match the foreground. Use dots or extraRounded patterns for a playful look. Larger size for impact.",
  },
  elegantClassic: {
    label: "Elegant Classic",
    prompt:
      "Create an elegant QR code with classy and classyRounded patterns. Use sophisticated dark colors like navy or charcoal on a light cream or white background. Ensure eyeColor and dotColor match the foreground for consistency. Clean, professional aesthetic.",
  },
  fluidArtistic: {
    label: "Fluid & Artistic",
    prompt:
      "Design an artistic QR code with fluid patterns throughout. Set bodyPattern, cornerEyePattern to fluid. Use creative color combinations with good contrast. All eye colors should complement the main foreground color. Slightly larger margin for breathing room.",
  },
  highContrast: {
    label: "High Contrast",
    prompt:
      "Create a high contrast QR code optimized for scanning. Use pure black foreground on pure white background, or vice versa. Square or extraRounded patterns. Match all eye colors to foreground. Standard size with appropriate margin for clarity.",
  },
  softRounded: {
    label: "Soft & Rounded",
    prompt:
      "Generate a friendly QR code with soft, rounded aesthetics. Use extraRounded patterns for body, eyes, and eye dots. Choose warm, approachable colors with sufficient contrast. All eye colors should match the main color scheme. Comfortable margin spacing.",
  },
  dotMatrix: {
    label: "Dot Matrix",
    prompt:
      "Create a dot-style QR code with dots pattern for the body and rounded patterns for corner eyes. Use complementary colors with strong contrast. Ensure eyeColor and dotColor match the foreground color. Medium to large size for dot visibility.",
  },
  neonGlow: {
    label: "Neon Glow",
    prompt:
      "Design a neon-inspired QR code with vibrant electric colors. Use bright neon foreground color (like cyan, magenta, or lime) on dark background (black or deep purple). Fluid or extraRounded patterns. Match all eye colors to the neon foreground for consistency.",
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
      "Create a retro gaming QR code with square patterns throughout. Use vibrant pixel-art inspired colors like bright red or blue on dark background. Set bodyPattern to square, all eye patterns to square for authentic retro feel.",
  },
  {
    displayContent: "Pastel gradient with soft rounded edges",
    prompt:
      "Create a soft pastel QR code with gentle color gradients. Use light pastel colors like soft pink or lavender for foreground on cream background. ExtraRounded patterns for body and eyes. All eye colors matching the pastel foreground.",
  },
  {
    displayContent: "Corporate professional with blue tones",
    prompt:
      "Generate a professional corporate QR code with navy blue or corporate blue foreground on white background. Use classyRounded patterns for sophisticated look. Match all eye colors to the blue foreground. Clean margins.",
  },
  {
    displayContent: "Sunset gradient vibes with warm colors",
    prompt:
      "Create a sunset-inspired QR code with warm orange or coral foreground on peachy background. Use fluid or rounded patterns. All eye colors should match the warm foreground color for consistency. Artistic yet scannable.",
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
      "Take @Current Style and make all patterns more rounded. Change bodyPattern, cornerEyePattern, and cornerEyeDotPattern to rounded or extraRounded variants. Keep all colors the same.",
  },
  {
    displayContent: "Add more contrast to @Current Style",
    prompt:
      "Enhance @Current Style with higher contrast. Make background lighter or darker to increase contrast with foreground. Ensure all eye colors remain consistent with foreground for better scanability.",
  },
  {
    displayContent: "Make @Current Style more fluid and artistic",
    prompt:
      "Transform @Current Style to use fluid patterns for body and corner eyes. Keep the same color scheme but make patterns more organic and flowing.",
  },
  {
    displayContent: "Simplify @Current Style to dots pattern",
    prompt:
      "Simplify @Current Style by changing bodyPattern to dots while keeping corner eyes distinct. Maintain all color values and ensure eye colors match foreground.",
  },
  {
    displayContent: "Make @Current Style more professional",
    prompt:
      "Refine @Current Style for professional use. Change patterns to classy or classyRounded, ensure colors are sophisticated with good contrast. Match all eye colors to foreground.",
  },
];
