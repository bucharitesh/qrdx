// Argument edge cases: every bad invocation exits 1 with a message that says
// what to do, writes nothing, and never silently drops input.
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./test-utils";

const created: string[] = [];
const tmp = (name: string) => {
  const path = join(tmpdir(), `qrdx-args-${process.pid}-${name}`);
  created.push(path);
  return path;
};

afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { force: true });
});

describe("options that need a value", () => {
  it.each([
    "-l",
    "--level",
    "--body",
    "--eye",
    "--dot",
    "--fg",
    "--bg",
    "--logo",
    "--template",
    "--format",
  ])("%s followed by another option is an error, not a value", (flag) => {
    const out = tmp(`missing${flag}.svg`);
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "https://qrdx.dev",
      flag,
      "-o",
      out,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain(`${flag} needs a value`);
    expect(existsSync(out)).toBe(false);
  });

  it("-o followed by another option is an error, not a file name", () => {
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "https://qrdx.dev",
      "-o",
      "--size",
      "64",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain("-o needs a file path");
    expect(existsSync("--size")).toBe(false);
  });

  it("an option at the very end is an error", () => {
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "https://qrdx.dev",
      "--body",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain("--body needs a value");
  });
});

describe("values", () => {
  it("refuses an unquoted multi-word value instead of encoding only the first word", () => {
    const out = tmp("words.svg");
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "hello",
      "world",
      "-o",
      out,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain('Unexpected argument "world"');
    expect(existsSync(out)).toBe(false);
  });

  it("encodes a quoted value with spaces", () => {
    const out = tmp("quoted.svg");
    expect(runCli(["generate", "hello world", "-o", out]).exitCode).toBe(0);
    expect(existsSync(out)).toBe(true);
  });

  it("explains when the data does not fit in a QR code", () => {
    const out = tmp("too-long.svg");
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "x".repeat(3000),
      "-o",
      out,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toMatch(/Data too long/i);
    expect(existsSync(out)).toBe(false);
  });

  it("exits 1 when there is nothing to encode", () => {
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "",
      "-o",
      tmp("empty.svg"),
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain("No data to encode");
  });
});

describe("sizes", () => {
  it.each(["0", "-5", "1.5", "12px", "abc"])("rejects --size %s", (size) => {
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "https://qrdx.dev",
      "--size",
      size,
      "-o",
      tmp("size.svg"),
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain("Invalid --size");
  });

  it("rejects PNGs too large to render, before rendering", () => {
    const out = tmp("huge.png");
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "https://qrdx.dev",
      "--size",
      "100000",
      "-o",
      out,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toContain("PNG output is at most 10000 px");
    expect(existsSync(out)).toBe(false);
  });

  it("allows a large vector size", () => {
    const out = tmp("huge.svg");
    expect(
      runCli(["generate", "https://qrdx.dev", "--size", "100000", "-o", out])
        .exitCode
    ).toBe(0);
  });
});

describe("output paths", () => {
  it("exits 1 with the OS error when the folder doesn't exist", () => {
    const out = join(
      tmpdir(),
      `qrdx-args-${process.pid}-missing-dir`,
      "qr.svg"
    );
    const { exitCode, stdout, stderr } = runCli([
      "generate",
      "https://qrdx.dev",
      "-o",
      out,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout + stderr).toMatch(/ENOENT|no such file/i);
  });
});
