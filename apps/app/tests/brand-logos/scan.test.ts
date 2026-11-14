// Brand logos keep codes scannable: each is drawn into the code at the
// default logo size (as an API render does) and the rendered pixels must
// score Great with the editor's own scan score, real mark included.
import {
  decodePNGPixels,
  getScanScoreFromPixels,
  PIXEL_SCORE_MIN_CODE_WIDTH,
  withQRSize,
} from "qrdx";
import { describe, expect, it } from "vitest";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { designQRProps } from "@/lib/qr-design/props";
import { GREAT_SCORE } from "@/lib/qr-design/repair";
import { renderDesignPng } from "@/lib/qr-design/score";
import { CLASSIC_STYLE, toThemeStyles } from "@/lib/qr-design/style";

const VALUE = "https://qrdx.dev/q/abc123";
const style = {
  ...toThemeStyles({ ...CLASSIC_STYLE, level: "H" }),
  showLogo: true,
};

const LOGOS = [
  "instagram",
  "whatsapp",
  "spotify",
  "paypal:black",
  "youtube",
  "googlemaps",
  "tiktok",
  "applemusic:white",
  "snapchat",
  "venmo",
  "tripadvisor",
  "telegram",
];

describe("brand logos in codes", () => {
  it.each(LOGOS)("%s scores Great at the default size", async (icon) => {
    const logo = logoIconDataUrl(icon);
    const withPlate =
      icon.endsWith(":white") || icon === "snapchat"
        ? {
            ...style,
            logoOptions: { plate: "#000000", shape: "rounded" as const },
          }
        : style;
    const png = await renderDesignPng(
      VALUE,
      withPlate,
      PIXEL_SCORE_MIN_CODE_WIDTH,
      logo,
    );
    const pixels = await decodePNGPixels(png);
    if (!pixels) throw new Error("no pixels");
    const props = withQRSize(
      designQRProps(VALUE, withPlate, logo),
      PIXEL_SCORE_MIN_CODE_WIDTH,
    );
    const result = await getScanScoreFromPixels(props, pixels);
    expect(
      result.score,
      JSON.stringify(result.checks.filter((c) => !c.passed)),
    ).toBeGreaterThanOrEqual(GREAT_SCORE);
    expect(result.checks.find((c) => c.id === "decode-320")?.passed).toBe(true);
  });
});
