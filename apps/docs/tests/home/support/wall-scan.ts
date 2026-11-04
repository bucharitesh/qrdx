// Shared by tests/home/gallery-scan-*.test.ts: every tile on the "Made with
// QRdx" walls must scan, so a style or engine change can't ship one that
// doesn't. Each code is drawn with the same props the image route renders,
// scored and decoded, and the decoded text must be exactly the tile's value:
// - the product's scan score (camera blur, contrast loss, jsQR at three
//   sizes) of at least 75, the bar the editor shows, with no known-weak pair;
// - a render through the phone-camera model, once per gradient stop (the
//   test rasterizer paints gradients with one stop);
// - a crisp render with no blur, the way a screenshot or a print reads.
//
// Curated tiles (content, frames, art) must decode through the camera at
// 160 and 320 px and crisp at 4, 6 and 9 px a module, as the home gallery's
// codes always had to. Theme tiles are the built-in library, which
// tests/themes/ already holds to the judge and the publish gate with fixed
// samples; here they must decode through the camera at 320 px and two of
// 160, 200 and 240, and crisp at one of 4, 6 and 9. jsQR on a perfectly
// sharp render misses decorative shapes at some exact sizes and not at
// others (one theme reads at 3, 4, 6 and 7 px a module but not 5 or 8), so
// a crisp miss at one size isn't a code that doesn't scan.
//
// Tiles marked `caution` (an option the score marks down that the community
// wall still shows) skip the score and pair checks and must decode at
// print size instead.
import { getQRAsSVGDataUri, getScanScore, getStylePairRisk } from "qrdx";
import type { QRProps } from "qrdx/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GALLERY_CHECKER,
  galleryCodeProps,
  WALL_TILES,
  type WallBand,
  type WallTile,
} from "@/lib/landing/showcase-gallery";
import { loadGalleryAssets } from "@/lib/landing/showcase-gallery-assets";
import { isInverted } from "@/lib/themes/color";
import qrcodegen from "../../../../../packages/qrdx/src/codegen";
import { ERROR_LEVEL_MAP } from "../../../../../packages/qrdx/src/constants";
import { installFakeDom } from "../../../../../packages/qrdx/tests/support/fake-dom";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
  svgFromDataUri,
} from "../../../../../packages/qrdx/tests/support/raster";
import {
  DECODE_SIZES,
  decodesAt,
  MIN_SCAN_SCORE,
  solidVariants,
} from "../../../scripts/themes/judge";

/** The checkerboard's darker square behind the transparent tile. */
const CHECKER = GALLERY_CHECKER.dark;
/** Artwork width a caution tile must read at (about 6 cm at 300 dpi). */
const PRINT_WIDTH = 720;
/**
 * Share of the artwork's width a border template draws the code at, at the
 * least (the Arrow and Halloween borders draw it smallest), so the camera
 * model blurs by the code's real module size.
 */
const TEMPLATE_CODE_SHARE = 0.4;

/** Renders the artwork `width` px wide, blurs it like a phone camera, decodes. */
async function readsInPrint(props: QRProps, width: number): Promise<boolean> {
  const svg = svgFromDataUri(
    await getQRAsSVGDataUri({ ...props, size: width }),
  );
  if (!svg) return false;
  const modules =
    qrcodegen.QrCode.encodeText(
      props.value,
      ERROR_LEVEL_MAP[props.level ?? "Q"],
    ).size +
    2 * (props.margin ?? 0);
  const share = props.templateId ? TEMPLATE_CODE_SHARE : 1;
  const image = rasterizeSvg(svg, { pad: 24, background: "#ffffff" });
  return (
    decodeQR(simulateCamera(image, (width * share) / modules)) === props.value
  );
}

/**
 * Older built-in themes that put a circle centre in rounded-corner eyes,
 * which the engine now flags as a sharp-render warning ("sharp-dot-eye":
 * jsQR misses it at some sizes, zbar reads it; the editor doesn't block it).
 * They're kept as they are for saved designs and ?preset= links; their tiles
 * still pass the score, camera and crisp checks. No new theme may join.
 */
const SHARP_RENDER_WARNINGS = new Set([
  "halloweenGhost",
  "christmasPine",
  "newYearMidnight",
]);

async function propsFor(tile: WallTile): Promise<QRProps> {
  return galleryCodeProps(tile, await loadGalleryAssets(tile));
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

async function expectScans(tile: WallTile) {
  const props = await propsFor(tile);
  const variants = solidVariants(props);
  // Light-on-dark is allowed only for the built-in themes that are so
  // (tests/themes/presets-gate.test.ts names them); the score says why.
  const inverted = isInverted(props.fgColor, props.bgColor);
  if (inverted)
    expect(tile.band, "light-on-dark outside the themes").toBe("themes");

  if (tile.caution) {
    for (const [index, variant] of variants.entries()) {
      const stop = variants.length > 1 ? ` (gradient stop ${index + 1})` : "";
      expect(
        await readsInPrint(variant, PRINT_WIDTH),
        `camera ${PRINT_WIDTH} px${stop}`,
      ).toBe(true);
      for (const modulePx of [6, 9]) {
        expect(
          await decodesCrisp(variant, modulePx),
          `crisp ${modulePx} px/module${stop}`,
        ).toBe(true);
      }
    }
    return;
  }

  const risk = getStylePairRisk(props);
  if (
    risk?.kind === "sharp-dot-eye" &&
    SHARP_RENDER_WARNINGS.has(tile.preset)
  ) {
    // A warning, not a block: every other check below still applies.
  } else {
    expect(risk, "weak body and eye pair").toBeNull();
  }
  for (const variant of variants) {
    const { score, grade, checks } = await getScanScore(variant);
    const failed = checks.filter((c) => !c.passed).map((c) => c.id);
    expect(score, `scan score ${grade} [${failed}]`).toBeGreaterThanOrEqual(
      MIN_SCAN_SCORE,
    );
    if (!inverted) {
      expect(failed, "dark modules on a light background").not.toContain(
        "polarity",
      );
    }
  }
  const theme = tile.band === "themes";
  for (const [index, variant] of variants.entries()) {
    const stop = variants.length > 1 ? ` (gradient stop ${index + 1})` : "";
    const camera = theme ? [160, 200, 240] : [...DECODE_SIZES];
    const read = [];
    for (const size of camera) {
      if (await decodesAt(variant, size)) read.push(size);
    }
    if (theme) {
      expect(await decodesAt(variant, 320), `camera 320 px${stop}`).toBe(true);
      expect(
        read.length,
        `camera reads at [${read}] px${stop}`,
      ).toBeGreaterThanOrEqual(2);
    } else {
      expect(read, `camera${stop}`).toEqual(camera);
    }
    // A sharp light-on-dark render reads only where the decoder inverts the
    // image; the camera checks above cover those older themes.
    if (theme && inverted) continue;
    for (const background of tile.transparent
      ? ["#ffffff", CHECKER]
      : ["#ffffff"]) {
      const crisp = [];
      for (const modulePx of [4, 6, 9]) {
        if (await decodesCrisp(variant, modulePx, background))
          crisp.push(modulePx);
      }
      const on = background === CHECKER ? " on the checkerboard" : "";
      if (theme) {
        expect(
          crisp.length,
          `crisp at [${crisp}] px/module${on}${stop}`,
        ).toBeGreaterThanOrEqual(1);
      } else {
        expect(crisp, `crisp px/module${on}${stop}`).toEqual([4, 6, 9]);
      }
    }
  }
}

/** One test per tile of `band`. */
export function describeBandScans(band: WallBand) {
  const tiles = WALL_TILES.filter((tile) => tile.band === band);
  describe(`${band} tiles scan`, () => {
    let uninstall: () => void;
    beforeAll(() => {
      uninstall = installFakeDom();
    });
    afterAll(() => uninstall());

    it("has tiles", () => expect(tiles.length).toBeGreaterThan(0));
    it.each(tiles.map((tile) => [tile.id, tile] as const))(
      "%s",
      async (_id, tile) => expectScans(tile),
    );
  });
}
