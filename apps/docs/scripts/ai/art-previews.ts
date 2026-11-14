/**
 * Makes the preview image of each AI art style preset
 * (components/sections/ai-art/presets.ts) on the app's real art pipeline
 * (lib/ai/art-image.ts) through Vercel AI Gateway, at the default QR
 * visibility and creativity, for a link the length of a QRdx short link.
 *
 * A preview is kept only when the delivered image scans three ways: the
 * pipeline's own gate (jsQR plus the phone-camera model), zbarimg, and the
 * in-browser image scan score at "Great" (qrdx getImageScanScore in headless
 * Chrome, the score the AI art result card shows). A preset that fails gets
 * one re-roll (--attempts). Kept previews go to
 * public/images/ai-art-styles/<id>.webp (256 px), which the preset picker
 * loads lazily.
 *
 * With --looks it makes the quick looks' previews instead
 * (components/sections/ai-art/looks.ts): one fixed subject
 * (ART_LOOK_PREVIEW_SUBJECT) with each look added the way lib/ai/art-run.ts
 * adds it, kept the same way, to public/images/ai-art-looks/<id>.webp
 * (128 px, for the chips).
 *
 * Usage (from apps/docs, with the engine built: bun run --filter qrdx build:inplace;
 * needs zbarimg and cwebp: brew install zbar webp):
 *   AI_GATEWAY_API_KEY=... bun x tsx --conditions=react-server scripts/ai/art-previews.ts \
 *     [--looks] [--missing | --ids zen-garden,coral-reef | --all] [--attempts 2] \
 *     [--max-cost 5] [--ledger ./art-previews-spend.json] [--out ./art-previews-out] \
 *     [--concurrency 4] [--dry-run]
 *   bun x tsx --conditions=react-server scripts/ai/art-previews.ts --rescore ./art-previews-out
 *     (no key, no cost: scores the images an earlier run saved again)
 *
 * Every attempt is a paid gateway call. --max-cost caps the total in the
 * ledger file, which adds up every run that shares it: no new call starts
 * once the spend so far plus the calls in flight could pass it. A call
 * whose cost isn't reported counts at ESTIMATED_COST_USD. --dry-run uses a
 * fake model that returns the control code itself. It never touches a
 * database: DATABASE_URL is replaced with an unreachable placeholder.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type {
  ArtImageModel,
  ArtModelImage,
  ControlImage,
} from "../../lib/ai/art-image";

/** Real and live, and as long as a QRdx short link (QR version 4 at level H). */
const PAYLOAD = "https://qrdx.dev/playground";
/**
 * What a call costs when the gateway doesn't say, and what each call in
 * flight reserves against --max-cost: above the $0.023 to $0.062 measured.
 */
const ESTIMATED_COST_USD = 0.07;
const PREVIEW_SIZE = { presets: 256, looks: 128 } as const;
const PREVIEW_QUALITY = 72;
/**
 * The preview trims a tenth off each side of the 1024 px image, most of the
 * quiet zone, so the art fills the picker's tile.
 */
const PREVIEW_CROP = { offset: 102, side: 820 };
const DOCS = resolve(import.meta.dirname, "../..");
const PREVIEW_DIR = {
  presets: join(DOCS, "public/images/ai-art-styles"),
  looks: join(DOCS, "public/images/ai-art-looks"),
} as const;
type PreviewKind = keyof typeof PREVIEW_DIR;

/** What one preview is made from: a preset, or the subject in a look. */
interface PreviewTarget {
  id: string;
  prompt: string;
  negativePrompt?: string;
}

interface Attempt {
  attempt: number;
  delivered: boolean;
  blend: string | null;
  blendStrength: number | null;
  zbar: boolean | null;
  /** In-browser image scan score, 0–100 */
  score: number | null;
  grade: string | null;
  /** The browser decoded exactly PAYLOAD */
  decodes: boolean | null;
  costUsd: number | null;
  costEstimated: boolean;
  latencyMs: number | null;
  error?: string;
}

interface PresetResult {
  id: string;
  prompt: string;
  attempts: Attempt[];
  kept: boolean;
}

interface Ledger {
  spentUsd: number;
  calls: number;
  estimatedCalls: number;
}

function fail(message: string): never {
  console.error(`art-previews: ${message}`);
  process.exit(1);
}

const hasTool = (command: string, flag: string) =>
  spawnSync(command, [flag], { encoding: "utf8" }).status === 0;

const fromDataUrl = (url: string) =>
  Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

function zbar(file: string): boolean {
  const run = spawnSync("zbarimg", ["--quiet", "--raw", file], {
    encoding: "utf8",
  });
  // One decoded value per line; a pass needs a line that is exactly PAYLOAD.
  return (
    run.status === 0 && run.stdout.split("\n").some((line) => line === PAYLOAD)
  );
}

const passes = (a: Attempt) =>
  a.delivered && a.zbar === true && a.decodes === true && a.grade === "great";

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as T)
    : fallback;
}

async function pool<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, size) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift())
        await run(item);
    }),
  );
}

/** Scores files in headless Chrome with the app's in-browser scan score. */
async function scoreInBrowser(
  files: string[],
): Promise<
  Map<
    string,
    { data: string | null; score: number | null; grade: string | null }
  >
> {
  const scores = new Map<
    string,
    { data: string | null; score: number | null; grade: string | null }
  >();
  if (files.length === 0) return scores;
  const work = mkdtempSync(join(tmpdir(), "qrdx-art-previews-"));
  const bundle = spawnSync(
    "bun",
    [
      "build",
      join(DOCS, "scripts/ai/art-previews-scorer.ts"),
      "--target=browser",
      "--format=esm",
      "--define",
      'process.env.NODE_ENV="production"',
      "--outfile",
      join(work, "scorer.js"),
    ],
    { cwd: DOCS, encoding: "utf8" },
  );
  if (bundle.status !== 0) fail(`bun build failed: ${bundle.stderr}`);
  const byUrl = new Map(files.map((file, i) => [`/img/${i}.png`, file]));
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><script type="module" src="/scorer.js"></script>',
      );
      return;
    }
    const file =
      url === "/scorer.js" ? join(work, "scorer.js") : byUrl.get(url);
    if (!(file && existsSync(file))) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      "content-type",
      extname(file) === ".js" ? "text/javascript" : "image/png",
    );
    res.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  // The e2e suites' CDP driver: Chrome headless and muted, always closed.
  const { launch } = (await import("../../e2e/cdp.mjs")) as {
    launch: (options?: object) => Promise<{
      goto: (url: string, options?: { wait?: number }) => Promise<void>;
      waitFor: (fn: string, options?: object) => Promise<unknown>;
      evaluate: (fn: string, ...args: unknown[]) => Promise<unknown>;
      close: () => Promise<void>;
    }>;
  };
  const browser = await launch({ width: 800, height: 600 });
  try {
    await browser.goto(`http://127.0.0.1:${port}/`, { wait: 300 });
    await browser.waitFor("() => typeof window.scorePreviews === 'function'");
    const urls = [...byUrl.keys()];
    for (let i = 0; i < urls.length; i += 20) {
      const batch = urls.slice(i, i + 20);
      const results = (await browser.evaluate(
        "(urls) => window.scorePreviews(urls)",
        batch,
      )) as {
        url: string;
        data: string | null;
        score: number | null;
        grade: string | null;
      }[];
      for (const result of results) {
        const file = byUrl.get(result.url);
        if (file) scores.set(file, result);
      }
    }
  } finally {
    await browser.close();
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
  return scores;
}

function writePreview(delivered: string, id: string, kind: PreviewKind) {
  mkdirSync(PREVIEW_DIR[kind], { recursive: true });
  const run = spawnSync(
    "cwebp",
    [
      "-quiet",
      "-q",
      String(PREVIEW_QUALITY),
      "-m",
      "6",
      "-crop",
      String(PREVIEW_CROP.offset),
      String(PREVIEW_CROP.offset),
      String(PREVIEW_CROP.side),
      String(PREVIEW_CROP.side),
      "-resize",
      String(PREVIEW_SIZE[kind]),
      String(PREVIEW_SIZE[kind]),
      delivered,
      "-o",
      join(PREVIEW_DIR[kind], `${id}.webp`),
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0) fail(`cwebp failed for ${id}: ${run.stderr}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      ids: { type: "string" },
      looks: { type: "boolean", default: false },
      missing: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      attempts: { type: "string", default: "2" },
      "max-cost": { type: "string" },
      ledger: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string", default: "4" },
      rescore: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (!(hasTool("zbarimg", "--version") && hasTool("cwebp", "-version"))) {
    fail("needs zbarimg and cwebp (brew install zbar webp)");
  }
  const dryRun = values["dry-run"];
  const rescore = values.rescore ? resolve(values.rescore) : null;
  const maxAttempts = Number(values.attempts);
  if (!(Number.isInteger(maxAttempts) && maxAttempts > 0)) {
    fail("--attempts must be a positive integer");
  }
  const maxCost = values["max-cost"] ? Number(values["max-cost"]) : null;
  if (!(rescore || dryRun)) {
    if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
      fail(
        "AI_GATEWAY_API_KEY is not set (each attempt is a paid call); try --dry-run",
      );
    }
    if (!(maxCost && maxCost > 0)) fail("--max-cost is required for paid runs");
  }
  process.env.DATABASE_URL = "postgres://art-previews@127.0.0.1:1/none";
  // The app's other required variables; nothing here signs or links anything.
  process.env.NEXT_PUBLIC_APP_URL ??= "https://qrdx.dev";
  process.env.BETTER_AUTH_SECRET ??= "art-previews-placeholder-not-a-secret";

  const [pipeline, config, presets, looks, artPrompt, providers] =
    await Promise.all([
      import("../../lib/ai/art-image"),
      import("../../components/sections/ai-art/config"),
      import("../../components/sections/ai-art/presets"),
      import("../../components/sections/ai-art/looks"),
      import("../../lib/ai/art-prompt"),
      import("../../lib/ai/providers"),
    ]);
  const kind: PreviewKind = values.looks ? "looks" : "presets";
  const candidates: PreviewTarget[] =
    kind === "looks"
      ? looks.ART_LOOKS.map((look) => {
          const composed = artPrompt.composeArtPrompt(
            looks.ART_LOOK_PREVIEW_SUBJECT,
            look.id,
          );
          return {
            id: look.id,
            prompt: composed.prompt,
            negativePrompt: composed.avoid,
          };
        })
      : presets.AI_ART_PRESETS;

  const out = resolve(
    rescore ??
      values.out ??
      // Separate from the presets' run: some looks share a preset's id.
      join(tmpdir(), kind === "looks" ? "qrdx-art-looks" : "qrdx-art-previews"),
  );
  mkdirSync(out, { recursive: true });
  const resultsFile = join(out, "results.json");
  const results = new Map(
    readJson<PresetResult[]>(resultsFile, []).map((r) => [r.id, r]),
  );
  const ledgerFile = resolve(values.ledger ?? join(out, "spend.json"));
  const ledger = readJson<Ledger>(ledgerFile, {
    spentUsd: 0,
    calls: 0,
    estimatedCalls: 0,
  });
  const save = () => {
    writeFileSync(resultsFile, JSON.stringify([...results.values()], null, 2));
    writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));
  };
  const fileOf = (id: string, attempt: number, kind: "raw" | "delivered") =>
    join(out, id, `${attempt}-${kind}.png`);

  const wanted = values.ids?.split(",").map((id) => id.trim());
  const targets = candidates.filter((preset) =>
    wanted
      ? wanted.includes(preset.id)
      : values.all || rescore
        ? true
        : values.missing
          ? !existsSync(join(PREVIEW_DIR[kind], `${preset.id}.webp`))
          : false,
  );
  if (wanted) {
    for (const id of wanted) {
      if (!targets.some((preset) => preset.id === id))
        fail(`Unknown ${kind === "looks" ? "look" : "preset"} ${id}`);
    }
  }
  if (targets.length === 0)
    fail("Nothing to do: pass --missing, --ids or --all");

  const control: ControlImage = await pipeline.renderControlImage(PAYLOAD);
  const fakeModel: ArtImageModel = async () => ({
    data: control.png,
    mediaType: "image/png",
  });
  const gatewayCost = async (image: ArtModelImage): Promise<number | null> => {
    const gateway = image.providerMetadata?.gateway as
      | { cost?: unknown; generationId?: unknown }
      | undefined;
    const cost = Number(gateway?.cost);
    if (gateway?.cost != null && Number.isFinite(cost)) return cost;
    if (typeof gateway?.generationId !== "string") return null;
    try {
      return (
        await providers
          .aiGateway()
          .getGenerationInfo({ id: gateway.generationId })
      ).totalCost;
    } catch {
      return null;
    }
  };

  let inFlight = 0;
  let skippedForCost = 0;
  const generate = async (
    preset: (typeof targets)[number],
    attempt: number,
  ) => {
    const record = results.get(preset.id) ?? {
      id: preset.id,
      prompt: preset.prompt,
      attempts: [],
      kept: false,
    };
    results.set(preset.id, record);
    if (
      !dryRun &&
      maxCost !== null &&
      ledger.spentUsd + (inFlight + 1) * ESTIMATED_COST_USD > maxCost
    ) {
      skippedForCost++;
      return;
    }
    inFlight++;
    mkdirSync(join(out, preset.id), { recursive: true });
    const entry: Attempt = {
      attempt,
      delivered: false,
      blend: null,
      blendStrength: null,
      zbar: null,
      score: null,
      grade: null,
      decodes: null,
      costUsd: null,
      costEstimated: false,
      latencyMs: null,
    };
    let raw: ArtModelImage | undefined;
    const started = performance.now();
    const base = dryRun ? fakeModel : pipeline.gatewayArtModel;
    const timed: ArtImageModel = async (request) => {
      raw = await base(request);
      entry.latencyMs = Math.round(performance.now() - started);
      return raw;
    };
    try {
      const variant = await pipeline.generateArtVariant({
        text: PAYLOAD,
        prompt: preset.prompt,
        negativePrompt: preset.negativePrompt,
        visibility: config.ART_QR_VISIBILITY.default,
        creativity: config.ART_CREATIVITY.default,
        seed: attempt,
        control,
        signal: new AbortController().signal,
        model: timed,
        // Longer than the route's limit: a call cut short may still be billed.
        timeoutMs: 120_000,
      });
      entry.delivered = true;
      entry.blend = variant.blend;
      entry.blendStrength = variant.blendStrength;
      const delivered = fileOf(preset.id, attempt, "delivered");
      writeFileSync(delivered, fromDataUrl(variant.imageUrl));
      entry.zbar = zbar(delivered);
    } catch (error) {
      const coded = error as { code?: string; message?: string };
      entry.error = coded.code ?? coded.message ?? String(error);
    }
    if (raw) writeFileSync(fileOf(preset.id, attempt, "raw"), raw.data);
    if (!dryRun) {
      const cost = raw ? await gatewayCost(raw) : null;
      entry.costUsd = cost ?? ESTIMATED_COST_USD;
      entry.costEstimated = cost === null;
      ledger.spentUsd =
        Math.round((ledger.spentUsd + entry.costUsd) * 1e6) / 1e6;
      ledger.calls++;
      if (cost === null) ledger.estimatedCalls++;
    }
    inFlight--;
    record.attempts.push(entry);
    save();
    console.log(
      `  ${preset.id} #${attempt}: ${entry.delivered ? `delivered (${entry.blend} ${entry.blendStrength}), zbar ${entry.zbar ? "reads" : "fails"}` : `not delivered (${entry.error})`}${entry.latencyMs ? `, ${(entry.latencyMs / 1000).toFixed(1)} s` : ""}${entry.costUsd === null ? "" : `, $${entry.costUsd.toFixed(4)}${entry.costEstimated ? " (estimated)" : ""}`} · spent $${ledger.spentUsd.toFixed(2)}`,
    );
  };

  /** Browser-scores every delivered attempt that has no score yet. */
  const scorePending = async () => {
    const pending: { record: PresetResult; entry: Attempt; file: string }[] =
      [];
    for (const record of results.values()) {
      for (const entry of record.attempts) {
        const file = fileOf(record.id, entry.attempt, "delivered");
        if (
          entry.delivered &&
          (rescore || entry.grade === null) &&
          existsSync(file)
        ) {
          pending.push({ record, entry, file });
        }
      }
    }
    const scores = await scoreInBrowser(pending.map((p) => p.file));
    for (const { entry, file } of pending) {
      const score = scores.get(file);
      entry.score = score?.score ?? null;
      entry.grade = score?.grade ?? null;
      entry.decodes = score ? score.data === PAYLOAD : false;
      if (rescore) entry.zbar = zbar(file);
    }
    save();
  };

  /** Writes the preview of each preset this run covered that has a keeper. */
  const settle = () => {
    for (const preset of targets) {
      const record = results.get(preset.id);
      if (!record) continue;
      const best = record.attempts
        .filter(passes)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      record.kept = Boolean(best);
      if (best && !dryRun) {
        writePreview(
          fileOf(record.id, best.attempt, "delivered"),
          record.id,
          kind,
        );
      }
    }
    save();
  };

  if (!rescore) {
    console.log(
      `${dryRun ? "Dry run: " : ""}${targets.length} ${kind}, up to ${maxAttempts} attempts each → ${out}. Spent so far: $${ledger.spentUsd.toFixed(2)}${maxCost ? ` of $${maxCost}` : ""}.`,
    );
    // A changed prompt starts over, with its earlier images gone.
    for (const preset of targets) {
      const record = results.get(preset.id);
      if (record && record.prompt !== preset.prompt) {
        results.set(preset.id, {
          id: preset.id,
          prompt: preset.prompt,
          attempts: [],
          kept: false,
        });
        rmSync(join(out, preset.id), { recursive: true, force: true });
      }
    }
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const round = targets.filter((preset) => {
        const tries = results.get(preset.id)?.attempts ?? [];
        return !tries.some(passes) && tries.length < attempt;
      });
      if (round.length === 0) continue;
      console.log(`Round ${attempt}: ${round.length} ${kind}`);
      await pool(round, Number(values.concurrency), (preset) =>
        generate(preset, (results.get(preset.id)?.attempts.length ?? 0) + 1),
      );
      await scorePending();
    }
  } else {
    await scorePending();
  }
  settle();

  const done = targets
    .map((preset) => results.get(preset.id))
    .filter(Boolean) as PresetResult[];
  const kept = done.filter((r) => r.kept);
  const firstTry = done.filter((r) => r.attempts[0] && passes(r.attempts[0]));
  const attempts = done.flatMap((r) => r.attempts);
  console.log(
    `\nKept ${kept.length} of ${done.length} ${kind} (${firstTry.length} on the first try). Attempts: ${attempts.length}, delivered ${attempts.filter((a) => a.delivered).length}, zbar ${attempts.filter((a) => a.zbar).length}, Great ${attempts.filter((a) => a.grade === "great" && a.decodes).length}, all three ${attempts.filter(passes).length}.`,
  );
  if (skippedForCost)
    console.log(`${skippedForCost} calls not made: --max-cost reached.`);
  console.log(
    `Spent $${ledger.spentUsd.toFixed(4)} in ${ledger.calls} calls (${ledger.estimatedCalls} estimated) · ${ledgerFile}`,
  );
  const dropped = done.filter((r) => !r.kept).map((r) => r.id);
  if (dropped.length) console.log(`No preview: ${dropped.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
