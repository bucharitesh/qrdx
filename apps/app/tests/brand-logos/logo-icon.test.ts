// Brand logos as QR logos: the logoIcon grammar, the SVG data URLs, how a
// stored logo is recognized again, and the community's redraw-from-id rule.
import { describe, expect, it } from "vitest";
import { brandMark } from "@/lib/brand-logos/brand-logo";
import { getBrandIcon } from "@/lib/brand-logos/server";
import {
  brandLogoDataUrl,
  brandNeedsPlate,
  brandPlateColor,
  brandQuickIconDataUrl,
  logoMarkerOf,
  logoTitleOf,
} from "@/lib/brand-logos/svg";
import {
  presetLogoIcon,
  toPublishableStyle,
} from "@/lib/community/public-style";
import { toPublicStyle } from "@/lib/community/public-style-server";
import { parseApiStyle } from "@/lib/qr-api/style";
import { logoIconDataUrl, UnknownBrandLogoError } from "@/lib/qr-design/logo";
import {
  formatLogoIcon,
  logoIconOf,
  parseLogoIcon,
} from "@/lib/qr-design/logo-icon";

const spotify = getBrandIcon("spotify");
if (!spotify) throw new Error("spotify missing");

const decoded = (url: string) =>
  decodeURIComponent(url.slice("data:image/svg+xml,".length));

describe("parseLogoIcon", () => {
  it("reads quick icons first, then brands with an optional color", () => {
    expect(parseLogoIcon("wifi")).toEqual({ kind: "quick", id: "wifi" });
    expect(parseLogoIcon("whatsapp")).toEqual({
      kind: "quick",
      id: "whatsapp",
    });
    expect(parseLogoIcon("whatsapp:white")).toEqual({
      kind: "brand",
      slug: "whatsapp",
      color: "white",
    });
    expect(parseLogoIcon("spotify")).toEqual({
      kind: "brand",
      slug: "spotify",
      color: "brand",
    });
  });

  it("refuses anything else", () => {
    for (const value of ["Spotify", "spotify:red", "a b", "", "x:", 42, null]) {
      expect(parseLogoIcon(value), String(value)).toBeNull();
    }
  });

  it("formats the shortest equivalent value", () => {
    expect(
      formatLogoIcon({ kind: "brand", slug: "spotify", color: "brand" }),
    ).toBe("spotify");
    expect(
      formatLogoIcon({ kind: "brand", slug: "whatsapp", color: "brand" }),
    ).toBe("whatsapp:brand");
    expect(
      formatLogoIcon({ kind: "brand", slug: "paypal", color: "black" }),
    ).toBe("paypal:black");
  });

  it("is what the image API's style accepts", () => {
    expect(parseApiStyle({ logoIcon: "paypal:white" }).ok).toBe(true);
    expect(parseApiStyle({ logoIcon: "wifi" }).ok).toBe(true);
    expect(parseApiStyle({ logoIcon: "PayPal" }).ok).toBe(false);
  });
});

describe("brand logo data URLs", () => {
  it("embed the mark, its color, name and tag", () => {
    const url = brandLogoDataUrl(spotify, "white");
    const svg = decoded(url);
    expect(svg).toContain(`d="${spotify.path}"`);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain("<title>Spotify</title>");
    expect(logoMarkerOf(url)).toBe("spotify:white");
    expect(logoTitleOf(url)).toBe("Spotify");
    expect(logoIconOf(url)).toBe("spotify:white");
    expect(logoIconOf(brandLogoDataUrl(spotify, "brand"))).toBe("spotify");
    expect(decoded(brandLogoDataUrl(spotify, "brand"))).toContain(
      `fill="#${spotify.hex}"`,
    );
  });

  it("escape names", () => {
    const url = brandLogoDataUrl(
      { slug: "att", title: 'A&T <"x">', hex: "000000", path: "M0 0h1" },
      "black",
    );
    expect(decoded(url)).toContain(
      "<title>A&#38;T &#60;&#34;x&#34;&#62;</title>",
    );
    expect(logoTitleOf(url)).toBe('A&T <"x">');
  });

  it("are what the server draws for a brand logoIcon", () => {
    expect(logoIconDataUrl("spotify:white")).toBe(
      brandLogoDataUrl(spotify, "white"),
    );
    expect(logoIconDataUrl("spotify")).toBe(brandLogoDataUrl(spotify, "brand"));
    expect(() => logoIconDataUrl("notabrand")).toThrow(UnknownBrandLogoError);
  });

  it("draw WhatsApp and Instagram quick icons as the real marks, client and server alike", () => {
    for (const id of ["whatsapp", "instagram"] as const) {
      const url = logoIconDataUrl(id);
      expect(url).toBe(brandQuickIconDataUrl(brandMark(id), id));
      expect(decoded(url)).toContain(brandMark(id).path);
      expect(logoIconOf(url)).toBe(id);
      expect(presetLogoIcon(url)).toBe(id);
    }
    // Generic quick icons keep their iconsax glyphs
    expect(logoIconOf(logoIconDataUrl("wifi"))).toBe("wifi");
  });
});

describe("plates", () => {
  it("are needed for white marks and light brand colors", () => {
    expect(brandNeedsPlate("FFFC00", "brand")).toBe(true); // Snapchat
    expect(brandNeedsPlate(spotify.hex, "brand")).toBe(false);
    expect(brandNeedsPlate(spotify.hex, "black")).toBe(false);
    expect(brandNeedsPlate(spotify.hex, "white")).toBe(true);
    expect(brandPlateColor("1ED760", "white")).toBe("#1ed760");
    expect(brandPlateColor("FFFC00", "brand")).toBe("#000000");
    expect(brandPlateColor("1ED760", "brand")).toBe("#ffffff");
  });
});

describe("community", () => {
  it("keeps a brand logo by id and redraws it from the catalogue", () => {
    const shared = toPublishableStyle({
      showLogo: true,
      customLogo: brandLogoDataUrl(spotify, "black"),
    });
    expect(shared.logoIcon).toBe("spotify:black");
    expect(shared.removed).toEqual([]);
    expect(toPublicStyle(shared.style, shared.logoIcon).customLogo).toBe(
      brandLogoDataUrl(spotify, "black"),
    );
  });

  it("shows no logo for a forged tag naming no brand", () => {
    const forged = `data:image/svg+xml,${encodeURIComponent('<svg data-qrdx-icon="notabrand:white"><script/></svg>')}`;
    const shared = toPublishableStyle({ showLogo: true, customLogo: forged });
    expect(shared.logoIcon).toBe("notabrand:white");
    const shown = toPublicStyle(shared.style, shared.logoIcon);
    expect(shown.customLogo).toBeUndefined();
    expect(shown.showLogo).toBe(false);
  });
});
