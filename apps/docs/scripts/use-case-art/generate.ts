// Writes the home page's use-case illustrations to
// public/images/use-cases/<id>-light.svg and <id>-dark.svg: the scenes from
// scenes.ts with the real code from codes.ts rendered by qrdx.
//
// Run from apps/docs: pnpm exec tsx scripts/use-case-art/generate.ts [outDir]
//
// The light and dark files share one drawing; only the colour variables in
// their <style> differ (the hero scene's tokens, from kit.ts). They're static
// files rather than inline SVG so the prerendered home page stays small.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { USE_CASE_ART_IDS, USE_CASE_CODES, type UseCaseArtId } from "./codes";
import { DEFS, qrSymbol, type Theme, themeStyle } from "./kit";
import { SCENES } from "./scenes";

/** The code as qrdx draws it, with the theme classes in place of colours. */
export function codeMarkup(id: UseCaseArtId) {
  const { value, style } = USE_CASE_CODES[id];
  return qrSymbol("code", value, style);
}

export function renderArt(id: UseCaseArtId, theme: Theme) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="800" height="600">${themeStyle(theme)}<defs>${DEFS}${codeMarkup(id)}</defs>${SCENES[id]()}</svg>\n`;
}

const outDir =
  process.argv[2] ?? join(import.meta.dirname, "../../public/images/use-cases");
mkdirSync(outDir, { recursive: true });
for (const id of USE_CASE_ART_IDS) {
  for (const theme of ["light", "dark"] as const) {
    const file = join(outDir, `${id}-${theme}.svg`);
    writeFileSync(file, renderArt(id, theme));
    console.log(file);
  }
}
