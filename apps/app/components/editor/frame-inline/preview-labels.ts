// Reads the frame labels out of the playground preview's SVG: where each
// marked label (data-qrdx-frame-label) is drawn on screen, at what size,
// weight and color, and what color is painted behind it. The inline editor
// lays its input exactly over a label from this. Browser only.
import { FRAME_LABEL_ATTRIBUTE } from "qrdx";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PreviewLabel {
  marker: string;
  /** Around the drawn text, relative to the overlay root (CSS px) */
  box: Box;
  /** Set along a curve (one <text> per letter) */
  curved: boolean;
  /** The row a straight label is fitted in (left and width, CSS px) */
  row: { left: number; width: number };
  /** Font size on screen (CSS px) */
  fontSize: number;
  fontWeight: string;
  fill: string;
  align: "start" | "middle" | "end";
  /** Color painted right behind the label, when the frame paints one */
  behind: string | null;
}

const ALIGNS = new Set(["start", "middle", "end"]);

function union(a: Box, b: Box): Box {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

/**
 * The fill of the topmost frame shape under (x, y), in the SVG's own units.
 * Frame shapes are the children of `<g data-qrdx-frame>`, painted in order.
 */
function fillAt(svg: SVGSVGElement, x: number, y: number): string | null {
  const group = svg.querySelector(":scope > g[data-qrdx-frame]");
  if (!group || typeof DOMPoint === "undefined") return null;
  const shapes = Array.from(group.children).reverse();
  const point = new DOMPoint(x, y);
  for (const shape of shapes) {
    if (!(shape instanceof SVGGeometryElement)) continue;
    const fill = shape.getAttribute("fill");
    if (!fill || fill === "none" || fill === "transparent") continue;
    try {
      if (shape.isPointInFill(point)) return fill;
    } catch {
      return null;
    }
  }
  return null;
}

/** The middle of a <text>, in the SVG's units (its rotation applied). */
function middleOf(text: SVGTextElement): { x: number; y: number } {
  const bbox = text.getBBox();
  const point = new DOMPoint(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
  const matrix = text.transform.baseVal.consolidate()?.matrix;
  const moved = matrix ? point.matrixTransform(matrix) : point;
  return { x: moved.x, y: moved.y };
}

/** The frame <svg> inside the preview's code box. */
export function previewFrameSvg(codeBox: HTMLElement): SVGSVGElement | null {
  const svg = codeBox.querySelector(":scope > svg");
  return svg instanceof SVGSVGElement ? svg : null;
}

/** Where the whole artwork (frame included) is drawn, relative to `root`. */
export function measureArtwork(
  svg: SVGSVGElement,
  root: HTMLElement,
): Box | null {
  const matrix = svg.getScreenCTM();
  const view = svg.viewBox.baseVal;
  if (!(matrix && view && view.width > 0)) return null;
  const origin = root.getBoundingClientRect();
  const topLeft = new DOMPoint(view.x, view.y).matrixTransform(matrix);
  const bottomRight = new DOMPoint(
    view.x + view.width,
    view.y + view.height,
  ).matrixTransform(matrix);
  return {
    left: topLeft.x - origin.left,
    top: topLeft.y - origin.top,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/** Every marked label of the frame, measured relative to `root`. */
export function measurePreviewLabels(
  svg: SVGSVGElement,
  root: HTMLElement,
): PreviewLabel[] {
  const matrix = svg.getScreenCTM();
  if (!matrix) return [];
  const origin = root.getBoundingClientRect();
  const scale = Math.hypot(matrix.a, matrix.b);
  const byMarker = new Map<string, PreviewLabel>();

  for (const text of svg.querySelectorAll<SVGTextElement>(
    `:scope > text[${FRAME_LABEL_ATTRIBUTE}]`,
  )) {
    const marker = text.getAttribute(FRAME_LABEL_ATTRIBUTE);
    if (!marker) continue;
    const rect = text.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const box: Box = {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    };
    const existing = byMarker.get(marker);
    if (existing) {
      // Another letter of a curved label
      existing.box = union(existing.box, box);
      existing.curved = true;
      continue;
    }
    const x = Number.parseFloat(text.getAttribute("x") ?? "0");
    const y = Number.parseFloat(text.getAttribute("y") ?? "0");
    const maxWidth =
      Number.parseFloat(text.getAttribute("data-max-width") ?? "") || 0;
    const anchorAttr = text.getAttribute("text-anchor") ?? "middle";
    const align = (ALIGNS.has(anchorAttr) ? anchorAttr : "middle") as
      | "start"
      | "middle"
      | "end";
    const anchorX = new DOMPoint(x, y).matrixTransform(matrix).x - origin.left;
    const rowWidth = maxWidth * scale;
    const rowLeft =
      align === "middle"
        ? anchorX - rowWidth / 2
        : align === "end"
          ? anchorX - rowWidth
          : anchorX;
    const middle = middleOf(text);
    byMarker.set(marker, {
      marker,
      box,
      curved: Boolean(text.getAttribute("transform")),
      row: { left: rowLeft, width: rowWidth },
      fontSize:
        Number.parseFloat(text.getAttribute("font-size") ?? "0") * scale,
      fontWeight: text.getAttribute("font-weight") ?? "700",
      fill: text.getAttribute("fill") ?? "#000000",
      align,
      behind: fillAt(svg, middle.x, middle.y),
    });
  }
  return [...byMarker.values()];
}

/** Hides (or shows again) the drawn text of `marker`, while an input covers it. */
export function setLabelHidden(
  svg: SVGSVGElement,
  marker: string | null,
): void {
  for (const text of svg.querySelectorAll<SVGTextElement>(
    `:scope > text[${FRAME_LABEL_ATTRIBUTE}]`,
  )) {
    const hide =
      marker !== null && text.getAttribute(FRAME_LABEL_ATTRIBUTE) === marker;
    text.style.opacity = hide ? "0" : "";
  }
}
