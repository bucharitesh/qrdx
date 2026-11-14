import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// As in the main app: the environment is declared in env.ts and the package
// keys it extends, and explained in .env.example, which lists every
// declared variable and nothing else, with the required ones set.
const ROOT = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const SCHEMAS = [
  "env.ts",
  "../../packages/analytics/keys.ts",
  "../../packages/config/keys.ts",
  "../../packages/next-config/keys.ts",
];
const declared = new Set(
  SCHEMAS.flatMap((path) =>
    [
      ...read(path).matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*(?:z\b|production)/gm),
    ].map((m) => m[1] as string),
  ),
);

// Set by Node.js, Next.js or Vercel, never by hand.
const PLATFORM =
  /^(NODE_ENV|NEXT_RUNTIME|VERCEL|VERCEL_(ENV|URL|BRANCH_URL|REGION|PROJECT_PRODUCTION_URL|GIT_[A-Z_]+))$/;
const REQUIRED = ["NEXT_PUBLIC_APP_URL", "MAIN_ZONE_URL"];

const lines = read(".env.example").split("\n");
const setInTemplate = lines.flatMap(
  (line) => /^([A-Z][A-Z0-9_]+)=/.exec(line)?.[1] ?? [],
);
const commentedInTemplate = lines.flatMap(
  (line) => /^# ([A-Z][A-Z0-9_]+)=/.exec(line)?.[1] ?? [],
);
const listed = new Set([...setInTemplate, ...commentedInTemplate]);

describe(".env.example", () => {
  it("sets the required variables and leaves the rest commented out", () => {
    expect([...setInTemplate].sort()).toEqual([...REQUIRED].sort());
  });

  it.each([...declared].filter((name) => !PLATFORM.test(name)))(
    "lists %s",
    (name) => {
      expect(listed.has(name)).toBe(true);
    },
  );

  it("lists nothing the schemas don't declare", () => {
    expect([...listed].filter((name) => !declared.has(name))).toEqual([]);
  });

  it("declares no database or auth secret", () => {
    for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET"]) {
      expect(declared.has(name)).toBe(false);
    }
  });
});

describe("a missing variable", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("stops the production server, naming it and this app's template", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIN_ZONE_URL", "");
    await expect(import("@/env")).rejects.toThrow(
      "Invalid environment variables: MAIN_ZONE_URL. See apps/docs/.env.example.",
    );
  });
});
