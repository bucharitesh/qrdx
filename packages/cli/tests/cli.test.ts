import { readFileSync } from "node:fs";
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
  });

  describe("logo display", () => {
    it("shows logo when generate is invoked", () => {
      const output = runCliOutput(["generate", "https://qrdx.dev"]);
      expect(hasLogo(output)).toBe(true);
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
      const { exitCode } = runCli(["https://qrdx.dev"]);
      expect(exitCode).toBe(0);
    });
  });
});
