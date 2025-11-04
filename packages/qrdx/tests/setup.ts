/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: <explanation> */
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock canvas for jsdom environment
class MockCanvasRenderingContext2D {
  canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(),
    toDataURL: vi.fn(() => "data:image/png;base64,mock"),
  };
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "high" as ImageSmoothingQuality;
  shadowColor = "";
  shadowBlur = 0;
  font = "";

  fillRect = vi.fn();
  clearRect = vi.fn();
  strokeRect = vi.fn();
  beginPath = vi.fn();
  moveTo = vi.fn();
  lineTo = vi.fn();
  closePath = vi.fn();
  stroke = vi.fn();
  fill = vi.fn();
  arc = vi.fn();
  scale = vi.fn();
  drawImage = vi.fn();
  getImageData = vi.fn(() => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  }));
  putImageData = vi.fn();
  createImageData = vi.fn(() => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  }));
  save = vi.fn();
  restore = vi.fn();
  fillText = vi.fn();
}

// Mock HTMLCanvasElement
HTMLCanvasElement.prototype.getContext = vi.fn(function (
  this: HTMLCanvasElement,
  contextId: string
) {
  if (contextId === "2d") {
    const ctx = new MockCanvasRenderingContext2D();
    ctx.canvas = this as any;
    return ctx as any;
  }
  return null;
}) as any;

HTMLCanvasElement.prototype.toDataURL = vi.fn(
  () => "data:image/png;base64,mock"
);

// Mock document.createElement for canvas
const originalCreateElement = document.createElement.bind(document);
document.createElement = vi.fn((tagName: string, options?: any) => {
  const element = originalCreateElement(tagName, options);
  if (tagName === "canvas") {
    Object.defineProperty(element, "getContext", {
      value: vi.fn(() => new MockCanvasRenderingContext2D()),
    });
    Object.defineProperty(element, "toDataURL", {
      value: vi.fn(() => "data:image/png;base64,mock"),
    });
  }
  return element;
}) as any;

// Mock Image
class MockImage {
  src = "";
  alt = "";
  width = 0;
  height = 0;
  naturalWidth = 100;
  naturalHeight = 100;
  complete = false;
  onload: ((this: GlobalEventHandlers, ev: Event) => any) | null = null;
  onerror: ((this: GlobalEventHandlers, ev: Event | string) => any) | null =
    null;
  loading: "eager" | "lazy" = "eager";
  crossOrigin: string | null = null;

  constructor() {
    // Simulate async image loading
    setTimeout(() => {
      this.complete = true;
      if (this.onload) {
        // @ts-expect-error - Mock implementation
        this.onload.call(this, new Event("load"));
      }
    }, 0);
  }

  setAttribute(name: string, value: string) {
    if (name === "crossOrigin") {
      this.crossOrigin = value;
    }
  }
}

// @ts-expect-error - Mocking Image constructor
global.Image = MockImage;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

// Mock window.devicePixelRatio
Object.defineProperty(window, "devicePixelRatio", {
  writable: true,
  configurable: true,
  value: 1,
});

// Mock Path2D
global.Path2D = class Path2D {
  addPath(_path: Path2D) {}
} as any;

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => {
  cb(0);
  return 0;
});

// Mock Blob
global.Blob = class Blob {
  size = 0;
  type = "";
  text = vi.fn(() => Promise.resolve(""));
  arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
  slice = vi.fn(() => new Blob());
  stream = vi.fn();
} as any;
