// US spelling checks for text people and models read (the site is in US
// English). Only prose is checked: identifiers such as the `eyeCentres`
// schema key are API contracts and stay as they are.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const UK =
  /\b(colours?|coloured|centres?|centred|honour\w*|grey|catalogue|favourite\w*|behaviour\w*|organis\w*|customis\w*|recognis\w*|optimis\w*|analys(?:e|ed|es|ing))\b/gi;

/** The UK spellings in `text`. */
export const ukWords = (text: string) =>
  [...text.matchAll(UK)].map((match) => match[0]);

/** Source text with comments taken out (prose in comments isn't shown). */
export function sourceCode(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Every .ts and .tsx file under `dir`. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
