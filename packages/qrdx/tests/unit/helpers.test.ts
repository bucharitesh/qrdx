import { describe, it, expect } from "vitest";
import { getQRData } from "../../src/helpers";

describe("getQRData", () => {
  it("should generate QR data with default values", () => {
    const result = getQRData({ url: "https://example.com" });

    expect(result.value).toBe("https://example.com?qr=1");
    expect(result.size).toBe(1024);
    expect(result.level).toBe("Q");
    expect(result.imageSettings).toBeDefined();
    expect(result.imageSettings?.excavate).toBe(true);
  });

  it("should append ?qr=1 to URL", () => {
    const result = getQRData({ url: "https://test.com" });
    expect(result.value).toBe("https://test.com?qr=1");
  });

  it("should apply custom colors", () => {
    const result = getQRData({
      url: "https://example.com",
      fgColor: "#000000",
      bgColor: "#ffffff",
      eyeColor: "#ff0000",
      dotColor: "#00ff00",
    });

    expect(result.fgColor).toBe("#000000");
    expect(result.bgColor).toBe("#ffffff");
    expect(result.eyeColor).toBe("#ff0000");
    expect(result.dotColor).toBe("#00ff00");
  });

  it("should apply body pattern", () => {
    const result = getQRData({
      url: "https://example.com",
      bodyPattern: "circle",
    });

    expect(result.bodyPattern).toBe("circle");
  });

  it("should hide logo when hideLogo is true", () => {
    const result = getQRData({
      url: "https://example.com",
      hideLogo: true,
    });

    expect(result.imageSettings).toBeUndefined();
  });

  it("should use default logo when no logo provided", () => {
    const result = getQRData({
      url: "https://example.com",
      hideLogo: false,
    });

    expect(result.imageSettings).toBeDefined();
    expect(result.imageSettings?.src).toBeTruthy();
  });

  it("should use custom logo when provided", () => {
    const customLogo = "https://example.com/logo.png";
    const result = getQRData({
      url: "https://example.com",
      hideLogo: false,
      logo: customLogo,
    });

    expect(result.imageSettings).toBeDefined();
    expect(result.imageSettings?.src).toBe(customLogo);
  });

  it("should apply custom margin", () => {
    const result = getQRData({
      url: "https://example.com",
      margin: 8,
    });

    expect(result.margin).toBe(8);
  });

  it("should set logo dimensions", () => {
    const result = getQRData({
      url: "https://example.com",
      hideLogo: false,
    });

    expect(result.imageSettings?.width).toBe(256);
    expect(result.imageSettings?.height).toBe(256);
  });

  it("should enable excavation for logo", () => {
    const result = getQRData({
      url: "https://example.com",
      hideLogo: false,
    });

    expect(result.imageSettings?.excavate).toBe(true);
  });
});

