// The home page gallery (lib/landing/showcase-gallery.ts): every code shown
// must scan, so a style or engine change can't ship one that doesn't. Each
// code is drawn with the same props the image route renders and decoded:
// - the product's scan score (camera blur, contrast loss, jsQR at three
//   sizes), the bar the editor shows;
// - a real render through the phone-camera model at 160 and 320 px, once per
//   gradient stop (the test rasterizer paints gradients with one stop);
// - a crisp render with no blur, the way a screenshot or a print reads;
// and the decoded text must be exactly the code's value.
import { getQRAsSVGDataUri, getScanScore, getStylePairRisk } from "qrdx";
import type { QRProps } from "qrdx/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GALLERY_CHECKER,
  GALLERY_CODES,
  GALLERY_FILTERS,
  type GalleryCode,
  galleryCodeProps,
} from "@/lib/landing/showcase-gallery";
import { loadGalleryAssets } from "@/lib/landing/showcase-gallery-assets";
import { getTemplate } from "@/lib/landing/templates";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { defaultPresets } from "@/utils/qr-presets";
import qrcodegen from "../../../../packages/qrdx/src/codegen";
import { ERROR_LEVEL_MAP } from "../../../../packages/qrdx/src/constants";
import { installFakeDom } from "../../../../packages/qrdx/tests/support/fake-dom";
import {
  decodeQR,
  rasterizeSvg,
  svgFromDataUri,
} from "../../../../packages/qrdx/tests/support/raster";
import {
  DECODE_SIZES,
  decodesAt,
  MIN_SCAN_SCORE,
  solidVariants,
} from "../../scripts/themes/judge";

/** The checkerboard's darker square behind the transparent tile. */
const CHECKER = GALLERY_CHECKER.dark;

async function propsFor(code: GalleryCode): Promise<QRProps> {
  return galleryCodeProps(code, await loadGalleryAssets(code));
}

/** Renders the code crisp (no camera blur) at `modulePx` and decodes it. */
async function decodesCrisp(
  props: QRProps,
  modulePx: number,
  background = "#ffffff",
): Promise<boolean> {
  const modules =
    qrcodegen.QrCode.encodeText(
      props.value,
      ERROR_LEVEL_MAP[props.level ?? "Q"],
    ).size +
    2 * (props.margin ?? 0);
  const width = modules * modulePx;
  const svg = svgFromDataUri(
    await getQRAsSVGDataUri({ ...props, size: width }),
  );
  if (!svg) return false;
  const image = rasterizeSvg(svg, { pad: modulePx * 4, background });
  return decodeQR(image) === props.value;
}

describe("gallery codes", () => {
  it("have unique ids and the same number in each filter (no layout shift)", () => {
    const ids = GALLERY_CODES.map((code) => code.id);
    expect(new Set(ids).size).toBe(ids.length);
    const counts = GALLERY_FILTERS.map(
      (filter) =>
        GALLERY_CODES.filter((code) => code.filter === filter.value).length,
    );
    expect(new Set(counts).size).toBe(1);
  });

  it("each use a different built-in theme", () => {
    const presets = GALLERY_CODES.map((code) => code.preset);
    for (const preset of presets) expect(defaultPresets).toHaveProperty(preset);
    expect(new Set(presets).size).toBe(presets.length);
    // Seasonal themes come and go; the gallery stays all year.
    for (const preset of presets) {
      expect(defaultPresets[preset]?.category, preset).not.toBe("seasonal");
    }
  });

  it("link to pages that exist", () => {
    for (const code of GALLERY_CODES) {
      const generator = /^\/qr-code-generator\/([\w-]+)$/.exec(code.href);
      const demo = /^\/templates\/([\w-]+)\/([\w-]+)$/.exec(code.href);
      if (generator) {
        expect(QR_TYPE_SLUGS, code.id).toContain(generator[1]);
      } else if (demo) {
        const variants = getTemplate(demo[1] as string)?.variants ?? [];
        expect(
          variants.map((variant) => variant.id),
          code.id,
        ).toContain(demo[2]);
      } else {
        expect(code.href, code.id).toMatch(/^\/(playground|docs\/)/);
      }
      if (code.appliesPreset) expect(code.href).toBe("/playground");
    }
  });

  it("hold obvious samples, not real people's details", () => {
    for (const { id, value } of GALLERY_CODES) {
      const hosts = [...value.matchAll(/https?:\/\/([^/?#]+)/g)].map(
        (match) => match[1],
      );
      for (const host of hosts) {
        expect(["qrdx.dev", "wa.me"], id).toContain(host);
      }
      for (const [address] of value.matchAll(/[\w.+-]+@[\w.-]+/g)) {
        expect(address, id).toMatch(/@example(\.com)?$/);
      }
      for (const [digits] of value.matchAll(/\+?1?415555\d{4}/g)) {
        expect(digits, id).toMatch(/55501\d\d$/);
      }
    }
  });
});

describe("gallery codes scan", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it.each(GALLERY_CODES.map((code) => [code.id, code] as const))(
    "%s",
    async (_id, code) => {
      const props = await propsFor(code);
      expect(getStylePairRisk(props), "weak body and eye pair").toBeNull();

      const variants = solidVariants(props);
      for (const variant of variants) {
        const { score, grade, checks } = await getScanScore(variant);
        const failed = checks.filter((c) => !c.passed).map((c) => c.id);
        expect(score, `scan score ${grade} [${failed}]`).toBeGreaterThanOrEqual(
          MIN_SCAN_SCORE,
        );
        // Light-on-dark codes score well but some scanner apps can't read
        // them (the scan score says so), so the gallery has none.
        expect(failed, "dark modules on a light background").not.toContain(
          "polarity",
        );
      }

      for (const [index, variant] of variants.entries()) {
        const stop = variants.length > 1 ? ` (gradient stop ${index + 1})` : "";
        for (const size of DECODE_SIZES) {
          expect(
            await decodesAt(variant, size),
            `camera ${size} px${stop}`,
          ).toBe(true);
        }
        for (const modulePx of [4, 6, 9]) {
          expect(
            await decodesCrisp(variant, modulePx),
            `crisp ${modulePx} px/module${stop}`,
          ).toBe(true);
          if (code.transparent) {
            expect(
              await decodesCrisp(variant, modulePx, CHECKER),
              `crisp ${modulePx} px/module on the checkerboard`,
            ).toBe(true);
          }
        }
      }
    },
  );
});
