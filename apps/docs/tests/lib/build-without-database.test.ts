// The Docker image is built with no database. Pages that read it while
// rendering move to request time there, and stay static everywhere else.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.fn(async () => {});
vi.mock("next/server", () => ({ connection }));

const { buildingWithoutDatabase, readsDatabaseWhileRendering } = await import(
  "@/lib/build-without-database"
);

const FLAG = "QRDX_BUILD_WITHOUT_DATABASE";

describe("readsDatabaseWhileRendering", () => {
  beforeEach(() => connection.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it("moves the page to request time in a build without a database", async () => {
    vi.stubEnv(FLAG, "1");
    expect(buildingWithoutDatabase()).toBe(true);
    await readsDatabaseWhileRendering();
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a database is there", async () => {
    vi.stubEnv(FLAG, "");
    expect(buildingWithoutDatabase()).toBe(false);
    await readsDatabaseWhileRendering();
    expect(connection).not.toHaveBeenCalled();
  });
});

describe("Dockerfile", () => {
  const dockerfile = readFileSync(
    path.resolve(__dirname, "../../../../Dockerfile"),
    "utf8",
  );
  /** The lines of one `FROM … AS <name>` stage. */
  const stage = (name: string) => {
    const start = dockerfile.search(new RegExp(`^FROM .* AS ${name}$`, "m"));
    const rest = dockerfile.slice(start + 1);
    const next = rest.search(/^FROM /m);
    return next === -1 ? rest : rest.slice(0, next);
  };

  it("sets the flag in the build stage only", () => {
    expect(stage("builder")).toContain(`${FLAG}=1`);
    expect(stage("runner")).not.toContain(FLAG);
  });
});
