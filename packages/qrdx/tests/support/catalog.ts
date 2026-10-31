// Shared setup for the catalog tests (tests/catalog-*.test.ts): the values
// added after 0.0.46, the partners that are skipped because they fail on
// their own, and the decode helpers.

import { getFrameDimensions } from "../../src/frame";
import type { QRFrame, QRProps } from "../../types";
import { CORNER_EYE_DOT_PATTERNS } from "../../types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../../types/corner-eye";
import { FRAME_STYLES } from "../../types/frame";
import { BODY_PATTERN } from "../../types/image-pattern";
import { capture, PHONE_MODULE_SIZES, renderSvg, symbolSize } from "./qr";
import { decodeQR, rasterizeSvg, simulateCamera } from "./raster";

export const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
export const LEVELS = ["L", "M", "Q", "H"] as const;

export const newValues = <T extends string>(all: readonly T[], first: T) =>
  all.slice(all.indexOf(first));

export const NEW_BODIES = newValues(BODY_PATTERN, "horizontal-line");
export const NEW_EYES = newValues(CORNER_EYE_PATTERNS, "leaf");
export const NEW_DOTS = newValues(CORNER_EYE_DOT_PATTERNS, "leaf");
export const NEW_FRAMES = newValues(FRAME_STYLES, "banner-top-bottom");

// Existing options that fail with nearly every partner (pre-existing bugs,
// see known-issues.ts). circle-mixed was here until its dots grew.
export const WEAK_BODIES = new Set<string>([]);
export const WEAK_DOTS = new Set<string>(["diamond", "banner"]);

export const PLAIN = {
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
} as const;

// A busy two-color logo, as an SVG data URI the rasterizer paints
export const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/><circle cx="32" cy="32" r="18" fill="#fbbf24"/></svg>'
)}`;

// Light modules on a dark code that keeps its own dark quiet zone
export const INVERTED = {
  margin: 4,
  fgColor: "#ffffff",
  bgColor: "#111827",
} as const;

/** Pixels per module that fail to decode through the camera model. */
export function unreadable(
  props: Partial<QRProps>,
  sizes: readonly number[] = PHONE_MODULE_SIZES,
  page?: string
) {
  const full: QRProps = { value: VALUE, size: 256, level: "M", ...props };
  return sizes.filter(
    (modulePx) => capture(full, { modulePx, page }) !== VALUE
  );
}

/** Conditions every new value is checked under, beyond the cross matrix. */
export function conditions(style: Partial<QRProps>): [string, () => boolean][] {
  const decodesAt = (
    props: Partial<QRProps>,
    modulePx: number,
    page?: string
  ) =>
    capture(
      { value: VALUE, size: 256, ...style, ...props },
      { modulePx, page }
    ) === VALUE;
  const modules = (level: (typeof LEVELS)[number]) => symbolSize(VALUE, level);
  return [
    ...LEVELS.map((level): [string, () => boolean] => [
      `level ${level}`,
      () => PHONE_MODULE_SIZES.every((px) => decodesAt({ level }, px)),
    ]),
    [
      "148 px on screen",
      () => decodesAt({ level: "M", size: 148 }, 148 / modules("M")),
    ],
    // A large render photographed close up. (The camera model's blur grows
    // with the module, so past ~15 px per module it defeats jsQR even for
    // plain square codes.)
    ["640 px render, close-up", () => decodesAt({ level: "M", size: 640 }, 12)],
    ["1024 px render", () => decodesAt({ level: "M", size: 1024 }, 9)],
    [
      "inverted (light on dark)",
      () =>
        PHONE_MODULE_SIZES.every((px) =>
          decodesAt(
            { level: "M", margin: 4, fgColor: "#ffffff", bgColor: "#111827" },
            px,
            "#111827"
          )
        ),
    ],
    [
      "brand colors",
      () =>
        PHONE_MODULE_SIZES.every((px) =>
          decodesAt(
            {
              level: "M",
              fgColor: "#1e3a8a",
              bgColor: "#fef3c7",
              eyeColor: "#7c2d12",
              dotColor: "#166534",
            },
            px
          )
        ),
    ],
    [
      "centre logo at H",
      () =>
        PHONE_MODULE_SIZES.every((px) =>
          decodesAt(
            {
              level: "H",
              imageSettings: {
                src: LOGO,
                width: 56,
                height: 56,
                excavate: true,
              },
            },
            px
          )
        ),
    ],
  ];
}

export const FRAME_TEXT: Partial<QRFrame> = {
  text: "Scan me",
  secondaryText: "qrdx.dev",
};

/** Decodes a framed render through the camera model at `modulePx`. */
export function captureFramed(props: QRProps, modulePx: number) {
  const svg = renderSvg(props);
  const size = props.size ?? 256;
  const modules = symbolSize(props.value, props.level);
  const { width } = getFrameDimensions(size, props.frame);
  const scale = (modules * modulePx) / size;
  const image = rasterizeSvg(svg, { width: width * scale, pad: 4 * modulePx });
  return decodeQR(simulateCamera(image, modulePx));
}

/** Records the calls drawFrameOnCanvas makes. */
export function recordCanvas() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, key: string) {
        return (...args: unknown[]) => {
          calls.push(`${key}${key === "fillText" ? `:${args[0]}` : ""}`);
        };
      },
      set(_target, key: string, value: unknown) {
        calls.push(`${key}=${value}`);
        return true;
      },
    }
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
