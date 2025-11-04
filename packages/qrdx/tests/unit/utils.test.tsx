/** biome-ignore-all lint/complexity/noForEach: <explanation> */
import { describe, expect, it } from "vitest";
import {
  convertImageSettingsToPixels,
  excavateModules,
  generatePath,
  getContrastLevel,
  getContrastRatio,
  getImageSettings,
  getLuminance,
  hexToRgb,
  QRCodeSVG,
} from "../../src/utils";
import type { Excavation, ImageSettings, Modules } from "../../types";

describe("excavateModules", () => {
  it("should excavate modules in the specified region", () => {
    const modules: Modules = [
      [true, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
    ];

    const excavation: Excavation = { x: 1, y: 1, w: 2, h: 2 };
    const result = excavateModules(modules, excavation);

    expect(result[0]).toEqual([true, true, true, true]);
    expect(result[1]).toEqual([true, false, false, true]);
    expect(result[2]).toEqual([true, false, false, true]);
    expect(result[3]).toEqual([true, true, true, true]);
  });

  it("should not modify modules outside excavation region", () => {
    const modules: Modules = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ];

    const excavation: Excavation = { x: 1, y: 1, w: 1, h: 1 };
    const result = excavateModules(modules, excavation);

    expect(result[0][0]).toBe(false);
    expect(result[0][2]).toBe(false);
    expect(result[2][0]).toBe(false);
    expect(result[2][2]).toBe(false);
    expect(result[1][1]).toBe(false); // This should be excavated
  });

  it("should handle excavation at edges", () => {
    const modules: Modules = [
      [true, true],
      [true, true],
    ];

    const excavation: Excavation = { x: 0, y: 0, w: 1, h: 1 };
    const result = excavateModules(modules, excavation);

    expect(result[0][0]).toBe(false);
    expect(result[0][1]).toBe(true);
    expect(result[1][0]).toBe(true);
  });
});

describe("generatePath", () => {
  it("should generate path for simple modules", () => {
    const modules: Modules = [[true]];
    const path = generatePath(modules);

    expect(path).toBeTruthy();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate path with margin", () => {
    const modules: Modules = [[true]];
    const path = generatePath(modules, 2);

    expect(path).toBeTruthy();
    expect(path).toContain("M2");
  });

  it("should handle multiple modules in a row", () => {
    const modules: Modules = [[true, true, true]];
    const path = generatePath(modules);

    expect(path).toBeTruthy();
    expect(path).toContain("M0");
  });

  it("should skip light modules", () => {
    const modules: Modules = [[false, false, false]];
    const path = generatePath(modules);

    // Path should be empty or minimal for no dark modules
    expect(path.length).toBeLessThan(10);
  });

  it("should handle mixed modules", () => {
    const modules: Modules = [[true, false, true]];
    const path = generatePath(modules);

    expect(path).toBeTruthy();
    // Should have two separate paths for the two dark modules
    const pathCount = (path.match(/M/g) || []).length;
    expect(pathCount).toBeGreaterThanOrEqual(2);
  });
});

describe("getImageSettings", () => {
  it("should return null when no image settings provided", () => {
    const cells: Modules = [[true]];
    const result = getImageSettings(cells, 100, 4);

    expect(result).toBeNull();
  });

  it("should calculate image settings with excavation", () => {
    const cells: Modules = new Array(25)
      .fill(null)
      .map(() => new Array(25).fill(true));

    const imageSettings: ImageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const result = getImageSettings(cells, 250, 4, imageSettings);

    expect(result).not.toBeNull();
    expect(result?.excavation).not.toBeNull();
    expect(result?.w).toBeGreaterThan(0);
    expect(result?.h).toBeGreaterThan(0);
  });

  it("should calculate image settings without excavation", () => {
    const cells: Modules = new Array(25)
      .fill(null)
      .map(() => new Array(25).fill(true));

    const imageSettings: ImageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: false,
    };

    const result = getImageSettings(cells, 250, 4, imageSettings);

    expect(result).not.toBeNull();
    expect(result?.excavation).toBeNull();
  });

  it("should center image by default", () => {
    const cells: Modules = new Array(25)
      .fill(null)
      .map(() => new Array(25).fill(true));

    const imageSettings: ImageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: false,
    };

    const result = getImageSettings(cells, 250, 4, imageSettings);

    expect(result).not.toBeNull();
    // Image should be centered
    const qrSize = 25;
    const expectedCenterX = qrSize / 2 - (result?.w ?? 0) / 2;
    const expectedCenterY = qrSize / 2 - (result?.h ?? 0) / 2;
    expect(Math.abs((result?.x ?? 0) - expectedCenterX)).toBeLessThan(1);
    expect(Math.abs((result?.y ?? 0) - expectedCenterY)).toBeLessThan(1);
  });

  it("should respect custom x and y positions", () => {
    const cells: Modules = new Array(25)
      .fill(null)
      .map(() => new Array(25).fill(true));

    const imageSettings: ImageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: false,
      x: 10,
      y: 15,
    };

    const result = getImageSettings(cells, 250, 4, imageSettings);

    expect(result).not.toBeNull();
    expect(result?.x).toBeGreaterThan(0);
    expect(result?.y).toBeGreaterThan(0);
  });
});

describe("convertImageSettingsToPixels", () => {
  it("should convert module coordinates to pixels", () => {
    const calculatedSettings = {
      x: 10,
      y: 10,
      w: 5,
      h: 5,
      excavation: null,
    };

    const result = convertImageSettingsToPixels(calculatedSettings, 250, 25, 4);

    expect(result.imgWidth).toBeGreaterThan(0);
    expect(result.imgHeight).toBeGreaterThan(0);
    expect(result.imgLeft).toBeGreaterThan(0);
    expect(result.imgTop).toBeGreaterThan(0);
  });

  it("should account for margin in calculations", () => {
    const calculatedSettings = {
      x: 0,
      y: 0,
      w: 5,
      h: 5,
      excavation: null,
    };

    const result = convertImageSettingsToPixels(calculatedSettings, 250, 25, 4);

    expect(result.imgLeft).toBeGreaterThan(0); // Should include margin
    expect(result.imgTop).toBeGreaterThan(0); // Should include margin
  });
});

describe("hexToRgb", () => {
  it("should convert valid hex colors to RGB", () => {
    const result = hexToRgb("#ffffff");
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("should handle hex without hash", () => {
    const result = hexToRgb("000000");
    expect(result).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("should handle mixed case", () => {
    const result = hexToRgb("#AbCdEf");
    expect(result).toEqual({ r: 171, g: 205, b: 239 });
  });

  it("should return null for invalid hex", () => {
    const result = hexToRgb("invalid");
    expect(result).toBeNull();
  });

  it("should return null for short hex", () => {
    const result = hexToRgb("#fff");
    expect(result).toBeNull();
  });
});

describe("getLuminance", () => {
  it("should calculate luminance for white", () => {
    const luminance = getLuminance(255, 255, 255);
    expect(luminance).toBeCloseTo(1, 1);
  });

  it("should calculate luminance for black", () => {
    const luminance = getLuminance(0, 0, 0);
    expect(luminance).toBe(0);
  });

  it("should calculate luminance for gray", () => {
    const luminance = getLuminance(128, 128, 128);
    expect(luminance).toBeGreaterThan(0);
    expect(luminance).toBeLessThan(1);
  });

  it("should handle different color values", () => {
    const red = getLuminance(255, 0, 0);
    const green = getLuminance(0, 255, 0);
    const blue = getLuminance(0, 0, 255);

    // Green should have highest luminance contribution
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });
});

describe("getContrastRatio", () => {
  it("should calculate maximum contrast for black and white", () => {
    const ratio = getContrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("should calculate minimum contrast for same colors", () => {
    const ratio = getContrastRatio("#ffffff", "#ffffff");
    expect(ratio).toBe(1);
  });

  it("should handle gray tones", () => {
    const ratio = getContrastRatio("#888888", "#ffffff");
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(21);
  });

  it("should return 1 for invalid colors", () => {
    const ratio = getContrastRatio("invalid", "#ffffff");
    expect(ratio).toBe(1);
  });

  it("should be commutative", () => {
    const ratio1 = getContrastRatio("#000000", "#ffffff");
    const ratio2 = getContrastRatio("#ffffff", "#000000");
    expect(ratio1).toBeCloseTo(ratio2, 5);
  });
});

describe("getContrastLevel", () => {
  it("should return AAA for high contrast", () => {
    const result = getContrastLevel(7);
    expect(result.level).toBe("AAA");
    expect(result.warning).toBe(false);
  });

  it("should return AA for good contrast", () => {
    const result = getContrastLevel(4.5);
    expect(result.level).toBe("AA");
    expect(result.warning).toBe(false);
  });

  it("should return AA Large for acceptable contrast", () => {
    const result = getContrastLevel(3);
    expect(result.level).toBe("AA Large");
    expect(result.warning).toBe(true);
  });

  it("should return Fail for poor contrast", () => {
    const result = getContrastLevel(2);
    expect(result.level).toBe("Fail");
    expect(result.warning).toBe(true);
  });

  it("should include appropriate messages", () => {
    const excellent = getContrastLevel(10);
    const good = getContrastLevel(5);
    const poor = getContrastLevel(2);

    expect(excellent.message).toContain("Excellent");
    expect(good.message).toContain("Good");
    expect(poor.message).toContain("Poor");
  });
});

describe("QRCodeSVG", () => {
  it("should render basic SVG", () => {
    const svg = QRCodeSVG({ value: "test" });
    expect(svg).toBeTruthy();
    expect(svg.type).toBe("svg");
  });

  it("should apply custom size", () => {
    const svg = QRCodeSVG({ value: "test", size: 500 });
    expect(svg.props.width).toBe(500);
    expect(svg.props.height).toBe(500);
  });

  it("should apply custom colors", () => {
    const svg = QRCodeSVG({
      value: "test",
      bgColor: "#ff0000",
      fgColor: "#00ff00",
    });

    expect(svg).toBeTruthy();
    // Check that SVG has proper structure
    expect(svg.type).toBe("svg");
    expect(svg.props.children).toBeDefined();
  });

  it("should handle different error levels", () => {
    const lowError = QRCodeSVG({ value: "test", level: "L" });
    const highError = QRCodeSVG({ value: "test", level: "H" });

    expect(lowError).toBeTruthy();
    expect(highError).toBeTruthy();
  });

  it("should apply margin", () => {
    const svg = QRCodeSVG({ value: "test", margin: 8 });
    expect(svg).toBeTruthy();
  });

  it("should handle body patterns", () => {
    const patterns = [
      "circle",
      "square",
      "diamond",
      "rounded",
      "clean-square",
    ] as const;

    patterns.forEach((pattern) => {
      const svg = QRCodeSVG({ value: "test", bodyPattern: pattern });
      expect(svg).toBeTruthy();
    });
  });

  it("should handle corner patterns", () => {
    const svg = QRCodeSVG({
      value: "test",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
    });

    expect(svg).toBeTruthy();
  });

  it("should handle eye and dot colors", () => {
    const svg = QRCodeSVG({
      value: "test",
      eyeColor: "#ff0000",
      dotColor: "#0000ff",
    });

    expect(svg).toBeTruthy();
    expect(svg.type).toBe("svg");
    expect(svg.props.children).toBeDefined();
  });
});
