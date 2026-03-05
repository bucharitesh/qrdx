export const PROMPTS = {
  modernMinimal: {
    label: "Modern Minimal",
    prompt:
      "Create a clean, modern QR code with rounded patterns throughout. Use black foreground on white background with matching eye colors. Set bodyPattern to rounded, cornerEyePattern to rounded, and cornerEyeDotPattern to rounded. Keep moderate margin.",
  },
  vibrantColorful: {
    label: "Vibrant & Colorful",
    prompt:
      "Generate a vibrant, eye-catching QR code with bold colors. Use a bright, saturated foreground color with high contrast background. Set eyeColor and dotColor to match fgColor. Use circle or rounded patterns for a playful look. Larger size for impact.",
  },
  elegantClassic: {
    label: "Elegant Classic",
    prompt:
      "Create an elegant QR code with rounded and gear patterns. Use sophisticated dark colors like navy or charcoal on a light cream or white background. Ensure eyeColor and dotColor match the foreground for consistency. Clean, professional aesthetic.",
  },
  fluidArtistic: {
    label: "Fluid & Artistic",
    prompt:
      "Design an artistic QR code with circle patterns throughout. Set bodyPattern to circle, cornerEyePattern to circle, cornerEyeDotPattern to rounded. Use creative color combinations with good contrast. Set eyeColor and dotColor to match fgColor. Slightly larger margin for breathing room.",
  },
  highContrast: {
    label: "High Contrast",
    prompt:
      "Create a high contrast QR code optimized for scanning. Use pure black foreground on pure white background, or vice versa. Square or rounded patterns. Match eyeColor and dotColor to fgColor. Standard size with appropriate margin for clarity.",
  },
  softRounded: {
    label: "Soft & Rounded",
    prompt:
      "Generate a friendly QR code with soft, rounded aesthetics. Use rounded or extra-rounded patterns for body and eyes. Choose warm, approachable colors with sufficient contrast. Set eyeColor and dotColor to match fgColor. Comfortable margin spacing.",
  },
  dotMatrix: {
    label: "Dot Matrix",
    prompt:
      "Create a dot-style QR code with circle pattern for the body and rounded patterns for corner eyes. Use complementary colors with strong contrast. Set eyeColor and dotColor to match the foreground color. Medium to large size for dot visibility.",
  },
  neonGlow: {
    label: "Neon Glow",
    prompt:
      "Design a neon-inspired QR code with vibrant electric colors. Use bright neon foreground (cyan, magenta, or lime) on dark background (black or deep purple). Use circle patterns for body and corner eyes. Set eyeColor and dotColor to match fgColor for consistent neon look.",
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
