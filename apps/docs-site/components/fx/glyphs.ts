// A glyph atlas: every character drawn once into an offscreen canvas, so a
// frame blits glyphs with drawImage instead of calling fillText per cell.

import { type RGB, rgba } from "./engine";

/** Light to dense. Index 0 is blank. */
export const RAMP = " .:-=+*#%@";
/** Half blocks for QR modules, painted as rects so they tile without gaps. */
export const BLOCKS = " ▀▄█";

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** Cell size in device px. */
  cw: number;
  ch: number;
  index: Map<string, number>;
}

export function monoFamily(el: Element): string {
  const probe = document.createElement("span");
  probe.className = "font-mono";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  el.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily || "monospace";
  probe.remove();
  return family;
}

export function buildAtlas(
  chars: string,
  cw: number,
  ch: number,
  family: string,
  color: RGB,
): Atlas {
  const list = Array.from(new Set(Array.from(chars)));
  const canvas = document.createElement("canvas");
  canvas.width = cw * list.length;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const index = new Map<string, number>();
  if (!ctx) return { canvas, cw, ch, index };
  ctx.fillStyle = rgba(color, 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${Math.round(cw / 0.62)}px ${family}`;
  list.forEach((c, i) => {
    index.set(c, i);
    const x = i * cw;
    const half = Math.round(ch / 2);
    if (c === "▀") ctx.fillRect(x, 0, cw, half);
    else if (c === "▄") ctx.fillRect(x, half, cw, ch - half);
    else if (c === "█") ctx.fillRect(x, 0, cw, ch);
    else if (c !== " ") ctx.fillText(c, x + cw / 2, ch / 2 + 0.5);
  });
  return { canvas, cw, ch, index };
}
