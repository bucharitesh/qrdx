// Theme generator + judge. Samples ~600 combinations of the building blocks in
// lib/themes/blocks.ts, rejects any that fail a hard filter (contrast, real
// render + jsQR decode at 160 and 320 px, scan score), scores the rest for
// harmony, coherence and variety, keeps the best ~120 and writes labelled
// contact sheets for a human to pick the built-in library from.
//
//   cd apps/docs && npx tsx scripts/themes/generate.ts [--count 600] [--keep 120] [--seed 20261101]
//   cd apps/docs && npx tsx scripts/themes/generate.ts --library   (judge + sheet the built-in presets)
//
// Output: .claude/build/shots/themes/{candidates-*.png, library-*.png, *.json}
// Needs Chrome for the contact sheets (set CHROME_PATH if it isn't found).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getQRAsSVGDataUri } from "qrdx";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../../lib/themes/categories";
import { EYE_DOTS } from "../../lib/themes/blocks";
import { colorStops } from "../../lib/themes/color";
import {
  type ComposedTheme,
  composeTheme,
  createRandom,
} from "../../lib/themes/compose";
import type { ThemeCategory, ThemeStyles } from "../../types/theme";
import { defaultPresets } from "../../utils/qr-presets";
import { JUDGE_VALUE, judgeTheme, toQRProps, type Verdict } from "./judge";

const ROOT = resolve(__dirname, "../../../..");
const OUT = join(ROOT, ".claude/build/shots/themes");

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

interface Candidate {
  id: string;
  name: string;
  category: ThemeCategory;
  styles: ThemeStyles;
  palette: string;
  family: string;
  mixed: boolean;
  gradient: boolean;
  verdict?: Verdict;
  score?: number;
}

// ── Soft score ──────────────────────────────────────────────────────────────

const hex = (color: ThemeStyles["fgColor"]) =>
  colorStops(color, "#000000")[0] as string;

function toLab(color: string): [number, number, number] {
  const n = Number.parseInt(color.replace("#", ""), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 0xff);
  const g = lin((n >> 8) & 0xff);
  const b = lin(n & 0xff);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.950_47;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.088_83;
  const f = (t: number) => (t > 0.008_856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const deltaE = (a: string, b: string) => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/** Palette + pattern distance; under ~1 reads as "the same theme". */
function distance(a: ThemeStyles, b: ThemeStyles): number {
  const colors = (s: ThemeStyles) => [
    hex(s.bgColor),
    hex(s.fgColor),
    hex(s.eyeColor),
    hex(s.dotColor),
  ];
  const ca = colors(a);
  const cb = colors(b);
  const palette =
    ca.reduce((sum, color, i) => sum + deltaE(color, cb[i] as string), 0) /
    ca.length;
  let pattern = 0;
  if (a.bodyPattern !== b.bodyPattern) pattern += 1;
  if (a.cornerEyePattern !== b.cornerEyePattern) pattern += 0.6;
  if (a.cornerEyeDotPattern !== b.cornerEyeDotPattern) pattern += 0.3;
  if (typeof a.fgColor !== typeof b.fgColor) pattern += 0.5;
  if (Boolean(a.frame) !== Boolean(b.frame)) pattern += 0.5;
  return palette / 20 + pattern;
}

function softScore(candidate: Candidate, verdict: Verdict): number {
  const { styles } = candidate;
  let score = 0;
  // Scan headroom: the hard floor is 75; the editor also tests 96 px.
  score += ((verdict.score - 75) / 25) * 25;
  score += ((verdict.editorScore ?? 0) / 100) * 10;
  // Harmony: eye colors that clear 4.5:1 too, and a calm module contrast
  // (very high contrast on tinted paper reads harsh only on pure black/white).
  if (!verdict.warnings.includes("contrast")) score += 10;
  // Coherence: a pure family beats a mix; the matched eye centre beats a
  // secondary one.
  score += candidate.mixed ? 8 : 14;
  const matched = EYE_DOTS[styles.cornerEyePattern ?? "square"]?.[0];
  if (styles.cornerEyeDotPattern === matched) score += 6;
  if (verdict.inverted) score -= 6;
  if (styles.frame) score -= 2;
  return Math.round(score * 10) / 10;
}

// ── Selection with variety ──────────────────────────────────────────────────

/**
 * Greedy pick with variety: every category first gets an even share, then
 * the rest fills by value. Near-duplicates are skipped, palettes and bodies
 * are capped, light-on-dark stays at 10% and frames reach about 15%.
 */
function selectVaried(pool: Candidate[], keep: number): Candidate[] {
  const kept: Candidate[] = [];
  const count = (key: (c: Candidate) => string, value: string) =>
    kept.filter((c) => key(c) === value).length;
  const body = (c: Candidate) => c.styles.bodyPattern ?? "";
  const eye = (c: Candidate) => c.styles.cornerEyePattern ?? "";
  const dot = (c: Candidate) => c.styles.cornerEyeDotPattern ?? "";
  const maxInverted = Math.round(keep * 0.1);
  const framedTarget = Math.round(keep * 0.15);

  const pickFrom = (options: Candidate[], limit: number) => {
    const remaining = options.filter((c) => !kept.includes(c));
    for (let picked = 0; picked < limit && kept.length < keep; picked++) {
      let best: Candidate | null = null;
      let bestValue = Number.NEGATIVE_INFINITY;
      for (const candidate of remaining) {
        if (
          candidate.verdict?.inverted &&
          kept.filter((c) => c.verdict?.inverted).length >= maxInverted
        ) {
          continue;
        }
        if (count((c) => c.palette, candidate.palette) >= 3) continue;
        if (count(body, body(candidate)) >= 10) continue;
        if (kept.some((c) => distance(c.styles, candidate.styles) < 1)) {
          continue;
        }
        // Coverage: reward a body, eye, centre or palette we lack, and frames
        // until they make up their share.
        let value = candidate.score ?? 0;
        if (!count(body, body(candidate))) value += 8;
        if (!count(eye, eye(candidate))) value += 5;
        if (!count(dot, dot(candidate))) value += 3;
        if (!count((c) => c.palette, candidate.palette)) value += 6;
        if (
          candidate.styles.frame &&
          kept.filter((c) => c.styles.frame).length < framedTarget
        ) {
          value += 6;
        }
        if (value > bestValue) {
          bestValue = value;
          best = candidate;
        }
      }
      if (!best) return;
      kept.push(best);
      remaining.splice(remaining.indexOf(best), 1);
    }
  };

  const categories = CATEGORY_ORDER.filter((category) =>
    pool.some((c) => c.category === category),
  );
  const share = Math.floor(keep / Math.max(categories.length, 1));
  for (const category of categories) {
    pickFrom(
      pool.filter((c) => c.category === category),
      category === "dark" ? Math.min(share, maxInverted) : share,
    );
  }
  pickFrom(pool, keep - kept.length);
  return kept;
}

// ── Contact sheets ──────────────────────────────────────────────────────────

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

async function tile(
  label: string,
  styles: ThemeStyles,
  lines: string[],
): Promise<string> {
  const uri = await getQRAsSVGDataUri({
    ...toQRProps(styles, JUDGE_VALUE),
    size: 150,
  });
  const svg = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
  return `<figure><div class="qr">${svg}</div><figcaption><b>${escape(label)}</b>${lines
    .map((line) => `<span>${escape(line)}</span>`)
    .join("")}</figcaption></figure>`;
}

function sheetHtml(title: string, sections: string, dark: boolean): string {
  const page = dark ? "#0a0a0a" : "#ffffff";
  const ink = dark ? "#e5e5e5" : "#171717";
  const muted = dark ? "#8a8a8a" : "#737373";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:28px 32px;background:${page};color:${ink};font:12px/1.35 -apple-system,system-ui,sans-serif}
  h1{font-size:16px;margin:0 0 18px} h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${muted};margin:22px 0 10px}
  .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:14px 12px}
  figure{margin:0;min-width:0} .qr{display:grid;place-items:center;height:168px}
  .qr svg{max-width:150px;max-height:164px;width:auto;height:auto}
  figcaption{margin-top:6px;display:flex;flex-direction:column;gap:1px}
  figcaption b{font-size:12px;font-weight:600} figcaption span{color:${muted};font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style></head><body><h1>${escape(title)}</h1>${sections}</body></html>`;
}

async function screenshot(htmlFiles: { html: string; png: string }[]) {
  // biome-ignore lint/suspicious/noExplicitAny: plain JS helper
  const { launch } = (await import("../../e2e/cdp.mjs")) as any;
  const page = await launch({ width: 1440, height: 900 });
  try {
    for (const { html, png } of htmlFiles) {
      await page.goto(`file://${html}`, { wait: 400 });
      const height = await page.evaluate(
        "() => document.documentElement.scrollHeight",
      );
      const { data } = await page.cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: 1440, height, scale: 1 },
        captureBeyondViewport: true,
      });
      writeFileSync(png, Buffer.from(data, "base64"));
      console.log(`  wrote ${png}`);
    }
  } finally {
    await page.close();
  }
}

interface SheetEntry {
  label: string;
  category: ThemeCategory;
  styles: ThemeStyles;
  lines: string[];
}

/** Writes sheets of up to `perSheet` tiles, grouped by category. */
async function writeSheets(
  prefix: string,
  title: string,
  entries: SheetEntry[],
  perSheet: number,
) {
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    items: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.items.length > 0);

  // Pack whole categories into sheets.
  const sheets: (typeof byCategory)[] = [[]];
  let size = 0;
  for (const group of byCategory) {
    if (size > 0 && size + group.items.length > perSheet) {
      sheets.push([]);
      size = 0;
    }
    sheets.at(-1)?.push(group);
    size += group.items.length;
  }

  const files: { html: string; png: string }[] = [];
  for (const [index, groups] of sheets.entries()) {
    let sections = "";
    for (const group of groups) {
      const tiles = await Promise.all(
        group.items.map((item) => tile(item.label, item.styles, item.lines)),
      );
      sections += `<h2>${CATEGORY_LABELS[group.category]} · ${group.items.length}</h2><div class="grid">${tiles.join("")}</div>`;
    }
    for (const dark of [false, true]) {
      const name =
        sheets.length > 1
          ? `${prefix}-${index + 1}-${dark ? "dark" : "light"}`
          : `${prefix}-${dark ? "dark" : "light"}`;
      const html = join(OUT, `${name}.html`);
      writeFileSync(
        html,
        sheetHtml(
          `${title}${sheets.length > 1 ? ` (${index + 1}/${sheets.length})` : ""}`,
          sections,
          dark,
        ),
      );
      files.push({ html, png: join(OUT, `${name}.png`) });
    }
  }
  await screenshot(files);
}

const describe = (styles: ThemeStyles) =>
  `${styles.bodyPattern} · ${styles.cornerEyePattern} · ${styles.cornerEyeDotPattern}`;

const flags = (verdict: Verdict, styles: ThemeStyles) =>
  [
    `scan ${verdict.score}/${verdict.editorScore ?? "–"}`,
    verdict.inverted ? "inverted" : "",
    typeof styles.fgColor === "object" ? "gradient" : "",
    styles.frame ? `frame ${styles.frame.style}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

// ── Modes ───────────────────────────────────────────────────────────────────

async function judgeLibrary() {
  const entries: SheetEntry[] = [];
  const failures: string[] = [];
  const ids = Object.keys(defaultPresets);
  for (const id of ids) {
    const preset = defaultPresets[id];
    if (!preset) continue;
    const verdict = await judgeTheme(preset.styles);
    if (!verdict.pass) failures.push(`${id}: ${verdict.reasons.join("; ")}`);
    entries.push({
      label: `${preset.label ?? id}${verdict.pass ? "" : " ✕"}`,
      category: preset.category ?? "brand",
      styles: preset.styles,
      lines: [
        `${id} · ${(preset.tags ?? []).join(", ")}`,
        describe(preset.styles),
        flags(verdict, preset.styles),
      ],
    });
  }
  console.log(
    `${ids.length} presets, ${ids.length - failures.length} pass, ${failures.length} fail`,
  );
  for (const failure of failures) console.log(`  ✕ ${failure}`);
  await writeSheets("library", `Built-in library · ${ids.length} themes`, entries, 200);
  return failures.length;
}

async function generate() {
  const count = arg("count", 600);
  const keep = arg("keep", 120);
  const seed = arg("seed", 20_261_101);
  const random = createRandom(seed);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  let attempts = 0;
  while (candidates.length < count && attempts < count * 4) {
    attempts++;
    const theme: ComposedTheme = composeTheme(random);
    const key = JSON.stringify(theme.styles);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      id: `c${candidates.length + 1}`,
      name: theme.name,
      category: theme.category,
      styles: theme.styles,
      palette: theme.palette.id,
      family: theme.family.id,
      mixed: theme.mixed,
      gradient: theme.gradient,
    });
  }

  const reasons = new Map<string, number>();
  const patternStats = new Map<string, { pass: number; total: number }>();
  const bump = (key: string, pass: boolean) => {
    const stat = patternStats.get(key) ?? { pass: 0, total: 0 };
    stat.total++;
    if (pass) stat.pass++;
    patternStats.set(key, stat);
  };
  const started = Date.now();
  for (const [index, candidate] of candidates.entries()) {
    const verdict = await judgeTheme(candidate.styles);
    candidate.verdict = verdict;
    if (verdict.pass) candidate.score = softScore(candidate, verdict);
    for (const reason of verdict.reasons) {
      const kind = reason.replace(/[\d.]+/g, "#").replace(/\(.*\)/, "").trim();
      reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
    }
    const { styles } = candidate;
    bump(`body ${styles.bodyPattern}`, verdict.pass);
    bump(`eye ${styles.cornerEyePattern}`, verdict.pass);
    bump(`dot ${styles.cornerEyeDotPattern}`, verdict.pass);
    bump(`pair ${styles.bodyPattern}/${styles.cornerEyePattern}`, verdict.pass);
    bump(`palette ${candidate.palette}`, verdict.pass);
    if ((index + 1) % 50 === 0) {
      const passed = candidates.slice(0, index + 1).filter((c) => c.verdict?.pass).length;
      console.log(
        `  judged ${index + 1}/${candidates.length} (${passed} pass, ${Math.round((Date.now() - started) / 1000)}s)`,
      );
    }
  }

  const passed = candidates
    .filter((c) => c.verdict?.pass)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const invertedPassed = passed.filter((c) => c.verdict?.inverted).length;
  const kept = selectVaried(passed, keep);

  console.log(`\nGenerated ${candidates.length} · passed ${passed.length} (${invertedPassed} inverted) · kept ${kept.length}`);
  console.log("Rejections by reason:");
  for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${reason}`);
  }
  const weak = [...patternStats]
    .filter(([key, stat]) => !key.startsWith("pair") && stat.total >= 4 && stat.pass / stat.total < 0.8)
    .sort((a, b) => a[1].pass / a[1].total - b[1].pass / b[1].total);
  console.log("Weak building blocks (pass rate < 80%):");
  for (const [key, stat] of weak) {
    console.log(`  ${key}: ${stat.pass}/${stat.total}`);
  }
  const failingPairs = [...patternStats]
    .filter(([key, stat]) => key.startsWith("pair") && stat.pass === 0 && stat.total >= 2)
    .map(([key, stat]) => `${key.slice(5)} (${stat.total})`);
  if (failingPairs.length) console.log(`Pairs that never passed: ${failingPairs.join(", ")}`);

  writeFileSync(
    join(OUT, "candidates.json"),
    JSON.stringify(
      {
        seed,
        generated: candidates.length,
        passed: passed.length,
        kept: kept.length,
        reasons: Object.fromEntries(reasons),
        patternStats: Object.fromEntries(patternStats),
        candidates,
      },
      null,
      1,
    ),
  );
  writeFileSync(join(OUT, "kept.json"), JSON.stringify(kept, null, 1));

  await writeSheets(
    "candidates",
    `Generated candidates · ${kept.length} kept of ${passed.length} passing (${candidates.length} generated, seed ${seed})`,
    kept.map((candidate) => ({
      label: `${candidate.id} ${candidate.name}`,
      category: candidate.category,
      styles: candidate.styles,
      lines: [
        `${candidate.palette} · ${candidate.family}${candidate.mixed ? " (mix)" : ""} · ${candidate.score}`,
        describe(candidate.styles),
        flags(candidate.verdict as Verdict, candidate.styles),
      ],
    })),
    40,
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--library")) {
    process.exitCode = (await judgeLibrary()) > 0 ? 1 : 0;
    return;
  }
  await generate();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
