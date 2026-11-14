// Phase 0 privacy: a design shared in the community never carries an
// uploaded logo or image art, and the editor's quick logo icons survive only
// as an id, drawn again from QRdx's own glyph (a forged marker can't smuggle
// an image through). Pure: no database or network.
import { describe, expect, it } from "vitest";
import {
  presetLogoIcon,
  removedPartsNote,
  toPublishableStyle,
} from "@/lib/community/public-style";
import {
  publicStyleFromSaved,
  toPublicStyle,
} from "@/lib/community/public-style-server";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import type { ThemeStyles } from "@/types/theme";

const UPLOAD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const forged = (inner: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" data-qrdx-icon="wifi">${inner}</svg>`)}`;
const ART = {
  mode: "logo",
  image: { width: 1, height: 1, pixels: "AAAA" },
} as unknown as ThemeStyles["art"];

describe("presetLogoIcon", () => {
  it("reads the id of a quick icon", () => {
    expect(presetLogoIcon(logoIconDataUrl("wifi"))).toBe("wifi");
    expect(presetLogoIcon(logoIconDataUrl("instagram"))).toBe("instagram");
  });

  it("ignores uploads, links, unknown ids and markers outside an SVG data URL", () => {
    expect(presetLogoIcon(UPLOAD)).toBeNull();
    expect(presetLogoIcon("https://example.com/logo.png")).toBeNull();
    expect(presetLogoIcon(undefined)).toBeNull();
    expect(
      presetLogoIcon(
        `data:image/svg+xml,${encodeURIComponent('<svg data-qrdx-icon="paypal"/>')}`,
      ),
    ).toBeNull();
    expect(
      presetLogoIcon(
        `data:image/png;base64,${encodeURIComponent('data-qrdx-icon="wifi"')}`,
      ),
    ).toBeNull();
  });
});

describe("toPublishableStyle", () => {
  it("drops an uploaded logo and switches the logo off", () => {
    const result = toPublishableStyle({
      fgColor: "#111111",
      showLogo: true,
      customLogo: UPLOAD,
    });
    expect(result.style).toEqual({ fgColor: "#111111", showLogo: false });
    expect(result.logoIcon).toBeNull();
    expect(result.removed).toEqual(["logo"]);
    expect(JSON.stringify(result)).not.toContain("base64");
  });

  it("drops logo and halftone art", () => {
    const result = toPublishableStyle({ fgColor: "#111111", art: ART });
    expect(result.style).toEqual({ fgColor: "#111111" });
    expect(result.removed).toEqual(["art"]);
  });

  it("keeps a quick icon as its id only", () => {
    const result = toPublishableStyle({
      showLogo: true,
      customLogo: logoIconDataUrl("phone"),
    });
    expect(result.style).toEqual({ showLogo: true });
    expect(result.logoIcon).toBe("phone");
    expect(result.removed).toEqual([]);
  });

  it("keeps the QRdx mark (a logo without customLogo)", () => {
    const result = toPublishableStyle({ showLogo: true });
    expect(result.style).toEqual({ showLogo: true });
    expect(result.logoIcon).toBeNull();
  });

  it("forgets the icon when the logo is switched off", () => {
    const result = toPublishableStyle({
      showLogo: false,
      customLogo: logoIconDataUrl("wifi"),
    });
    expect(result.logoIcon).toBeNull();
    expect(result.style.customLogo).toBeUndefined();
  });

  it("says what wasn't shared", () => {
    expect(removedPartsNote(["logo"])).toMatch(/uploaded logo isn't shared/);
    expect(removedPartsNote(["art"])).toMatch(/image art isn't shared/);
    expect(removedPartsNote(["logo", "art"])).toMatch(/logo and image art/);
    expect(removedPartsNote([])).toBeNull();
  });
});

describe("toPublicStyle", () => {
  it("draws a quick icon again from QRdx's glyph", () => {
    expect(toPublicStyle({ showLogo: true }, "calendar")).toEqual({
      showLogo: true,
      customLogo: logoIconDataUrl("calendar"),
    });
  });

  it("never republishes a stored image, even with a forged marker", () => {
    const style = publicStyleFromSaved({
      showLogo: true,
      customLogo: forged(
        '<image href="https://tracker.example/pixel.png" width="96" height="96"/>',
      ),
    });
    expect(style.customLogo).toBe(logoIconDataUrl("wifi"));
    expect(JSON.stringify(style)).not.toContain("tracker");
  });

  it("drops anything image-like a stored payload carries", () => {
    const style = toPublicStyle(
      { fgColor: "#222222", customLogo: UPLOAD, art: ART } as ThemeStyles,
      "not-an-icon",
    );
    expect(style).toEqual({ fgColor: "#222222" });
  });

  it("cleans a saved theme the way the legacy gallery shows it", () => {
    expect(
      publicStyleFromSaved({
        bgColor: "#ffffff",
        showLogo: true,
        customLogo: UPLOAD,
        art: ART,
      }),
    ).toEqual({ bgColor: "#ffffff", showLogo: false });
  });
});
