import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The environment is declared in env.ts and the package keys it extends, and
// explained in .env.example. The template lists every declared variable and
// nothing else, with only the three required ones set; the app starts with
// just those three, and refuses to start without one, naming it.
const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const SCHEMAS = [
  "env.ts",
  "../../packages/analytics/keys.ts",
  "../../packages/auth/keys.ts",
  "../../packages/config/keys.ts",
  "../../packages/database/keys.ts",
  "../../packages/next-config/keys.ts",
  "../../packages/rate-limit/keys.ts",
];
const declared = new Set(
  SCHEMAS.flatMap((path) =>
    [...read(path).matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*z\b/gm)].map(
      (m) => m[1] as string,
    ),
  ),
);

// Set by Node.js, Next.js or Vercel, never by hand (the template says so).
const PLATFORM =
  /^(NODE_ENV|NEXT_RUNTIME|VERCEL|VERCEL_(ENV|URL|BRANCH_URL|REGION|PROJECT_PRODUCTION_URL|GIT_[A-Z_]+))$/;
// Read by docker-compose.yml, not by the app.
const COMPOSE_ONLY = new Set(["POSTGRES_PASSWORD"]);
const REQUIRED = ["NEXT_PUBLIC_APP_URL", "DATABASE_URL", "BETTER_AUTH_SECRET"];

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
    const undeclared = [...listed].filter(
      (name) => !(declared.has(name) || COMPOSE_ONLY.has(name)),
    );
    expect(undeclared).toEqual([]);
  });
});

describe("required variables", () => {
  const REQUIRED_VALUES: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://user:pass@localhost:5432/test",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** A fresh env.ts with only `values` set. */
  async function load(values: Record<string, string | undefined>) {
    vi.resetModules();
    for (const name of declared) {
      vi.stubEnv(name, undefined);
    }
    for (const [name, value] of Object.entries(values)) {
      vi.stubEnv(name, value);
    }
    return (await import("@/env")).env;
  }

  function quietErrors() {
    return vi.spyOn(console, "error").mockImplementation(() => undefined);
  }

  it("starts with only the three required variables", async () => {
    const env = await load(REQUIRED_VALUES);
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.BETTER_AUTH_SECRET).toBe(REQUIRED_VALUES.BETTER_AUTH_SECRET);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it.each(REQUIRED)(
    "refuses to start without %s and names it",
    async (name) => {
      quietErrors();
      await expect(
        load({ ...REQUIRED_VALUES, [name]: undefined }),
      ).rejects.toThrow(name);
    },
  );

  it("treats an empty value as missing", async () => {
    quietErrors();
    await expect(
      load({ ...REQUIRED_VALUES, BETTER_AUTH_SECRET: "" }),
    ).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("names every missing variable in one error", async () => {
    quietErrors();
    const error = await load({}).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    for (const name of REQUIRED) {
      expect((error as Error).message).toContain(name);
    }
    expect((error as Error).message).toContain("apps/app/.env.example");
  });

  it("names an invalid optional variable without printing its value", async () => {
    const errors = quietErrors();
    await expect(
      load({ ...REQUIRED_VALUES, R2_PUBLIC_BASE_URL: "files-secret-host" }),
    ).rejects.toThrow("R2_PUBLIC_BASE_URL");
    const printed = errors.mock.calls.flat().join("\n");
    expect(printed).toContain("R2_PUBLIC_BASE_URL");
    expect(printed).not.toContain("files-secret-host");
  });
});
