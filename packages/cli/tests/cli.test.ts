import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { hasLogo, runCli, runCliOutput, stripLogo } from "./test-utils.js";

describe("qrdx CLI", () => {
  describe("--help", () => {
    it("displays usage and all command sections", () => {
      const output = runCliOutput(["--help"]);
      expect(output).toContain("Usage: qrdx");
      expect(output).toContain("Commands:");
      expect(output).toContain("generate");
      expect(output).toContain("Generate Options:");
      expect(output).toContain("--body");
      expect(output).toContain("--eye");
      expect(output).toContain("--dot");
      expect(output).toContain("--fg");
      expect(output).toContain("--bg");
      expect(output).toContain("--logo");
      expect(output).toContain("--size");
      expect(output).toContain("--format");
      expect(output).toContain(".eps");
    });

    it("-h produces identical output to --help", () => {
      expect(runCliOutput(["-h"])).toBe(runCliOutput(["--help"]));
    });

    it("help alias produces identical output to --help", () => {
      expect(runCliOutput(["help"])).toBe(runCliOutput(["--help"]));
    });
  });

  describe("--version", () => {
    it("prints a semver string", () => {
      const output = runCliOutput(["--version"]);
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("-v produces identical output to --version", () => {
      expect(runCliOutput(["-v"])).toBe(runCliOutput(["--version"]));
    });

    it("matches package.json version", () => {
      const output = runCliOutput(["--version"]);
      const pkg = JSON.parse(
        readFileSync(`${__dirname}/../package.json`, "utf-8")
      ) as { version: string };
      expect(output.trim()).toBe(pkg.version);
    });
  });

  describe("no arguments", () => {
    it("displays the banner", () => {
      const output = stripLogo(runCliOutput([]));
      expect(output).toContain("QR code generator for developers");
      expect(output).toContain("qrdx generate");
      expect(output).toContain("qrdx --help");
      expect(output).toContain("qrdx.dev");
    });
  });

  describe("unknown command", () => {
    it("shows error message for unknown flag", () => {
      const output = runCliOutput(["--unknown-flag"]);
      expect(output).toContain("Unknown command");
      expect(output).toContain("--help");
    });

    it("exits non-zero for unknown flag", () => {
      expect(runCli(["--unknown-flag"]).exitCode).toBe(1);
    });
  });

  describe("logo display", () => {
    it("shows logo when generate is invoked", () => {
      // No -o: writes the default qr.svg, so run outside the package dir.
      const { stdout, stderr } = runCli(["generate", "https://qrdx.dev"], {
        cwd: tmpdir(),
      });
      expect(hasLogo(stdout || stderr)).toBe(true);
    });

    it("shows logo on bare invocation", () => {
      const output = runCliOutput([]);
      expect(hasLogo(output)).toBe(true);
    });

    it("shows logo with --help", () => {
      const output = runCliOutput(["--help"]);
      expect(hasLogo(output)).toBe(true);
    });
  });

  describe("implicit generate", () => {
    it("treats a bare URL as a generate command", () => {
      const { exitCode } = runCli(["https://qrdx.dev"], { cwd: tmpdir() });
      expect(exitCode).toBe(0);
    });
  });
});
