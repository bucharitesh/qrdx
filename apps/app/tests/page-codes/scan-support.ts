// Shared by the page-code scan suites (scan-*.test.ts): the same checks the
// home gallery's codes pass (tests/home/gallery-scan.test.ts), so a theme,
// frame or engine change can't ship a sample code that doesn't scan.
// - the product's scan score (camera blur, contrast loss, jsQR at three
//   sizes), the bar the editor shows, with dark modules on a light ground;
// - a real render through the phone-camera model at 160 and 320 px, once per
//   gradient stop (the test rasterizer paints gradients with one stop);
// - a crisp render with no blur at 4, 6 and 9 px per module, the way a
//   screenshot or a print reads;
// and the decoded text must be exactly the code's value.
import { getQRAsSVGDataUri, getScanScore, getStylePairRisk } from "qrdx";
import type { QRProps } from "qrdx/types";
import { afterAll, beforeAll, expect, test } from "vitest";
import { type PageCode, pageCodeProps } from "@/lib/landing/page-codes";
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

/** Renders the code crisp (no camera blur) at `modulePx` and decodes it. */
async function decodesCrisp(props: QRProps, modulePx: number) {
  const modules =
    qrcodegen.QrCode.encodeText(
      props.value,
      ERROR_LEVEL_MAP[props.level ?? "Q"],
    ).size +
    2 * (props.margin ?? 0);
  const svg = svgFromDataUri(
    await getQRAsSVGDataUri({ ...props, size: modules * modulePx }),
  );
  if (!svg) return false;
  const image = rasterizeSvg(svg, { pad: modulePx * 4, background: "#ffffff" });
  return decodeQR(image) === props.value;
}

async function expectScans(code: PageCode) {
  const props = pageCodeProps(code);
  expect(getStylePairRisk(props), "weak body and eye pair").toBeNull();

  const variants = solidVariants(props);
  for (const variant of variants) {
    const { score, grade, checks } = await getScanScore(variant);
    const failed = checks.filter((c) => !c.passed).map((c) => c.id);
    expect(score, `scan score ${grade} [${failed}]`).toBeGreaterThanOrEqual(
      MIN_SCAN_SCORE,
    );
    expect(failed, "dark modules on a light background").not.toContain(
      "polarity",
    );
  }

  for (const [index, variant] of variants.entries()) {
    const stop = variants.length > 1 ? ` (gradient stop ${index + 1})` : "";
    for (const size of DECODE_SIZES) {
      expect(await decodesAt(variant, size), `camera ${size} px${stop}`).toBe(
        true,
      );
    }
    for (const modulePx of [4, 6, 9]) {
      expect(
        await decodesCrisp(variant, modulePx),
        `crisp ${modulePx} px/module${stop}`,
      ).toBe(true);
    }
  }
}

/** One test per code: it scans, and decodes to exactly its value. */
export function describeScans(codes: readonly PageCode[]) {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  test.each(codes.map((code) => [code.id, code] as const))(
    "%s",
    async (_id, code) => {
      await expectScans(code);
    },
  );
}
