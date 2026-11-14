export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  // "image/svg+xml",
];

export function validateSvgContent(svgText: string): boolean {
  try {
    const trimmed = svgText.trim();
    if (!trimmed.toLowerCase().includes("<svg")) {
      return false;
    }

    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i, // onclick, onload, etc.
      /<embed/i,
      /<object/i,
      /<iframe/i,
    ];

    return !dangerousPatterns.some((pattern) => pattern.test(svgText));
  } catch {
    return false;
  }
}

const LT = 0x3c; // <
const BANG = 0x21; // !
const DASH = 0x2d; // -
const GT = 0x3e; // >

/**
 * Removes every <!-- … --> comment, including one that only forms once an
 * inner comment is gone ("<!<!-- a -->-- b -->"). A single regex pass leaves
 * that second comment behind; repeating the pass until nothing changes is
 * quadratic on deeply nested input. This scan does it in one linear pass:
 * the earliest open "<!--" ends at the first "-->" after it, as the regex
 * would match it, and text on both sides of a removed comment joins up so a
 * comment it forms is found too.
 */
export function stripXmlComments(text: string): string {
  if (!text.includes("<!--")) return text;
  const out = new Uint16Array(text.length);
  let length = 0;
  let open = -1; // where the earliest unclosed "<!--" starts in `out`
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[length++] = code;
    if (open === -1) {
      if (
        code === DASH &&
        out[length - 2] === DASH &&
        out[length - 3] === BANG &&
        out[length - 4] === LT
      ) {
        open = length - 4;
      }
    } else if (
      code === GT &&
      out[length - 2] === DASH &&
      out[length - 3] === DASH &&
      length - 3 >= open + 4
    ) {
      length = open;
      open = -1;
    }
  }
  let result = "";
  for (let start = 0; start < length; start += 8192) {
    result += String.fromCharCode(
      ...out.subarray(start, Math.min(start + 8192, length)),
    );
  }
  return result;
}

export function optimizeSvgContent(svgText: string): string {
  try {
    return stripXmlComments(svgText)
      .replace(/>\s+</g, "><") // Remove unnecessary whitespace
      .trim();
  } catch {
    return svgText.trim();
  }
}
