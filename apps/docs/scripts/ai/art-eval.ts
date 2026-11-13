/**
 * Compares AI art models on the app's real art pipeline (lib/ai/art-image.ts)
 * through Vercel AI Gateway: the same control QR code, the same 3 prompts and
 * the same seeds for every model. Each result is decoded with the scanner the
 * app's scan check uses (qrdx scanQRPixels, jsQR plus a phone-camera model)
 * and, when it's installed, with zbarimg. Prints a table and saves every
 * image: the model's raw image, what the pipeline delivers, and what the old
 * pipeline (Image QR blend whenever the raw image didn't scan) made of the
 * same raw image. With ffmpeg installed it also writes one sheet per model
 * and prompt: a row per seed, raw | old | new.
 *
 * Usage (from apps/docs, with the engine built: bun run --filter qrdx build:inplace):
 *   AI_GATEWAY_API_KEY=... bun x tsx --conditions=react-server scripts/ai/art-eval.ts \
 *     [--n 4] [--models google/gemini-nano-banana-2.1,openai/gpt-image-2] \
 *     [--out ./art-eval-out] [--concurrency 2] [--timeout 45000] \
 *     [--visibility 50] [--max-cost 2]
 *   bun x tsx --conditions=react-server scripts/ai/art-eval.ts --replay ./art-eval-out
 *     (no key, no cost: the raw images saved by an earlier run stand in for
 *     the models, so a pipeline change can be compared on the same images)
 *   bun x tsx --conditions=react-server scripts/ai/art-eval.ts --dry-run
 *     (no key, no network: a fake model returns the control code itself)
 *
 * Every image is a paid gateway call: n × 3 prompts × models (48 by default).
 * --max-cost stops starting new calls once the reported spend reaches it.
 * Candidates are ART_EVAL_CANDIDATES in lib/ai/models.ts. It never touches a
 * database: DATABASE_URL is replaced with an unreachable placeholder.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type {
  ArtImageModel,
  ArtModelImage,
  ControlImage,
} from "../../lib/ai/art-image";
import type { ArtModelChoice } from "../../lib/ai/models";

const TEXT = "https://qrdx.dev/q/Ab3dE9x";
/** A scene, a city at night and a painting style: three kinds of prompt. */
const PRESET_IDS = ["zen-garden", "neon-city", "botanical-watercolor"];

interface Attempt {
  model: string;
  prompt: string;
  seed: number;
  /** The model answered with an image */
  responded: boolean;
  /** Delivered by the pipeline, verified to scan */
  delivered: boolean;
  /** How it was made to scan: none (as drawn), least or image-qr */
  blend: string | null;
  /** 0–1, 0 as drawn */
  blendStrength: number | null;
  /** The old pipeline delivered the same raw image (as drawn or Image QR) */
  oldDelivered: boolean;
  zbarRaw: boolean | null;
  zbarDelivered: boolean | null;
  zbarOld: boolean | null;
  latencyMs: number | null;
  /** Time from the model's image to the delivered one (scan checks, blend) */
  blendMs: number | null;
  costUsd: number | null;
  error?: string;
  files: string[];
}

function fail(message: string): never {
  console.error(`art-eval: ${message}`);
  process.exit(1);
}

const slug = (value: string) => value.replace(/[^a-z0-9.-]+/gi, "_");
const extension = (mediaType: string) =>
  mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};
const percent = (part: number, whole: number) =>
  whole === 0
    ? "n/a"
    : `${Math.round((part / whole) * 100)}% (${part}/${whole})`;
const fromDataUrl = (url: string) =>
  Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

function hasTool(command: string, flag: string): boolean {
  return spawnSync(command, [flag], { encoding: "utf8" }).status === 0;
}

/** zbarimg's reading of a saved image: true when it decodes to the content. */
function zbar(file: string): boolean {
  const run = spawnSync("zbarimg", ["--quiet", "--raw", file], {
    encoding: "utf8",
  });
  return run.status === 0 && run.stdout.split("\n").includes(TEXT);
}

/** The gateway's cost for one response, from its metadata or the generation log. */
async function costOf(
  image: ArtModelImage,
  lookUp: (id: string) => Promise<number | null>,
): Promise<number | null> {
  const gateway = image.providerMetadata?.gateway as
    | { cost?: unknown; generationId?: unknown }
    | undefined;
  const cost = Number(gateway?.cost);
  if (gateway?.cost != null && Number.isFinite(cost)) return cost;
  return typeof gateway?.generationId === "string"
    ? lookUp(gateway.generationId)
    : null;
}

async function pool<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, size) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await run(item);
      }
    }),
  );
}

/** One sheet per model and prompt: a row per seed, raw | old | new. */
function writeSheets(out: string, attempts: Attempt[]): string[] {
  const sheets: string[] = [];
  const groups = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const key = `${attempt.model}|${attempt.prompt}`;
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  }
  for (const [key, group] of groups) {
    const [model, prompt] = key.split("|") as [string, string];
    const rows = group
      .filter((a) => a.responded)
      .sort((a, b) => a.seed - b.seed)
      .map((a) => {
        const stem = join(out, slug(model), `${prompt}-${a.seed}`);
        const raw = a.files.find((f) => f.includes("-raw."));
        return [raw, `${stem}-old.png`, `${stem}-delivered.png`];
      })
      .filter((files) => files.every((f) => f && existsSync(f)));
    if (rows.length === 0) continue;
    const inputs = rows.flat().flatMap((file) => ["-i", file as string]);
    const cell = 512;
    const scaled = rows
      .flat()
      .map((_, i) => `[${i}]scale=${cell}:${cell}[c${i}]`)
      .join(";");
    const hstacks = rows
      .map((_, r) => `[c${r * 3}][c${r * 3 + 1}][c${r * 3 + 2}]hstack=3[r${r}]`)
      .join(";");
    const stack =
      rows.length === 1
        ? "[r0]null[out]"
        : `${rows.map((_, r) => `[r${r}]`).join("")}vstack=${rows.length}[out]`;
    const file = join(out, `sheet-${slug(model)}-${prompt}.png`);
    const run = spawnSync(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-y",
        ...inputs,
        "-filter_complex",
        `${scaled};${hstacks};${stack}`,
        "-map",
        "[out]",
        file,
      ],
      { encoding: "utf8" },
    );
    if (run.status === 0) sheets.push(file);
    else console.error(`ffmpeg failed for ${file}: ${run.stderr}`);
  }
  return sheets;
}

async function main() {
  const { values } = parseArgs({
    options: {
      n: { type: "string", default: "4" },
      models: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string", default: "2" },
      timeout: { type: "string" },
      visibility: { type: "string" },
      "max-cost": { type: "string" },
      replay: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const n = Number(values.n);
  if (!(Number.isInteger(n) && n > 0)) fail("--n must be a positive integer");
  const dryRun = values["dry-run"];
  const replay = values.replay ? resolve(values.replay) : null;
  const maxCost = values["max-cost"] ? Number(values["max-cost"]) : null;
  if (maxCost !== null && !(maxCost > 0)) fail("--max-cost must be positive");
  if (!(dryRun || replay || process.env.AI_GATEWAY_API_KEY?.trim())) {
    fail(
      "AI_GATEWAY_API_KEY is not set. Set it to run the eval (each image is a paid call), or pass --dry-run or --replay to check the pipeline without it.",
    );
  }
  // Never the shared database: nothing here queries one, and this makes sure.
  process.env.DATABASE_URL = "postgres://art-eval@127.0.0.1:1/none";
  // The app's other required variables; nothing here signs or links anything.
  process.env.NEXT_PUBLIC_APP_URL ??= "https://qrdx.dev";
  process.env.BETTER_AUTH_SECRET ??= "art-eval-placeholder-not-a-secret";

  // After the env is set: env.ts validates on import. (The pipeline decodes
  // with qrdx itself; importing "qrdx" here directly would take its ESM build,
  // which fails under the react-server condition.)
  const [pipeline, models, config, presets, providers] = await Promise.all([
    import("../../lib/ai/art-image"),
    import("../../lib/ai/models"),
    import("../../components/sections/ai-art/config"),
    import("../../components/sections/ai-art/presets"),
    import("../../lib/ai/providers"),
  ]);
  const visibility = values.visibility
    ? Number(values.visibility)
    : config.ART_QR_VISIBILITY.default;

  const wanted = values.models?.split(",").map((id) => id.trim());
  const candidates: ArtModelChoice[] = wanted
    ? wanted.map(
        (id) =>
          models.ART_EVAL_CANDIDATES.find((choice) => choice.model === id) ??
          fail(
            `Unknown model ${id}. Candidates: ${models.ART_EVAL_CANDIDATES.map((c) => c.model).join(", ")}`,
          ),
      )
    : [...models.ART_EVAL_CANDIDATES];
  const prompts = PRESET_IDS.map(
    (id) =>
      presets.AI_ART_PRESETS.find((preset) => preset.id === id) ??
      fail(`Preset ${id} is gone; update PRESET_IDS`),
  );

  const out = resolve(
    values.out ??
      join(
        tmpdir(),
        "qrdx-art-eval",
        new Date().toISOString().replace(/:/g, "-"),
      ),
  );
  mkdirSync(out, { recursive: true });
  const zbarAvailable = hasTool("zbarimg", "--version");

  const control: ControlImage = await pipeline.renderControlImage(TEXT);
  writeFileSync(join(out, "control.png"), control.png);

  const generationCost = async (id: string) => {
    if (dryRun || replay) return null;
    try {
      return (await providers.aiGateway().getGenerationInfo({ id })).totalCost;
    } catch {
      return null;
    }
  };
  const fakeModel: ArtImageModel = async () => ({
    data: control.png,
    mediaType: "image/png",
  });
  // A replay keeps the earlier run's latency and cost for each image.
  const replayed = new Map<
    string,
    { latencyMs: number | null; costUsd: number | null }
  >();
  if (replay && existsSync(join(replay, "results.json"))) {
    const earlier = JSON.parse(
      readFileSync(join(replay, "results.json"), "utf8"),
    ) as {
      attempts: Attempt[];
    };
    for (const a of earlier.attempts) {
      replayed.set(`${a.model}|${a.prompt}|${a.seed}`, {
        latencyMs: a.latencyMs,
        costUsd: a.costUsd,
      });
    }
  }
  /** The raw image an earlier run saved for this job, as the model's answer. */
  const replayModel =
    (model: string, prompt: string, seed: number): ArtImageModel =>
    async () => {
      const file = join(
        replay as string,
        slug(model),
        `${prompt}-${seed}-raw.png`,
      );
      if (!existsSync(file)) throw new Error(`No saved raw image: ${file}`);
      return {
        data: new Uint8Array(readFileSync(file)),
        mediaType: "image/png",
      };
    };

  const jobs = candidates.flatMap((choice) =>
    prompts.flatMap((preset) =>
      Array.from({ length: n }, (_, i) => ({ choice, preset, seed: 1000 + i })),
    ),
  );
  console.log(
    `${dryRun ? "Dry run: " : replay ? `Replay of ${replay}: ` : ""}${jobs.length} images (${candidates.length} models × ${prompts.length} prompts × ${n}), QR visibility ${visibility} → ${out}`,
  );

  let spent = 0;
  let stopped = 0;
  const attempts: Attempt[] = [];
  await pool(
    jobs,
    Number(values.concurrency),
    async ({ choice, preset, seed }) => {
      if (maxCost !== null && spent >= maxCost) {
        stopped++;
        return;
      }
      const base = dryRun
        ? fakeModel
        : replay
          ? replayModel(choice.model, preset.id, seed)
          : pipeline.artModelFor(choice);
      let raw: ArtModelImage | undefined;
      let latencyMs: number | null = null;
      let answeredAt = 0;
      const timed: ArtImageModel = async (request) => {
        const started = performance.now();
        raw = await base(request);
        answeredAt = performance.now();
        latencyMs = Math.round(answeredAt - started);
        return raw;
      };
      const stem = join(out, slug(choice.model), `${preset.id}-${seed}`);
      mkdirSync(join(out, slug(choice.model)), { recursive: true });
      const attempt: Attempt = {
        model: choice.model,
        prompt: preset.id,
        seed,
        responded: false,
        delivered: false,
        blend: null,
        blendStrength: null,
        oldDelivered: false,
        zbarRaw: null,
        zbarDelivered: null,
        zbarOld: null,
        latencyMs: null,
        blendMs: null,
        costUsd: null,
        files: [],
      };
      try {
        const variant = await pipeline.generateArtVariant({
          text: TEXT,
          prompt: preset.prompt,
          negativePrompt: preset.negativePrompt,
          visibility,
          creativity: config.ART_CREATIVITY.default,
          seed,
          control,
          signal: new AbortController().signal,
          model: timed,
          modelId: choice.model,
          ...(values.timeout ? { timeoutMs: Number(values.timeout) } : {}),
        });
        attempt.blendMs = Math.round(performance.now() - answeredAt);
        // generateArtVariant delivers only what scanQRPixels decoded to TEXT.
        attempt.delivered = true;
        attempt.blend = variant.blend;
        attempt.blendStrength = variant.blendStrength;
        const delivered = `${stem}-delivered.png`;
        writeFileSync(delivered, fromDataUrl(variant.imageUrl));
        attempt.files.push(delivered);
        if (zbarAvailable) attempt.zbarDelivered = zbar(delivered);
      } catch (error) {
        const coded = error as { code?: string; message?: string };
        attempt.error = coded.code ?? coded.message ?? String(error);
      }
      if (raw) {
        attempt.responded = true;
        attempt.latencyMs = latencyMs;
        const rawFile = `${stem}-raw.${extension(raw.mediaType)}`;
        writeFileSync(rawFile, raw.data);
        attempt.files.unshift(rawFile);
        if (zbarAvailable) attempt.zbarRaw = zbar(rawFile);
        attempt.costUsd = await costOf(raw, generationCost);
        const earlier = replayed.get(`${choice.model}|${preset.id}|${seed}`);
        if (earlier) {
          attempt.latencyMs = earlier.latencyMs;
          attempt.costUsd = earlier.costUsd;
        }
        if (attempt.costUsd !== null) spent += attempt.costUsd;
        // The old pipeline on the same raw image: as drawn when it scanned,
        // otherwise the Image QR blend.
        const old = await pipeline.oldPipelineImage({
          text: TEXT,
          image: raw,
          control,
          visibility,
        });
        if (old) {
          attempt.oldDelivered = true;
          const oldFile = `${stem}-old.png`;
          writeFileSync(oldFile, old);
          attempt.files.push(oldFile);
          if (zbarAvailable) attempt.zbarOld = zbar(oldFile);
        }
      }
      attempts.push(attempt);
      console.log(
        `  ${choice.model} ${preset.id} #${seed}: ${attempt.delivered ? `delivered (${attempt.blend}${attempt.blend === "least" ? ` ${attempt.blendStrength}` : ""})` : `not delivered (${attempt.error})`}${attempt.latencyMs === null ? "" : `, ${(attempt.latencyMs / 1000).toFixed(1)} s`}${attempt.costUsd === null ? "" : `, $${attempt.costUsd.toFixed(4)} (total $${spent.toFixed(2)})`}`,
      );
    },
  );

  const rows = candidates.map((choice) => {
    const mine = attempts.filter((a) => a.model === choice.model);
    const delivered = mine.filter((a) => a.delivered);
    const latencies = mine.flatMap((a) =>
      a.latencyMs === null ? [] : [a.latencyMs],
    );
    const blendTimes = mine.flatMap((a) =>
      a.blendMs === null ? [] : [a.blendMs],
    );
    const costs = mine.flatMap((a) => (a.costUsd === null ? [] : [a.costUsd]));
    const least = delivered.filter((a) => a.blend === "least");
    const strengths = least.map((a) => a.blendStrength ?? 0);
    const medianLatency = median(latencies);
    const medianBlend = median(blendTimes);
    return {
      model: choice.model,
      images: mine.length,
      errors: mine.filter((a) => !a.responded).length,
      "delivered (scans)": percent(delivered.length, mine.length),
      "as drawn": delivered.filter((a) => a.blend === "none").length,
      "least blend": least.length,
      "Image QR": delivered.filter((a) => a.blend === "image-qr").length,
      "mean least strength": strengths.length
        ? (strengths.reduce((s, v) => s + v, 0) / strengths.length).toFixed(2)
        : "n/a",
      "old pipeline delivered": percent(
        mine.filter((a) => a.oldDelivered).length,
        mine.length,
      ),
      "zbarimg: raw / new / old": zbarAvailable
        ? `${mine.filter((a) => a.zbarRaw).length} / ${mine.filter((a) => a.zbarDelivered).length} / ${mine.filter((a) => a.zbarOld).length}`
        : "not installed",
      "median latency":
        medianLatency === null
          ? "n/a"
          : `${(medianLatency / 1000).toFixed(1)} s`,
      "median blend time":
        medianBlend === null ? "n/a" : `${(medianBlend / 1000).toFixed(2)} s`,
      "cost / image": costs.length
        ? `$${(costs.reduce((sum, c) => sum + c, 0) / costs.length).toFixed(4)} (${costs.length} reported)`
        : "not reported",
    };
  });

  const header = Object.keys(rows[0] ?? {});
  const table = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${Object.values(row).join(" | ")} |`),
  ].join("\n");
  const sheets = hasTool("ffmpeg", "-version")
    ? writeSheets(out, attempts)
    : [];
  const footer = [
    `Total reported cost: $${spent.toFixed(4)}${replay ? " (spent by the replayed run; this replay made no calls)" : ""}${stopped ? ` (stopped at --max-cost, ${stopped} images not made)` : ""}`,
    sheets.length
      ? `Sheets (a row per seed: raw | old pipeline | delivered): ${sheets.map((s) => s.slice(out.length + 1)).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(
      { text: TEXT, prompts: PRESET_IDS, n, visibility, spent, attempts },
      null,
      2,
    ),
  );
  writeFileSync(join(out, "results.md"), `${table}\n\n${footer}\n`);
  console.log(
    `\n${table}\n\n${footer}\n\nImages, results.json and results.md: ${out}`,
  );
  if (!zbarAvailable)
    console.log(
      "zbarimg isn't installed (brew install zbar), so only jsQR ran.",
    );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
