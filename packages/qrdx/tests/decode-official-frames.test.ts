// Every official frame (src/frames/official) must scan, the way the theme
// and frame catalogues are held to it:
// - jsQR through the camera model (contrast loss + ¼-module blur) at the
//   phone distances, with a link, a Wi-Fi network and a contact card;
// - the same at 160 and 320 px code widths (the editor's scan check);
// - the product's scan score, which must be Great;
// - zbar on a crisp render, when `zbarimg` is installed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { getFrameDimensions } from "../src/frame";
import { OFFICIAL_FRAMES } from "../src/frames/official";
import {
  getScanScoreFromPixels,
  PIXEL_SCORE_MIN_CODE_WIDTH,
} from "../src/scan-score";
import type { AnyQRFrame, QRProps } from "../types";
import { captureFramed, PLAIN } from "./support/catalog";
import { SAMPLE_PAYLOADS } from "./support/frames";
import { PHONE_MODULE_SIZES, renderSvg, symbolSize } from "./support/qr";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
  toPng,
} from "./support/raster";

const PAYLOADS = Object.entries(SAMPLE_PAYLOADS);

const ZBAR = (() => {
  const probe = spawnSync("zbarimg", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
})();
const workDir = ZBAR ? mkdtempSync(join(tmpdir(), "qrdx-frames-")) : "";
afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

function propsFor(frame: AnyQRFrame, value: string, size = 256): QRProps {
  return { value, size, level: "M", frame };
}

/** Renders the code `codeWidth` px wide and decodes it through the camera model. */
function decodesAtWidth(props: QRProps, codeWidth: number): boolean {
  const artwork = getFrameDimensions(codeWidth, props.frame);
  const svg = renderSvg({ ...props, size: codeWidth });
  const modulePx = codeWidth / symbolSize(props.value, props.level);
  const image = rasterizeSvg(svg, {
    width: artwork.width,
    pad: Math.round(codeWidth * 0.12),
  });
  return decodeQR(simulateCamera(image, modulePx)) === props.value;
}

describe.each(OFFICIAL_FRAMES.map((frame) => [frame.id, frame] as const))(
  "%s",
  (_id, official) => {
    const frame: AnyQRFrame = { style: "custom", spec: official.spec };

    test("decodes a link, Wi-Fi and a contact at phone distances", () => {
      const failed: string[] = [];
      for (const [name, value] of PAYLOADS) {
        for (const px of PHONE_MODULE_SIZES) {
          if (captureFramed(propsFor(frame, value), px) !== value) {
            failed.push(`${name} at ${px} px/module`);
          }
        }
      }
      for (const px of PHONE_MODULE_SIZES) {
        if (
          captureFramed(
            { ...propsFor(frame, SAMPLE_PAYLOADS.link), ...PLAIN },
            px
          ) !== SAMPLE_PAYLOADS.link
        ) {
          failed.push(`plain modules at ${px} px/module`);
        }
      }
      expect(failed).toEqual([]);
    });

    // The contact card is 53 modules at M, so 160 px is 3 px per module:
    // below the phone-distance floor (4 px, tested above), where every
    // framed code, the built-in frames included, decodes at some widths
    // and not others depending on pixel phase. It must read at 320 px.
    test("decodes at 160 and 320 px wide (the contact card at 320)", () => {
      const failed: string[] = [];
      for (const [name, value] of PAYLOADS) {
        for (const width of name === "vcard" ? [320] : [160, 320]) {
          if (!decodesAtWidth(propsFor(frame, value), width)) {
            failed.push(`${name} at ${width} px`);
          }
        }
      }
      expect(failed).toEqual([]);
    });

    test("scores Great", async () => {
      for (const value of [SAMPLE_PAYLOADS.link, SAMPLE_PAYLOADS.wifi]) {
        const props = propsFor(frame, value, 1024);
        const artwork = getFrameDimensions(1024, frame);
        const pixels = rasterizeSvg(renderSvg(props), {
          width: Math.round(
            (artwork.width * PIXEL_SCORE_MIN_CODE_WIDTH) / 1024
          ),
          background: null,
        });
        const result = await getScanScoreFromPixels(props, pixels);
        expect(
          result.grade,
          `${value}: ${JSON.stringify(result.checks.filter((c) => !c.passed))}`
        ).toBe("great");
      }
    });

    test.skipIf(!ZBAR)("reads with zbar", async () => {
      const failed: string[] = [];
      for (const [name, value] of PAYLOADS) {
        const props = propsFor(frame, value);
        const modules = symbolSize(value, "M");
        const artwork = getFrameDimensions(256, frame);
        const image = rasterizeSvg(renderSvg(props), {
          width: (artwork.width * modules * 6) / 256,
          pad: 24,
        });
        const file = join(workDir, `${official.id}-${name}.png`);
        writeFileSync(file, await toPng(image));
        const result = spawnSync("zbarimg", ["--raw", "-q", file], {
          encoding: "utf8",
        });
        if (result.stdout.replace(/\n$/, "") !== value) {
          failed.push(name);
        }
      }
      expect(failed).toEqual([]);
    });
  }
);
