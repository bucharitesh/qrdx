/**
 * Measures scene and photo modes (lib/ai/art-picture.ts: the picture first,
 * then the code painted into it) on the art model through Vercel AI
 * Gateway, through the same functions the app runs (makeScenePicture and
 * generatePictureVariant, as lib/ai/art-run.ts calls them): scene mode makes
 * a picture from each description, photo mode uses each sample photo
 * (public/images/art-samples/photos). Per image it records each call's
 * latency and cost, the blend, zbarimg's reading and the end-to-end time,
 * and writes a contact sheet (picture | delivered, labeled). Code mode is
 * scripts/ai/art-eval.ts.
 *
 * Usage (from apps/docs, with the engine built):
 *   AI_GATEWAY_API_KEY=... bun x tsx --conditions=react-server scripts/ai/art-eval-picture.ts \
 *     --mode scene|photo [--n 2] [--presets a,b] [--photos dog,latte] \
 *     [--size 0.64] [--keep 0.75] [--feather 0.75] [--quality low] \
 *     [--paint-quality medium] (the paint call's quality; default the model's) \
 *     [--blend '{"ringFull":0.3}'] [--text https://qrdx.dev/ai/art] \
 *     [--max-cost 1] [--concurrency 3] [--out dir]
 *   ... --replay <dir>   (no cost: the saved model images stand in)
 *   ... --dry-run        (no cost, no network: fake models)
 * Never touches a database.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { ArtImageModel, ArtModelImage } from "../../lib/ai/art-image";

const DEFAULT_TEXT = "https://qrdx.dev/q/Ab3dE9x";
const PRESET_IDS = [
  "painted-townhouses",
  "venice-canals",
  "zen-garden",
  "neon-city",
  "lighthouse",
  "botanical-watercolor",
];
const PHOTO_IDS = [
  "mountain",
  "latte",
  "flowers",
  "dog",
  "portrait",
  "sneaker",
];
const PHOTOS: Record<string, string> = {
  mountain:
    "a snowy mountain peak at sunset, reflected in a still lake, deep blue sky and an orange horizon",
  latte:
    "a latte with heart latte art in a white cup, seen from above on a dark wooden table by a window",
  flowers:
    "a bouquet of pink peonies and white roses in a glass vase against a dark green wall",
  dog: "a golden retriever smiling at the camera, a studio portrait on a plain warm beige background",
  portrait:
    "a black and white portrait of a smiling woman with short hair, on a plain grey background",
  sneaker:
    "a white sneaker with a coral sole on a plain cream studio background, a clean product photo",
};
const PHOTO_DIR = "public/images/art-samples/photos";

interface Attempt {
  id: string;
  seed: number;
  delivered: boolean;
  blend: string | null;
  blendStrength: number | null;
  zbarDelivered: boolean | null;
  /** Each model call, ms (picture first in scene mode) */
  calls: number[];
  callCosts: (number | null)[];
  blendMs: number | null;
  totalMs: number;
  error?: string;
}

function fail(message: string): never {
  console.error(`art-eval-picture: ${message}`);
  process.exit(1);
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ] as number;
};
const seconds = (ms: number | null) =>
  ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`;

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

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "scene" },
      n: { type: "string", default: "2" },
      size: { type: "string" },
      presets: { type: "string" },
      photos: { type: "string" },
      quality: { type: "string" },
      "paint-quality": { type: "string" },
      blend: { type: "string" },
      keep: { type: "string" },
      feather: { type: "string" },
      visibility: { type: "string", default: "50" },
      text: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string", default: "3" },
      "max-cost": { type: "string" },
      replay: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const replay = values.replay ? resolve(values.replay) : null;
  const earlier = (
    replay && existsSync(join(replay, "results.json"))
      ? JSON.parse(readFileSync(join(replay, "results.json"), "utf8"))
      : {}
  ) as {
    mode?: string;
    size?: number;
    ids?: string[];
    n?: number;
    text?: string;
    attempts?: Attempt[];
  };
  const mode = (earlier.mode ?? values.mode) as "scene" | "photo";
  if (!["scene", "photo"].includes(mode)) fail("--mode scene|photo");
  const n = Number(earlier.n ?? values.n);
  const size = Number(values.size ?? earlier.size ?? 0.64);
  const text = values.text ?? earlier.text ?? DEFAULT_TEXT;
  const visibility = Number(values.visibility);
  const dryRun = values["dry-run"];
  const maxCost = values["max-cost"] ? Number(values["max-cost"]) : null;
  if (!(dryRun || replay || process.env.AI_GATEWAY_API_KEY?.trim())) {
    fail("Set AI_GATEWAY_API_KEY, or pass --dry-run or --replay.");
  }
  process.env.DATABASE_URL = "postgres://art-eval@127.0.0.1:1/none";
  process.env.NEXT_PUBLIC_APP_URL ??= "https://qrdx.dev";
  process.env.BETTER_AUTH_SECRET ??= "art-eval-placeholder-not-a-secret";

  const [pipeline, picture, blend, models, presets, providers] =
    await Promise.all([
      import("../../lib/ai/art-image"),
      import("../../lib/ai/art-picture"),
      import("../../lib/ai/art-blend"),
      import("../../lib/ai/models"),
      import("../../components/sections/ai-art/presets"),
      import("../../lib/ai/providers"),
    ]);
  const blendStyle = {
    ...blend.SCENE_BLEND_STYLE,
    ...(values.blend ? (JSON.parse(values.blend) as object) : {}),
  };
  const ids =
    earlier.ids ??
    (mode === "scene"
      ? (values.presets?.split(",") ?? PRESET_IDS)
      : (values.photos?.split(",") ?? PHOTO_IDS));
  const prompts = new Map(
    ids.map((id) => [
      id,
      mode === "photo"
        ? (PHOTOS[id] ?? fail(`No test photo ${id}`))
        : (presets.AI_ART_PRESETS.find((p) => p.id === id)?.prompt ??
          fail(`No preset ${id}`)),
    ]),
  );

  const out = resolve(
    values.out ??
      join(tmpdir(), "qrdx-art-eval-picture", new Date().toISOString()),
  );
  mkdirSync(out, { recursive: true });
  const zbarOk =
    spawnSync("zbarimg", ["--version"], { encoding: "utf8" }).status === 0;
  const zbar = (file: string) => {
    const run = spawnSync("zbarimg", ["--quiet", "--raw", file], {
      encoding: "utf8",
    });
    return run.status === 0 && run.stdout.split("\n").includes(text);
  };
  const codeControl = await pipeline.renderControlImage(text);

  const costOf = async (image: ArtModelImage): Promise<number | null> => {
    if (dryRun || replay) return null;
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

  /** A photo as the client sends it: 1024 px square JPEG. */
  const photoBytes = (id: string) => {
    const file = join(out, `photo-${id}.jpg`);
    const run = spawnSync(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-y",
        "-i",
        resolve(PHOTO_DIR, `${id}.webp`),
        "-vf",
        "scale=1024:1024:flags=lanczos",
        "-q:v",
        "3",
        file,
      ],
      { encoding: "utf8" },
    );
    if (run.status !== 0) fail(`ffmpeg: ${run.stderr}`);
    return new Uint8Array(readFileSync(file));
  };

  const saved = (stem: string, name: string) => {
    const file = `${stem}-${name}.png`;
    if (!existsSync(file)) throw new Error(`No saved ${file}`);
    return { data: new Uint8Array(readFileSync(file)), mediaType: "image/png" };
  };

  const jobs = ids.flatMap((id) =>
    Array.from({ length: n }, (_, i) => ({ id, seed: 1000 + i })),
  );
  console.log(
    `${dryRun ? "Dry run: " : replay ? `Replay of ${replay}: ` : ""}${mode} mode, ${jobs.length} images, code square ${size} → ${out}`,
  );
  let spent = 0;
  let stopped = 0;
  const attempts: Attempt[] = [];
  await pool(jobs, Number(values.concurrency), async ({ id, seed }) => {
    if (maxCost !== null && spent >= maxCost) {
      stopped++;
      return;
    }
    const stem = join(out, `${id}-${seed}`);
    const from = replay ? join(replay, `${id}-${seed}`) : null;
    const prompt = prompts.get(id) as string;
    const attempt: Attempt = {
      id,
      seed,
      delivered: false,
      blend: null,
      blendStrength: null,
      zbarDelivered: null,
      calls: [],
      callCosts: [],
      blendMs: null,
      totalMs: 0,
    };
    const replayed = earlier.attempts?.find(
      (a) => a.id === id && a.seed === seed,
    );
    const started = performance.now();
    const signal = new AbortController().signal;
    // Each model answer is saved as it comes; a replay reads them back.
    const timedCall = async <T extends ArtModelImage>(
      name: string,
      call: () => Promise<T>,
    ): Promise<ArtModelImage> => {
      const t = performance.now();
      const image: ArtModelImage = from ? saved(from, name) : await call();
      attempt.calls.push(Math.round(performance.now() - t));
      if (!(from || dryRun)) {
        writeFileSync(
          `${stem}-${name}.png`,
          (await pipeline.readModelImage(image)).png,
        );
        attempt.callCosts.push(await costOf(image));
      }
      return image;
    };
    const paintModel: ArtImageModel = (request) =>
      timedCall("paint", () =>
        dryRun
          ? Promise.resolve({
              data: request.images[0] as Uint8Array,
              mediaType: "image/png",
            })
          : pipeline.artModelFor(
              values["paint-quality"]
                ? {
                    ...models.AI_MODELS.art,
                    options: { quality: values["paint-quality"] },
                  }
                : models.AI_MODELS.art,
            )(request),
      );
    try {
      let bytes: Uint8Array;
      if (mode === "photo") {
        bytes = photoBytes(id);
      } else {
        const real = picture.pictureModelFor(models.AI_MODELS.art, {
          ...(values.quality
            ? { quality: values.quality as "low" | "medium" | "high" }
            : {}),
        });
        bytes = await picture.makeScenePicture({
          prompt,
          seed,
          signal,
          timeoutMs: 45_000,
          model: (request) =>
            timedCall("picture", () =>
              dryRun
                ? Promise.resolve({
                    data: codeControl.png,
                    mediaType: "image/png",
                  })
                : real(request),
            ),
        });
      }
      writeFileSync(`${stem}-input.jpg`, bytes);
      const t = performance.now();
      const variant = await picture.generatePictureVariant({
        text,
        prompt,
        visibility,
        creativity: 45,
        seed,
        picture: bytes,
        control: codeControl,
        signal,
        model: paintModel,
        region: { ...picture.PICTURE_REGION, size },
        ...(values.keep ? { keepModules: Number(values.keep) } : {}),
        ...(values.feather ? { featherModules: Number(values.feather) } : {}),
        blendStyle,
      });
      attempt.blendMs = Math.round(
        performance.now() - t - (attempt.calls.at(-1) ?? 0),
      );
      attempt.delivered = true;
      attempt.blend = variant.blend;
      attempt.blendStrength = variant.blendStrength;
      writeFileSync(
        `${stem}-delivered.png`,
        Buffer.from(variant.imageUrl.split(",")[1] ?? "", "base64"),
      );
      if (zbarOk) attempt.zbarDelivered = zbar(`${stem}-delivered.png`);
    } catch (error) {
      const coded = error as { code?: string; message?: string };
      attempt.error = coded.code ?? coded.message ?? String(error);
    }
    if (replayed) {
      attempt.calls = replayed.calls;
      attempt.callCosts = replayed.callCosts;
    }
    attempt.totalMs = replayed
      ? replayed.calls.reduce((s, v) => s + v, 0) + (attempt.blendMs ?? 0)
      : Math.round(performance.now() - started);
    for (const c of attempt.callCosts) spent += c ?? 0;
    attempts.push(attempt);
    console.log(
      `  ${id} #${seed}: ${attempt.delivered ? `${attempt.blend}${attempt.blend === "least" ? ` ${attempt.blendStrength}` : ""}${attempt.zbarDelivered ? " zbar" : ""}` : `not delivered (${attempt.error})`}, calls ${attempt.calls.map((c) => seconds(c)).join(" + ")}, total ${seconds(attempt.totalMs)} (spent $${spent.toFixed(2)})`,
    );
  });

  const delivered = attempts.filter((a) => a.delivered);
  const least = delivered.filter((a) => a.blend === "least");
  const costs = attempts
    .flatMap((a) => a.callCosts)
    .filter((c): c is number => c !== null);
  const totals = attempts.map((a) => a.totalMs);
  const runCost = replay
    ? (earlier.attempts ?? []).reduce(
        (s: number, a: Attempt) =>
          s + a.callCosts.reduce((t: number, c) => t + (c ?? 0), 0),
        0,
      )
    : costs.reduce((s, c) => s + c, 0);
  const row = {
    mode,
    "code square": size,
    images: attempts.length,
    delivered: `${Math.round((delivered.length / Math.max(1, attempts.length)) * 100)}% (${delivered.length}/${attempts.length})`,
    "as drawn": delivered.filter((a) => a.blend === "none").length,
    least: least.length,
    "least median": least.length
      ? (
          percentile(
            least.map((a) => a.blendStrength ?? 0),
            50,
          ) as number
        ).toFixed(3)
      : "n/a",
    "least ≤ 0.3": least.filter((a) => (a.blendStrength ?? 0) <= 0.3).length,
    "Image QR": delivered.filter((a) => a.blend === "image-qr").length,
    "zbar delivered": attempts.filter((a) => a.zbarDelivered).length,
    "calls p50": attempts[0]
      ? attempts[0].calls
          .map((_, i) =>
            seconds(
              percentile(
                attempts.map((a) => a.calls[i] ?? 0),
                50,
              ),
            ),
          )
          .join(" + ")
      : "n/a",
    "blend p95": seconds(
      percentile(
        attempts.map((a) => a.blendMs ?? 0),
        95,
      ),
    ),
    "total p50 / p95": `${seconds(percentile(totals, 50))} / ${seconds(percentile(totals, 95))}`,
    "cost / delivered": delivered.length
      ? `$${(runCost / delivered.length).toFixed(3)}`
      : "n/a",
  };
  const header = Object.keys(row);
  const table = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    `| ${Object.values(row).join(" | ")} |`,
  ].join("\n");

  // Contact sheet: picture | delivered (or the art when nothing was).
  const font = "/System/Library/Fonts/Supplemental/Arial.ttf";
  const tiles = attempts
    .sort((a, b) =>
      a.id === b.id ? a.seed - b.seed : a.id.localeCompare(b.id),
    )
    .flatMap((a) => {
      const stem = join(out, `${a.id}-${a.seed}`);
      const firstFile = `${stem}-input.jpg`;
      const second = `${stem}-delivered.png`;
      if (!(existsSync(firstFile) && existsSync(second))) return [];
      const how = a.delivered
        ? `${a.blend}${a.blend === "least" ? ` ${a.blendStrength}` : ""}${a.zbarDelivered ? " zbar" : ""}`
        : "NOT DELIVERED";
      return [
        "-label",
        `${a.id} #${a.seed}: ${mode === "photo" ? "photo" : "picture"}`,
        firstFile,
        "-label",
        `delivered: ${how}`,
        second,
      ];
    });
  const sheet = join(out, `contact-${mode}.png`);
  if (tiles.length) {
    spawnSync("magick", [
      "montage",
      ...tiles,
      "-tile",
      "4x",
      "-geometry",
      "300x300+5+5",
      "-pointsize",
      "12",
      ...(existsSync(font) ? ["-font", font] : []),
      sheet,
    ]);
  }
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify(
      {
        mode,
        size,
        ids,
        n,
        text,
        visibility,
        blendStyle,
        spent: runCost,
        attempts,
      },
      null,
      2,
    ),
  );
  const footer = `Cost: $${runCost.toFixed(4)}${replay ? " (the replayed run's)" : ""}${stopped ? ` (stopped at --max-cost, ${stopped} not made)` : ""}\nSheet: ${sheet}`;
  writeFileSync(join(out, "results.md"), `${table}\n\n${footer}\n`);
  console.log(`\n${table}\n\n${footer}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
