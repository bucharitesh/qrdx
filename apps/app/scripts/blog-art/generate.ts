// Writes the blog's illustrations to public/<file>.svg (codes.ts): the
// scenes from scenes.ts with the real codes from codes.ts rendered by qrdx.
//
// Run from apps/app: bun x tsx scripts/blog-art/generate.ts
//   [--out <dir>]            write somewhere else (default public)
//   [--theme light|dark]     bake one palette instead of both (for previews)
//   [ids...]                 only these illustrations (codes.ts keys)
//
// Each file carries the light palette and, under prefers-color-scheme: dark,
// the dark one, because a post has a single cover image.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BLOG_ART, BLOG_ART_IDS, type BlogArtId } from "./codes";
import { backdrop, GRADIENTS, qrSymbols, styleBlock } from "./kit";
import { SCENES } from "./scenes";

/** Files are drawn at this multiple of their viewBox. */
export const PIXEL_SCALE = 10 / 3;

export function renderArt(id: BlogArtId, theme: "auto" | "light" | "dark") {
  const art = BLOG_ART[id];
  const scene = SCENES[id];
  if (!scene) throw new Error(`No scene for ${id}`);
  const [w, h] = art.size;
  const body = scene();
  const symbols = art.codes
    .map((c) =>
      qrSymbols(c, {
        whole: body.includes(`"#${c.id}"`),
        body: body.includes(`"#${c.id}-body"`),
        eyes: body.includes(`"#${c.id}-eyes"`),
      }),
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.round(w * PIXEL_SCALE)}" height="${Math.round(h * PIXEL_SCALE)}">${styleBlock(theme)}<defs>${GRADIENTS}${symbols}</defs>${backdrop(w, h)}${body}</svg>\n`;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const [value] = args.splice(i, 2).slice(1);
    return value;
  };
  const out = flag("--out") ?? join(import.meta.dirname, "../../public");
  const theme = (flag("--theme") ?? "auto") as "auto" | "light" | "dark";
  const ids = (args.length > 0 ? args : BLOG_ART_IDS).filter(
    (id): id is BlogArtId => id in BLOG_ART && Boolean(SCENES[id as BlogArtId]),
  );
  for (const id of ids) {
    const file = join(out, `${BLOG_ART[id].file}.svg`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderArt(id, theme));
    console.log(file);
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main();
}
