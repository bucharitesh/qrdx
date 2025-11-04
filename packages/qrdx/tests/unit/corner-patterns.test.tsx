import { describe, expect, it } from "vitest";
import { generateCornerDotPath } from "../../src/corner-dot";
import { generateCornerSquarePath } from "../../src/corner-eye";

describe("Corner Dot Patterns", () => {
  const cx = 50;
  const cy = 50;
  const size = 10;

  it("should generate circle pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "circle");
    expect(result).toBeDefined();
    expect(result.type).toBe("circle");
  });

  it("should generate square pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "square");
    expect(result).toBeDefined();
    expect(result.type).toBe("rect");
  });

  it("should generate rounded-square pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "rounded-square");
    expect(result).toBeDefined();
    expect(result.type).toBe("rect");
  });

  it("should generate rounded-inward pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "rounded-inward");
    expect(result).toBeDefined();
    expect(result.type).toBe("path");
  });

  it("should generate diamond pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "diamond");
    expect(result).toBeDefined();
    expect(result.type).toBe("path");
  });

  it("should generate diamond-rounded pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "diamond-rounded");
    expect(result).toBeDefined();
    expect(result.type).toBe("path");
  });

  it("should generate leaf pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "leaf");
    expect(result).toBeDefined();
    expect(result.type).toBe("path");
  });

  it("should generate semi-round pattern", () => {
    const result = generateCornerDotPath(cx, cy, size, "semi-round");
    expect(result).toBeDefined();
    expect(result.type).toBe("path");
  });

  it("should default to circle for unknown patterns", () => {
    const result = generateCornerDotPath(cx, cy, size, "unknown" as any);
    expect(result).toBeDefined();
    expect(result.type).toBe("circle");
  });
});

describe("Corner Square Patterns", () => {
  const x = 0;
  const y = 0;
  const size = 70;

  it("should generate gear pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "gear");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
    expect(path).toContain("M");
  });

  it("should generate square pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "square");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate rounded-square pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "rounded-square");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate rounded-extra pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "rounded-extra");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate rounded pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "rounded");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate semi-round pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "semi-round");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate rounded-inward pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "rounded-inward");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should generate circle pattern", () => {
    const path = generateCornerSquarePath(x, y, size, "circle");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).toContain("M");
  });

  it("should default to gear for unknown patterns", () => {
    const path = generateCornerSquarePath(x, y, size, "unknown" as any);
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
  });

  it("should handle different sizes", () => {
    const smallPath = generateCornerSquarePath(x, y, 35, "gear");
    const largePath = generateCornerSquarePath(x, y, 140, "gear");

    expect(smallPath).toBeDefined();
    expect(largePath).toBeDefined();
    expect(smallPath).not.toBe(largePath);
  });

  it("should handle different positions", () => {
    const path1 = generateCornerSquarePath(0, 0, size, "gear");
    const path2 = generateCornerSquarePath(100, 100, size, "gear");

    expect(path1).toBeDefined();
    expect(path2).toBeDefined();
  });
});
