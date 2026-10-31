// Upload verification and delivery against a mocked S3 client and fetch: no
// network, no database. Needs dummy env values (lib/env validates on import):
//   cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test \
//     R2_ACCOUNT_ID=test R2_ACCESS_KEY_ID=test R2_SECRET_ACCESS_KEY=test R2_BUCKET=test-bucket \
//     npx tsx --conditions=react-server --test lib/files/storage.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, beforeEach, describe, it } from "node:test";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Refuse to run against anything but the dummy bucket.
assert.equal(process.env.R2_ACCOUNT_ID, "test", "run with the dummy R2 env");
assert.equal(process.env.R2_BUCKET, "test-bucket", "run with the dummy R2 env");

interface StoredFixture {
  body: Uint8Array;
  type: string;
  /** Reported by HEAD (defaults to body length) */
  size?: number;
}

let objects = new Map<string, StoredFixture>();
let commands: string[] = [];
let fetches: { key: string; range: string | null }[] = [];

S3Client.prototype.send = async function send(command: unknown) {
  if (command instanceof HeadObjectCommand) {
    commands.push(`head ${command.input.Key}`);
    const object = objects.get(command.input.Key as string);
    if (!object) {
      throw Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
    }
    return {
      ContentLength: object.size ?? object.body.length,
      ContentType: object.type,
      ETag: '"etag"',
    };
  }
  throw new Error(
    `Unexpected S3 command ${(command as object).constructor.name}`,
  );
} as typeof S3Client.prototype.send;

globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = new URL(String(input));
  if (!url.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error(`Unexpected request to ${url.hostname}`);
  }
  assert.ok(
    url.searchParams.get("X-Amz-Signature"),
    "reads use a presigned URL",
  );
  const key = decodeURIComponent(
    url.hostname.startsWith("test-bucket.")
      ? url.pathname.slice(1)
      : url.pathname.replace(/^\/test-bucket\//, ""),
  );
  const range = new Headers(init?.headers).get("range");
  fetches.push({ key, range });
  const object = objects.get(key);
  if (!object) return new Response("missing", { status: 404 });
  const match = range && /^bytes=(\d+)-(\d+)$/.exec(range);
  if (match) {
    const body = object.body.slice(Number(match[1]), Number(match[2]) + 1);
    return new Response(Buffer.from(body), { status: 206 });
  }
  return new Response(Buffer.from(object.body), { status: 200 });
}) as typeof fetch;

const MB = 1024 * 1024;
const pdf = (text = "hello") =>
  new TextEncoder().encode(`%PDF-1.7\n${text}\n%%EOF`);

let verifyStoredObject: typeof import("./verify").verifyStoredObject;
let HASH_MAX_BYTES: number;
let deliverFile: typeof import("./delivery").deliverFile;

before(async () => {
  ({ verifyStoredObject, HASH_MAX_BYTES } = await import("./verify"));
  ({ deliverFile } = await import("./delivery"));
});

beforeEach(() => {
  objects = new Map();
  commands = [];
  fetches = [];
});

describe("verifyStoredObject", () => {
  const key = "u-user1/cmvwdh3f80000d2cfbvda2bl3/menu.pdf";

  it("reports uploads that never arrived", async () => {
    const result = await verifyStoredObject({
      key,
      size: 10,
      mime: "application/pdf",
    });
    assert.deepEqual(result, { ok: false, reason: "missing" });
    assert.deepEqual(fetches, []);
  });

  it("accepts a real PDF and hashes small files", async () => {
    const body = pdf();
    objects.set(key, { body, type: "application/pdf" });
    const result = await verifyStoredObject({
      key,
      size: body.length,
      mime: "application/pdf",
    });
    assert.deepEqual(result, {
      ok: true,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
    assert.deepEqual(commands, [`head ${key}`]);
    assert.deepEqual(fetches, [{ key, range: null }]);
  });

  it("rejects a size that differs from the announced one", async () => {
    objects.set(key, { body: pdf(), type: "application/pdf" });
    const result = await verifyStoredObject({
      key,
      size: 3,
      mime: "application/pdf",
    });
    assert.deepEqual(result, { ok: false, reason: "size" });
  });

  it("rejects a stored Content-Type that differs from the declared one", async () => {
    const body = pdf();
    objects.set(key, { body, type: "text/html" });
    const result = await verifyStoredObject({
      key,
      size: body.length,
      mime: "application/pdf",
    });
    assert.deepEqual(result, { ok: false, reason: "mime" });
  });

  it("rejects HTML disguised as a PDF", async () => {
    const body = new TextEncoder().encode(
      "<!doctype html><script>steal()</script>",
    );
    objects.set(key, { body, type: "application/pdf" });
    const result = await verifyStoredObject({
      key,
      size: body.length,
      mime: "application/pdf",
    });
    assert.deepEqual(result, { ok: false, reason: "type" });
  });

  it("only reads the first bytes of large files", async () => {
    const videoKey = "o-org1/cmvwdh3f90002d2cfbx93h9ih/clip.mp4";
    const size = HASH_MAX_BYTES + 5 * MB;
    const head = new Uint8Array(8192);
    head.set([0, 0, 0, 0x20, ...new TextEncoder().encode("ftypisom")]);
    objects.set(videoKey, { body: head, type: "video/mp4", size });
    const result = await verifyStoredObject({
      key: videoKey,
      size,
      mime: "video/mp4",
    });
    assert.deepEqual(result, { ok: true, sha256: null });
    assert.deepEqual(fetches, [{ key: videoKey, range: "bytes=0-4095" }]);
  });
});

describe("deliverFile (without a database lookup)", () => {
  const request = (dest?: string) =>
    new Request("https://qrdx.dev/api/files/not-a-valid-id", {
      headers: dest ? { "sec-fetch-dest": dest } : {},
    });

  it("shows a placeholder image inside <img>", async () => {
    const response = await deliverFile(request("image"), "../../etc/passwd");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(await response.text(), /File unavailable/);
  });

  it("shows a small page in frames and tabs", async () => {
    for (const dest of ["iframe", "document", "embed"]) {
      const response = await deliverFile(request(dest), "nope");
      assert.equal(response.status, 404, dest);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.match(
        response.headers.get("content-security-policy") ?? "",
        /default-src 'none'/,
      );
    }
  });

  it("answers media players and scripts with a plain 404", async () => {
    const response = await deliverFile(request("video"), "nope");
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  });
});
