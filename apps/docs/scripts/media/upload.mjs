// Uploads the site's videos to Cloudflare R2 and writes lib/media-manifest.json.
//
// Sources live in apps/docs/media/ (git-ignored: R2 is the copy everyone
// uses). Each file goes to `static/<path>.<hash>.<ext>` with a one-year
// immutable cache, so a changed file gets a new URL and nothing goes stale.
// Files already in the bucket are skipped. Code reads the manifest through
// `mediaUrl()` in lib/media.ts.
//
//   cd apps/docs && R2_BUCKET=<bucket> pnpm media:upload
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and
// R2_PUBLIC_BASE_URL (the bucket's public origin), from the shell or the
// .env.local files the npm script loads.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const root = new URL("../..", import.meta.url).pathname;
const sourceDir = join(root, "media");
const manifestPath = join(root, "lib", "media-manifest.json");

const TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
} = process.env;
const missing = Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (TYPES[extname(entry.name).toLowerCase()]) out.push(path);
  }
  return out;
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

const files = {};
let uploaded = 0;
for (const file of walk(sourceDir).sort()) {
  const body = readFileSync(file);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  const ext = extname(file);
  // "/videos/help/bulk-csv.mp4" → "static/videos/help/bulk-csv.<hash>.mp4"
  const path = `/${relative(sourceDir, file).split(sep).join("/")}`;
  const key = `static${path.slice(0, -ext.length)}.${hash}${ext}`;
  if (!(await exists(key))) {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: TYPES[ext.toLowerCase()],
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    uploaded++;
  }
  files[path] = key;
}

const manifest = {
  origin: R2_PUBLIC_BASE_URL.replace(/\/+$/, ""),
  files,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `${Object.keys(files).length} file(s) in the manifest, ${uploaded} uploaded.`,
);
