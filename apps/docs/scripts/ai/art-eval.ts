/**
 * Compares AI art models on the app's real art pipeline (lib/ai/art-image.ts)
 * through Vercel AI Gateway: the same control QR code, the same 3 prompts and
 * the same seeds for every model. Each result is decoded with the scanner the
 * app's scan check uses (qrdx scanQRPixels, jsQR plus a phone-camera model)
 * and, when it's installed, with zbarimg. Prints a table and saves every
 * image.
 *
 * Usage (from apps/docs, with the engine built: pnpm --filter qrdx build:inplace):
 *   AI_GATEWAY_API_KEY=... pnpm exec tsx --conditions=react-server scripts/ai/art-eval.ts \
 *     [--n 4] [--models google/gemini-nano-banana-2.1,openai/gpt-image-2] \
 *     [--out ./art-eval-out] [--concurrency 2] [--timeout 45000]
 *   pnpm exec tsx --conditions=react-server scripts/ai/art-eval.ts --dry-run
 *     (no key, no network: a fake model returns the control code itself)
 *
 * Every image is a paid gateway call: n × 3 prompts × models (48 by default).
 * Candidates are ART_EVAL_CANDIDATES in lib/ai/models.ts. It never touches a
 * database: DATABASE_URL is replaced with an unreachable placeholder.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
  /** The model's own image passed the app's scan check (no blend needed) */
  rawScans: boolean;
  /** Delivered by the pipeline: as it came, or after the Image QR blend */
  delivered: boolean;
  zbarRaw: boolean | null;
  zbarDelivered: boolean | null;
  latencyMs: number | null;
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

function hasZbar(): boolean {
  return spawnSync("zbarimg", ["--version"], { encoding: "utf8" }).status === 0;
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

async function main() {
  const { values } = parseArgs({
    options: {
      n: { type: "string", default: "4" },
      models: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string", default: "2" },
      timeout: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const n = Number(values.n);
  if (!(Number.isInteger(n) && n > 0)) fail("--n must be a positive integer");
  const dryRun = values["dry-run"];
  if (!(dryRun || process.env.AI_GATEWAY_API_KEY?.trim())) {
    fail(
      "AI_GATEWAY_API_KEY is not set. Set it to run the eval (each image is a paid call), or pass --dry-run to check the script without it.",
    );
  }
  // Never the shared database: nothing here queries one, and this makes sure.
  process.env.DATABASE_URL = "postgres://art-eval@127.0.0.1:1/none";

  // After the env is set: lib/env validates on import. (The pipeline decodes
  // with qrdx itself; importing "qrdx" here directly would take its ESM build,
  // which fails under the react-server condition.)
  const [pipeline, models, config, presets, providers] = await Promise.all([
    import("../../lib/ai/art-image"),
    import("../../lib/ai/models"),
    import("../../components/sections/ai-art/config"),
    import("../../components/sections/ai-art/presets"),
    import("../../lib/ai/providers"),
  ]);

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
  const zbarAvailable = hasZbar();

  const control: ControlImage = await pipeline.renderControlImage(TEXT);
  writeFileSync(join(out, "control.png"), control.png);

  const generationCost = async (id: string) => {
    if (dryRun) return null;
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

  const jobs = candidates.flatMap((choice) =>
    prompts.flatMap((preset) =>
      Array.from({ length: n }, (_, i) => ({ choice, preset, seed: 1000 + i })),
    ),
  );
  console.log(
    `${dryRun ? "Dry run: " : ""}${jobs.length} images (${candidates.length} models × ${prompts.length} prompts × ${n}) → ${out}`,
  );

  const attempts: Attempt[] = [];
  await pool(
    jobs,
    Number(values.concurrency),
    async ({ choice, preset, seed }) => {
      const base = dryRun ? fakeModel : pipeline.artModelFor(choice);
      let raw: ArtModelImage | undefined;
      let latencyMs: number | null = null;
      const timed: ArtImageModel = async (request) => {
        const started = performance.now();
        raw = await base(request);
        latencyMs = Math.round(performance.now() - started);
        return raw;
      };
      const stem = join(out, slug(choice.model), `${preset.id}-${seed}`);
      mkdirSync(join(out, slug(choice.model)), { recursive: true });
      const attempt: Attempt = {
        model: choice.model,
        prompt: preset.id,
        seed,
        responded: false,
        rawScans: false,
        delivered: false,
        zbarRaw: null,
        zbarDelivered: null,
        latencyMs: null,
        costUsd: null,
        files: [],
      };
      try {
        const variant = await pipeline.generateArtVariant({
          text: TEXT,
          prompt: preset.prompt,
          negativePrompt: preset.negativePrompt,
          visibility: config.ART_QR_VISIBILITY.default,
          creativity: config.ART_CREATIVITY.default,
          seed,
          control,
          signal: new AbortController().signal,
          model: timed,
          ...(values.timeout ? { timeoutMs: Number(values.timeout) } : {}),
        });
        // generateArtVariant delivers only what scanQRPixels decoded to TEXT:
        // the model's image as drawn, or else the Image QR blend.
        attempt.delivered = true;
        attempt.rawScans = !variant.blended;
        const delivered = `${stem}-delivered.png`;
        writeFileSync(
          delivered,
          Buffer.from(
            variant.imageUrl.slice(variant.imageUrl.indexOf(",") + 1),
            "base64",
          ),
        );
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
      }
      attempts.push(attempt);
      console.log(
        `  ${choice.model} ${preset.id} #${seed}: ${attempt.delivered ? (attempt.rawScans ? "scans as drawn" : "scans after blend") : `not delivered (${attempt.error})`}${attempt.latencyMs === null ? "" : `, ${(attempt.latencyMs / 1000).toFixed(1)} s`}`,
      );
    },
  );

  const rows = candidates.map((choice) => {
    const mine = attempts.filter((a) => a.model === choice.model);
    const latencies = mine.flatMap((a) =>
      a.latencyMs === null ? [] : [a.latencyMs],
    );
    const costs = mine.flatMap((a) => (a.costUsd === null ? [] : [a.costUsd]));
    const medianLatency = median(latencies);
    return {
      model: choice.model,
      images: mine.length,
      errors: mine.filter((a) => !a.responded).length,
      "scans as drawn (jsQR)": percent(
        mine.filter((a) => a.rawScans).length,
        mine.length,
      ),
      "delivered (after blend)": percent(
        mine.filter((a) => a.delivered).length,
        mine.length,
      ),
      "zbarimg, as drawn": zbarAvailable
        ? percent(mine.filter((a) => a.zbarRaw).length, mine.length)
        : "not installed",
      "zbarimg, delivered": zbarAvailable
        ? percent(mine.filter((a) => a.zbarDelivered).length, mine.length)
        : "not installed",
      "median latency":
        medianLatency === null
          ? "n/a"
          : `${(medianLatency / 1000).toFixed(1)} s`,
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
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify({ text: TEXT, prompts: PRESET_IDS, n, attempts }, null, 2),
  );
  writeFileSync(join(out, "results.md"), `${table}\n`);
  console.log(`\n${table}\n\nImages, results.json and results.md: ${out}`);
  if (!zbarAvailable)
    console.log(
      "zbarimg isn't installed (brew install zbar), so only jsQR ran.",
    );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
