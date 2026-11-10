// Turns a catalogue entry (catalogue.mjs) into an official frame: the spec
// from its layout, plus the checks every generated frame must pass before
// it is written: the spec schema, label contrast against what is behind it
// (4.5:1 with the default colors), label sizes legible in print (the
// primary label at least 7% of the code's width, others 4.6%), and no
// motif or icon used twice in one frame.
import * as layouts from "./layouts.mjs";
import { contrast, labelFont, resolveColor } from "./lib.mjs";
import { usage } from "./motifs.mjs";

let types;
try {
  types = await import(new URL("../../dist/types/index.mjs", import.meta.url));
} catch (error) {
  throw new Error(
    `Could not load qrdx/types from dist. Build qrdx first (pnpm --filter qrdx build:inplace). (${error.message})`
  );
}

const MONO = { frame: "#111111", text: "#ffffff", accent: "#111111" };

export function make(entry) {
  const layout = layouts[entry.layout];
  if (!layout) throw new Error(`${entry.id}: no layout ${entry.layout}`);
  usage.length = 0;
  const out = layout({ cta: entry.cta, note: entry.note, ...entry.o });
  const used = [...usage];
  const problems = [];
  const palette = { ...MONO, ...(entry.colors ?? {}) };
  const labels = out.labels.map((label) => {
    const { _on, ...rest } = label;
    if (_on !== undefined) {
      const fg = resolveColor(label.color, palette);
      const bg = resolveColor(_on, palette);
      const ratio = contrast(fg, bg);
      if (ratio < 4.5) {
        problems.push(
          `label ${label.id}: contrast ${ratio.toFixed(2)} (${fg} on ${bg})`
        );
      }
    }
    if (label.text) {
      const font = labelFont(label) / (out.qr.size / 1000);
      const min = label.slot === "primary" ? 70 : 46;
      if (font < min) {
        problems.push(
          `label ${label.id} "${label.text}": font ${font.toFixed(0)} < ${min}`
        );
      }
    }
    return rest;
  });
  // Icons and motifs both go through motif() (motifs.mjs), which logs them
  const repeated = used.filter((name, index) => used.indexOf(name) !== index);
  if (repeated.length > 0)
    problems.push(`repeated icon: ${[...new Set(repeated)].join(", ")}`);
  const colors = { frame: palette.frame, text: palette.text };
  if (
    palette.accent &&
    (palette.accent !== palette.frame ||
      JSON.stringify(out).includes('"accent"'))
  ) {
    colors.accent = palette.accent;
  }
  const spec = {
    kind: "qrdx.frame",
    version: 1,
    artboard: { width: out.w, height: out.h },
    qr: out.qr,
    colors,
    shapes: out.shapes,
    labels,
  };
  const result = types.frameSpecSchema.safeParse(spec);
  if (!result.success) {
    problems.push(
      ...result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      )
    );
  }
  const seasonal =
    entry.collection === "holidays" || entry.collection === "seasons";
  return {
    frame: {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      category: seasonal ? "seasonal" : "use-case",
      collection: entry.collection,
      ...(entry.occasion ? { occasion: entry.occasion } : {}),
      contentTypes: entry.contentTypes ?? [],
      tags: entry.tags,
      license: "CC0-1.0",
      spec,
    },
    problems,
  };
}
