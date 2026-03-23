import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli, runCliOutput } from "./test-utils.js";

const tmp = (name: string) => join(tmpdir(), `qrdx-test-${name}`);

const cleanups: string[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0)) {
    if (existsSync(f)) {
      rmSync(f);
    }
  }
});

describe("generate command", () => {
  describe("non-interactive mode (stdin not a TTY)", () => {
    it("exits 0 with a value", () => {
      const { exitCode } = runCli(["generate", "https://qrdx.dev"]);
      expect(exitCode).toBe(0);
    });

    it("exits 1 with no value", () => {
      const { exitCode, stdout, stderr } = runCli(["generate"]);
      expect(exitCode).toBe(1);
      expect(stdout + stderr).toContain("No data provided");
    });

    it("gen alias works", () => {
      const { exitCode } = runCli(["gen", "https://qrdx.dev"]);
      expect(exitCode).toBe(0);
    });

    it("g alias works", () => {
      const { exitCode } = runCli(["g", "https://qrdx.dev"]);
      expect(exitCode).toBe(0);
    });
  });

  describe("SVG file output", () => {
    it("creates a valid SVG file", () => {
      const out = tmp("output.svg");
      cleanups.push(out);
      const { exitCode } = runCli(["generate", "https://qrdx.dev", "-o", out]);
      expect(exitCode).toBe(0);
      expect(existsSync(out)).toBe(true);
    });

    it("SVG file starts with <?xml", () => {
      const out = tmp("output2.svg");
      cleanups.push(out);
      runCli(["generate", "https://qrdx.dev", "-o", out]);
      const content = readFileSync(out, "utf-8");
      expect(content).toMatch(/^<\?xml/);
      expect(content).toContain("<svg");
      expect(content).toContain("</svg>");
    });

    it("respects --size flag in SVG dimensions", () => {
      const out = tmp("sized.svg");
      cleanups.push(out);
      runCli(["generate", "https://qrdx.dev", "-o", out, "--size", "256"]);
      const content = readFileSync(out, "utf-8");
      expect(content).toContain('width="256"');
      expect(content).toContain('height="256"');
    });

    it("--output long flag works", () => {
      const out = tmp("long-flag.svg");
      cleanups.push(out);
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--output",
        out,
      ]);
      expect(exitCode).toBe(0);
      expect(existsSync(out)).toBe(true);
    });
  });

  describe("PNG file output", () => {
    it("creates a PNG file", () => {
      const out = tmp("output.png");
      cleanups.push(out);
      const { exitCode } = runCli(["generate", "https://qrdx.dev", "-o", out]);
      expect(exitCode).toBe(0);
      expect(existsSync(out)).toBe(true);
    });

    it("PNG file has valid magic bytes", () => {
      const out = tmp("magic.png");
      cleanups.push(out);
      runCli(["generate", "https://qrdx.dev", "-o", out]);
      const buf = readFileSync(out);
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50);
      expect(buf[2]).toBe(0x4e);
      expect(buf[3]).toBe(0x47);
    });
  });

  describe("flags", () => {
    it("--level flag is accepted", () => {
      const { exitCode } = runCli(["generate", "https://qrdx.dev", "-l", "H"]);
      expect(exitCode).toBe(0);
    });

    it("--body flag is accepted", () => {
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--body",
        "circle",
      ]);
      expect(exitCode).toBe(0);
    });

    it("--eye flag is accepted", () => {
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--eye",
        "gear",
      ]);
      expect(exitCode).toBe(0);
    });

    it("--dot flag is accepted", () => {
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--dot",
        "star",
      ]);
      expect(exitCode).toBe(0);
    });

    it("--fg and --bg flags are accepted", () => {
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--fg",
        "#1a1a1a",
        "--bg",
        "#f5f5f5",
      ]);
      expect(exitCode).toBe(0);
    });

    it("--margin flag is accepted", () => {
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--margin",
        "4",
      ]);
      expect(exitCode).toBe(0);
    });

    it("all customization flags together produce a valid SVG", () => {
      const out = tmp("all-flags.svg");
      cleanups.push(out);
      const { exitCode } = runCli([
        "generate",
        "https://qrdx.dev",
        "--body",
        "circle",
        "--eye",
        "rounded",
        "--dot",
        "circle",
        "--fg",
        "#000000",
        "--bg",
        "#ffffff",
        "--level",
        "Q",
        "--margin",
        "2",
        "--size",
        "512",
        "-o",
        out,
      ]);
      expect(exitCode).toBe(0);
      expect(existsSync(out)).toBe(true);
    });
  });

  describe("success output", () => {
    it("prints saved path and size when -o is provided", () => {
      const out = tmp("success-msg.svg");
      cleanups.push(out);
      const output = runCliOutput(["generate", "https://qrdx.dev", "-o", out]);
      expect(output).toContain(out);
      expect(output).toMatch(/\d+×\d+/);
    });
  });
});
