// Props covering every part of the renderer, for the parity tests
// (tests/core-parity.test.ts): the React-free core must write the same SVG
// as the React components, byte for byte, for each of them.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { createQRArtImage } from "../../src/art";
import { BUILT_IN_FRAME_SPECS } from "../../src/frames/builtin";
import { getOfficialFrame } from "../../src/frames/official";
import type { LogoOptions, QRPropsSVG, TemplateDefinition } from "../../types";
import { CORNER_EYE_DOT_PATTERNS } from "../../types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../../types/corner-eye";
import { FRAME_STYLES } from "../../types/frame";
import { BODY_PATTERN } from "../../types/image-pattern";
import { rasterizeSvg } from "./raster";

/** `QRCodeSVG` props, plus `QRCode`'s logo API for "code" cases. */
export type ParityProps = QRPropsSVG & {
  logo?: string;
  logoOptions?: LogoOptions;
  hideLogo?: boolean;
  scale?: number;
};

export interface ParityCase {
  name: string;
  props: ParityProps;
  /** "svg": compare with <QRCodeSVG>; "code": with <QRCode> (logo API) */
  component: "svg" | "code";
}

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
// A path, not `new URL(…, import.meta.url)`: under the jsdom environment Vite
// rewrites that pattern to an http:// asset URL, which readFileSync refuses.
const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/art"
);

const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/><circle cx="32" cy="32" r="18" fill="#fbbf24"/></svg>'
)}`;

const linear = (angle: number, a: string, b: string) => ({
  type: "linear" as const,
  angle,
  stops: [
    { color: a, offset: 0 },
    { color: b, offset: 100 },
  ],
});

/** A 24 × 24 rounded blob, roomy enough to hold a code. */
function silhouette() {
  const side = 24;
  let cells = "";
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = (x + 0.5 - side / 2) / (side / 2);
      const dy = (y + 0.5 - side / 2) / (side / 2);
      cells += dx ** 4 + dy ** 4 <= 1 ? "1" : "0";
    }
  }
  return { type: "silhouette" as const, width: side, height: side, cells };
}

/** The README's custom template, written with React elements. */
const reactTemplate: TemplateDefinition<{ label?: string }> = {
  id: "Framed",
  name: "Framed",
  wrapper: (children, props) =>
    createElement(
      "svg",
      {
        style: { width: "100%" },
        viewBox: "0 0 300 340",
        xmlns: "http://www.w3.org/2000/svg",
      },
      createElement(
        "g",
        { transform: "translate(20, 20) scale(0.87)" },
        children
      ),
      createElement(
        "text",
        { x: "150", y: "325", textAnchor: "middle", fill: props?.fgColor },
        props?.label
      )
    ),
};

/** A colorful test picture: hue across, light down, a dark disc. */
function syntheticPhoto(side: number) {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      const disc = (x - side / 2) ** 2 + (y - side / 2) ** 2 < (side / 4) ** 2;
      data[i] = disc ? 40 : (x * 255) / side;
      data[i + 1] = disc ? 30 : (y * 255) / side;
      data[i + 2] = disc ? 60 : 255 - (x * 128) / side;
      data[i + 3] = 255;
    }
  }
  return { data, width: side, height: side };
}

let artImages: ReturnType<typeof makeArtImages> | null = null;
function makeArtImages() {
  const logo = createQRArtImage(
    rasterizeSvg(readFileSync(join(FIXTURES, "leaf.svg"), "utf8"), {
      width: 256,
      background: null,
    }),
    { maxSize: 64 }
  );
  const photo = createQRArtImage(syntheticPhoto(96), {
    maxSize: 64,
    square: true,
  });
  return { logo, photo };
}

/** Official frames sampled for the parity matrix (all of them with `all`). */
const OFFICIAL_SAMPLE = [
  "wifi-card",
  "cafe-menu-board",
  "app-phone-dark",
  "christmas-wreath",
  "diwali-diya",
];

export function parityCases(
  options: { allOfficialFrames?: string[] } = {}
): ParityCase[] {
  artImages ??= makeArtImages();
  const { logo, photo } = artImages;
  const cases: ParityCase[] = [];
  const add = (
    name: string,
    props: Partial<ParityProps>,
    component: ParityCase["component"] = "svg"
  ) =>
    cases.push({
      name,
      props: { value: VALUE, size: 256, ...props },
      component,
    });

  // Every body pattern, eye and eye dot
  BODY_PATTERN.forEach((bodyPattern, index) => {
    add(`body ${bodyPattern}`, {
      bodyPattern,
      cornerEyePattern: CORNER_EYE_PATTERNS[index % CORNER_EYE_PATTERNS.length],
      cornerEyeDotPattern:
        CORNER_EYE_DOT_PATTERNS[index % CORNER_EYE_DOT_PATTERNS.length],
    });
  });
  for (const cornerEyePattern of CORNER_EYE_PATTERNS) {
    add(`eye ${cornerEyePattern}`, { cornerEyePattern, bodyPattern: "square" });
  }
  for (const cornerEyeDotPattern of CORNER_EYE_DOT_PATTERNS) {
    add(`eye dot ${cornerEyeDotPattern}`, {
      cornerEyeDotPattern,
      bodyPattern: "rounded",
    });
  }
  add("defaults", {});
  add("level L, margin 4, moduleScale", {
    level: "L",
    margin: 4,
    moduleScale: 0.7,
  });
  add("moduleScale on a connected body", {
    bodyPattern: BODY_PATTERN.at(-1),
    moduleScale: 0.6,
  });
  add("unicode and markup in the value", { value: "Grüße 👋 <script>&'\"" });
  add("fractional size", { size: 333.3 });

  // Colors
  add("linear gradient", { fgColor: linear(135, "#6366f1", "#ec4899") });
  add("radial background", {
    bgColor: {
      type: "radial",
      stops: [
        { color: "#ffffff", offset: 0 },
        { color: "#e2e8f0", offset: 100 },
      ],
    },
  });
  add("angular gradient", {
    fgColor: {
      type: "angular",
      angle: 30,
      stops: [
        { color: "#0f172a", offset: 0 },
        { color: "#7c3aed", offset: 50 },
        { color: "#0f172a", offset: 100 },
      ],
    },
  });
  add("angular eyes with alpha", {
    eyeColor: {
      type: "angular",
      stops: [
        { color: "#1d4ed8cc", offset: 0 },
        { color: "#9333ea99", offset: 100 },
      ],
    },
    dotColor: "rgba(220, 38, 38, 0.8)",
  });
  add("alpha colors", { fgColor: "#1d4ed8cc", bgColor: "#fef3c7" });
  add("eye and dot colors", { eyeColor: "#be123c", dotColor: "#0f766e" });
  add("per-eye colors", {
    eyeColors: {
      topLeft: { outer: "#dc2626", inner: linear(0, "#000", "#444") },
      topRight: { outer: linear(90, "#16a34a", "#065f46") },
      bottomLeft: { inner: "#2563eb" },
    },
  });
  add("image fills", {
    level: "H",
    fgColor: { type: "image", src: LOGO, opacity: 0.85, underlay: "#1f2937" },
    bgColor: {
      type: "image",
      src: LOGO,
      fit: "tile",
      scale: 0.5,
      underlay: "#ffffff",
    },
  });
  add("image fill contain, positioned", {
    level: "H",
    fgColor: {
      type: "image",
      src: LOGO,
      fit: "contain",
      position: "top-left",
      scale: 0.8,
    },
  });
  add("transparent background", { bgColor: "transparent" });

  // Logos
  add("logo imageSettings", {
    level: "H",
    imageSettings: { src: LOGO, width: 64, height: 64, excavate: true },
  });
  add("logo not excavated, positioned", {
    level: "H",
    imageSettings: {
      src: LOGO,
      width: 40,
      height: 40,
      excavate: false,
      x: 20,
      y: 30,
    },
  });
  add("logo circle on a plate", {
    level: "H",
    imageSettings: {
      src: LOGO,
      width: 56,
      height: 56,
      excavate: true,
      padding: 4,
      shape: "circle",
      plate: "#ffffff",
    },
  });
  add("logo with autoLevel", {
    level: "L",
    autoLevel: true,
    imageSettings: { src: LOGO, width: 80, height: 80, excavate: true },
  });
  add("logo API", { logo: LOGO, level: "H" }, "code");
  add(
    "logo API with options",
    {
      logo: LOGO,
      level: "H",
      logoOptions: {
        size: 0.22,
        padding: 1,
        x: 0.4,
        y: 0.6,
        shape: "rounded",
        plate: "#fef9c3",
      },
      autoLevel: true,
    },
    "code"
  );
  add(
    "logo API hidden, scaled",
    { logo: LOGO, hideLogo: true, scale: 2 },
    "code"
  );
  add(
    "logo API with frame, gradient and markers",
    {
      logo: LOGO,
      level: "Q",
      fgColor: linear(45, "#0ea5e9", "#1e3a8a"),
      frame: { style: "banner-bottom", text: "Scan me" },
      partMarkers: true,
      frameLabelMarkers: true,
      style: { width: "100%" },
    },
    "code"
  );
  add("plain QRCode", { bodyPattern: "diamond", eyeColor: "#111" }, "code");
  add("OG context logo", {
    isOGContext: true,
    imageSettings: {
      src: LOGO,
      width: 48,
      height: 48,
      excavate: true,
      shape: "rounded",
      plate: "#fff",
    },
  });
  add("OG context circle logo", {
    isOGContext: true,
    imageSettings: {
      src: LOGO,
      width: 48,
      height: 48,
      excavate: true,
      shape: "circle",
    },
  });

  // Frames: every built-in style, the built-in specs and official frames
  for (const style of FRAME_STYLES) {
    if (style === "none") {
      continue;
    }
    add(`frame ${style}`, {
      frame: {
        style,
        text: 'Scan <me> & "go"',
        color: "#1e3a8a",
        secondaryText: "Menu",
      },
    });
  }
  add("frame without text", { frame: { style: "banner-top", text: "" } });
  add("frame label markers", {
    frame: { style: "banner-top-bottom", text: "Top", secondaryText: "Bottom" },
    frameLabelMarkers: true,
  });
  for (const [style, spec] of Object.entries(BUILT_IN_FRAME_SPECS)) {
    add(`built-in spec ${style}`, {
      frame: { style: "custom", spec, color: "#7c2d12", text: "Hi" },
    });
  }
  const officialIds = options.allOfficialFrames ?? OFFICIAL_SAMPLE;
  for (const id of officialIds) {
    const official = getOfficialFrame(id);
    if (official) {
      add(`official frame ${id}`, {
        frame: {
          style: "custom",
          spec: official.spec,
          secondaryText: "Harbour Guest",
        },
        frameLabelMarkers: true,
      });
    }
  }

  // Shapes
  add("circle shape", { shape: "circle", margin: 3 });
  add("heart shape with gradient", {
    shape: "heart",
    fgColor: linear(90, "#be123c", "#881337"),
  });
  add("silhouette shape", { shape: silhouette() });
  add("circle shape, angular, markers", {
    shape: "circle",
    partMarkers: true,
    fgColor: {
      type: "angular",
      stops: [
        { color: "#111827", offset: 0 },
        { color: "#2563eb", offset: 100 },
      ],
    },
  });

  // Art
  add("art logo blend", {
    level: "H",
    art: { mode: "logo", image: logo, intensity: 0.7 },
  });
  add("art logo badge", {
    level: "H",
    art: { mode: "logo", variant: "badge", image: logo },
  });
  add("art halftone color", {
    level: "H",
    art: { mode: "halftone", image: photo, intensity: 0.6 },
  });
  add("art halftone mono, markers", {
    level: "H",
    partMarkers: true,
    art: { mode: "halftone", variant: "mono", image: photo },
  });
  add("art on a circle code", {
    level: "H",
    shape: "circle",
    art: { mode: "logo", image: logo },
  });

  // Part markers
  add("part markers", {
    partMarkers: true,
    level: "H",
    imageSettings: { src: LOGO, width: 56, height: 56, excavate: true },
  });
  add("part markers with a template", {
    partMarkers: true,
    templateId: "Arrow",
  });

  // Templates
  for (const templateId of [
    "default",
    "Arrow",
    "StandardBox",
    "SquareBorder",
    "StrikedBox",
    "Halloween",
    "DotRing",
  ]) {
    add(`template ${templateId}`, {
      templateId,
      fgColor: "#111827",
      bgColor: linear(0, "#ffffff", "#f1f5f9"),
    });
  }
  add("template with frame and attributes", {
    templateId: "Arrow",
    frame: { style: "rounded-border" },
    className: "qr",
    style: { maxWidth: 200 },
  });
  add("template with a logo", {
    templateId: "StandardBox",
    level: "H",
    imageSettings: { src: LOGO, width: 48, height: 48, excavate: true },
  });
  // Dot ring: text on the ring, colors and strokes, a caller's logo
  add("dot ring template with custom props", {
    templateId: "DotRing",
    level: "H",
    bodyPattern: "circle-large",
    customProps: {
      customText: "Scan <me> & see",
      textPosition: "bottom",
      textRotation: 12,
      textColor: "#fde047",
      fontSize: 28,
      fontWeight: 700,
      fontLetterSpacing: 2,
      outerCircleColor: "#1e3a8a",
      strokeWidth: 3,
      innerStrokeColor: "#fde047",
    },
  });
  add("dot ring template with a logo", {
    templateId: "DotRing",
    level: "H",
    imageSettings: { src: LOGO, width: 48, height: 48, excavate: true },
  });
  add("React custom template", {
    customTemplate: reactTemplate,
    customProps: { label: "Scan <me>" },
  });

  // Root attributes
  add("root attributes", {
    className: "qr-code",
    id: "main-code",
    role: "img",
    "aria-label": "QR code for qrdx.dev",
    style: {
      width: "100%",
      height: "auto",
      opacity: 0.9,
      zIndex: 2,
      marginTop: 4,
    },
    ...({
      "data-testid": "qr",
      tabIndex: 0,
      focusable: false,
      onClick: () => undefined,
      "aria-hidden": false,
    } as Partial<ParityProps>),
  });
  add("root attributes with frame", {
    frame: { style: "polaroid", text: "Hello" },
    className: "framed",
    "aria-hidden": true,
  });

  return cases;
}
