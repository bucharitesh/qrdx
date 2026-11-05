/** biome-ignore-all lint/style/noMagicNumbers: versions, levels and sizes under test */
// Logos passed straight in as `imageSettings` (library users, the image API)
// get the same Reed–Solomon cap as `logo` + `logoOptions` (logo-budget.ts):
// the renderers shrink them, around their own center, to the largest size
// every block can repair, and the capped code decodes with jsQR through the
// camera model at three phone distances.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { getQRAsSVG } from "../src/api";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRData } from "../src/helpers";
import { capImageSettings, getLogoBlockDamage } from "../src/logo-budget";
import type { ErrorLevel, ImageSettings, QRProps } from "../types";
import { capture, PHONE_MODULE_SIZES, renderSvg } from "./support/qr";
import {
  createImage,
  decodeQR,
  rasterizeSvg,
  simulateCamera,
  toPng,
} from "./support/raster";

const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
const VERSIONS = [1, 2, 3, 4, 5, 6];
const SIZE = 256;
const MARGIN = 4;

/** The longest text that encodes at exactly `version` and `level` (no boost). */
function valueFor(version: number, level: ErrorLevel): string {
  let best = "";
  for (let length = 1; length < 200; length++) {
    const value = "qrdx.dev/scan-me-".repeat(12).slice(0, length);
    const qr = qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]);
    if (qr.version > version) break;
    if (
      qr.version === version &&
      qr.errorCorrectionLevel === ERROR_LEVEL_MAP[level]
    ) {
      best = value;
    }
  }
  return best;
}

const CASES = VERSIONS.flatMap((version) =>
  LEVELS.map((level) => ({ version, level, value: valueFor(version, level) }))
).filter((c) => c.value);

let LOGO = "";
beforeAll(async () => {
  const png = await toPng(createImage(32, 32, "#7a7a7a"));
  LOGO = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
});

const square = {
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
} as const;

function rawProps(
  value: string,
  level: ErrorLevel,
  share: number,
  extra: Partial<ImageSettings> = {}
): QRProps {
  const width = SIZE * share;
  return {
    value,
    size: SIZE,
    margin: MARGIN,
    level,
    ...square,
    imageSettings: {
      src: LOGO,
      width,
      height: width,
      excavate: true,
      ...extra,
    },
  };
}

/** Width, height, x and y of the logo <image> QRCodeSVG drew. */
function drawnLogo(svg: string) {
  const tag = svg.match(/<image\b[^>]*>/)?.[0];
  if (!tag) return null;
  const attr = (name: string) =>
    Number(tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);
  return {
    width: attr("width"),
    height: attr("height"),
    x: attr("x"),
    y: attr("y"),
  };
}

describe("raw imageSettings are capped like logo + logoOptions", () => {
  for (const { version, level, value } of CASES) {
    it(`version ${version}-${level}: a 30% logo is capped and decodes`, () => {
      const props = rawProps(value, level, 0.3);
      const capped = capImageSettings(
        { value, size: SIZE, margin: MARGIN, level },
        props.imageSettings
      );
      if (capped) {
        const damage = getLogoBlockDamage(
          { value, size: SIZE, margin: MARGIN, level },
          capped
        );
        expect(damage && damage.worst <= damage.budget).toBe(true);
      }
      // The same cap getQRData gives a 30% logo
      const viaLogo = getQRData({
        value,
        size: SIZE,
        margin: MARGIN,
        level,
        logo: props.imageSettings?.src,
        logoOptions: { size: 0.3 },
      }).imageSettings;
      expect(capped?.width ?? 0).toBeCloseTo(viaLogo?.width ?? 0, 6);

      const misses = PHONE_MODULE_SIZES.filter(
        (modulePx) => capture(props, { modulePx }) !== value
      );
      expect(misses).toEqual([]);
    });
  }

  it("draws the capped size, centered where the caller put it", () => {
    const value = valueFor(2, "L");
    // Placed off-center: the cap shrinks it around its own middle
    const props = rawProps(value, "L", 0.3, { x: 70, y: 60 });
    const capped = capImageSettings(
      { value, size: SIZE, margin: MARGIN, level: "L" },
      props.imageSettings
    );
    expect(capped).toBeDefined();
    const requested = SIZE * 0.3;
    const width = capped?.width ?? 0;
    expect(width).toBeLessThan(requested);
    expect((capped?.x ?? 0) + width / 2).toBeCloseTo(70 + requested / 2, 6);
    expect((capped?.y ?? 0) + width / 2).toBeCloseTo(60 + requested / 2, 6);
    const drawn = drawnLogo(renderSvg(props));
    expect(drawn?.width).toBeLessThan(requested * 0.99);
  });

  it("keeps a logo that already fits exactly as passed", () => {
    const value = valueFor(6, "H");
    const props = rawProps(value, "H", 0.2, { padding: 3 });
    expect(
      capImageSettings(
        { value, size: SIZE, margin: MARGIN, level: "H" },
        props.imageSettings
      )
    ).toBe(props.imageSettings);
  });

  it("keeps the aspect ratio of a wide logo", () => {
    const value = valueFor(2, "M");
    const props = rawProps(value, "M", 0.3, { height: SIZE * 0.15 });
    const capped = capImageSettings(
      { value, size: SIZE, margin: MARGIN, level: "M" },
      props.imageSettings
    );
    expect(capped).toBeDefined();
    expect((capped?.width ?? 0) / (capped?.height ?? 1)).toBeCloseTo(2, 6);
  });

  it("drops a logo when not even a sliver fits", () => {
    const value = valueFor(1, "L");
    const props = rawProps(value, "L", 0.3, { padding: 40 });
    expect(
      capImageSettings(
        { value, size: SIZE, margin: MARGIN, level: "L" },
        props.imageSettings
      )
    ).toBeUndefined();
    expect(renderSvg(props)).not.toMatch(/<image\b/);
  });

  it("caps getQRAsSVG too, and its code decodes", async () => {
    const value = valueFor(2, "L");
    const props = rawProps(value, "L", 0.3);
    const svg = renderToStaticMarkup(await getQRAsSVG(props));
    // This renderer draws in modules (its viewBox is the module grid)
    const modules = qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP.L).size;
    const requested = 0.3 * (modules + 2 * MARGIN);
    expect(drawnLogo(svg)?.width ?? 0).toBeLessThan(requested * 0.99);
    for (const modulePx of PHONE_MODULE_SIZES) {
      const image = rasterizeSvg(svg, {
        width: (modules + 2 * MARGIN) * modulePx,
        pad: 4 * modulePx,
        background: "#ffffff",
      });
      expect(decodeQR(simulateCamera(image, modulePx)), `${modulePx}px`).toBe(
        value
      );
    }
  });
});
