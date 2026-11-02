// domain-connect/keys.mjs (the owner's key and test-link helper) imports the
// app's signing and URL code through Node's type stripping. Runs it the way
// the owner does and checks it agrees with the app. No network: `check` is
// not run here.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApplyUrl } from "@/lib/domain-connect/apply-url";
import {
  parseSigningKey,
  publicKeyTxtValues,
  signQuery,
} from "@/lib/domain-connect/signing";
import { SIGNING_KEY_ID } from "@/lib/domain-connect/template";

const REPO = join(__dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO, "domain-connect", "keys.mjs");

const dir = mkdtempSync(join(tmpdir(), "qrdx-dc-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const keyPath = join(dir, "key.pem");
writeFileSync(keyPath, pem, { mode: 0o600 });
const key = parseSigningKey(pem) ?? expect.unreachable();

function run(...args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", SCRIPT, ...args],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { out, code: 0 };
  } catch (error) {
    const failed = error as { stderr?: string; status?: number };
    return { out: failed.stderr ?? "", code: failed.status ?? 1 };
  }
}

describe("domain-connect/keys.mjs", () => {
  it("prints the same TXT records the app checks, at _dck1.qrdx.dev", () => {
    const { out, code } = run("txt", keyPath);
    expect(code).toBe(0);
    expect(out).toContain(`${SIGNING_KEY_ID}.qrdx.dev`);
    const lines = out.split("\n").filter((line) => line.startsWith("p="));
    expect(lines).toEqual(publicKeyTxtValues(key.publicKey));
  });

  it("signs test links exactly like the app", () => {
    const { out, code } = run(
      "url",
      keyPath,
      "--domain",
      "example.com",
      "--host",
      "go",
      "--target",
      "cname.vercel-dns.com",
      "--vercel",
      "go.example.com,abc123",
    );
    expect(code).toBe(0);
    expect(out.trim()).toBe(
      buildApplyUrl(
        {
          urlSyncUX: "https://dash.cloudflare.com/domainconnect",
          providerId: "qrdx.dev",
          serviceId: "qrdx",
          domain: "example.com",
          host: "go",
          groupIds: ["route", "vercel"],
          variables: {
            target: "cname.vercel-dns.com",
            vercel: "go.example.com,abc123",
          },
          redirectUri: "https://qrdx.dev/dashboard?to=settings/domains",
        },
        {
          keyId: SIGNING_KEY_ID,
          sign: (query) => signQuery(query, key.privateKey),
        },
      ),
    );
  });

  it("never writes a private key inside the repository", () => {
    const { out, code } = run(
      "generate",
      join(REPO, "domain-connect", "test-key.pem"),
    );
    expect(code).toBe(1);
    expect(out).toMatch(/outside the repository/);
  });
});
