// getImageScanScore scores a photo or screenshot of a code. Its quiet-zone
// check looks at a ring just outside the code, which a tightly cropped image
// doesn't have: that check is "not checked" (skipped), never a pass.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getImageScanScore } from "../src/scan-score";
import type { QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { renderSvg } from "./support/qr";

const PLAIN: QRProps = {
  value: "https://qrdx.dev",
  size: 512,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

/** An <img> of the code, as the photo check gets one. */
function imageOf(props: QRProps): HTMLImageElement {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSvg(props))}`;
  return image;
}

async function quietZoneOf(props: QRProps) {
  const result = await getImageScanScore(imageOf(props), { sizes: [512] });
  expect(result.data).toBe("https://qrdx.dev");
  return result.checks.find((check) => check.id === "quiet-zone");
}

describe("getImageScanScore quiet zone", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it("can't check a code cropped to its edges, so it skips the check", async () => {
    const check = await quietZoneOf({ ...PLAIN, margin: 0 });
    expect(check).toMatchObject({ passed: true, skipped: true });
    expect(check?.message).toMatch(/cropped too tight/);
  });

  it("checks the quiet zone when the image has room around the code", async () => {
    const check = await quietZoneOf({ ...PLAIN, margin: 4 });
    expect(check?.passed).toBe(true);
    expect(check?.skipped).toBeUndefined();
  });
});
