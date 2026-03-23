import { execSync } from "node:child_process";
import { join } from "node:path";

const DIST_PATH = join(__dirname, "..", "dist", "index.js");

export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matches ESC sequences
  return str.replace(/\x1b\[[0-9;]*m/g, "").replace(/\[\?25[lh]/g, "");
}

export function stripLogo(str: string): string {
  return str
    .split("\n")
    .filter(
      (line) =>
        !(
          line.includes("███") ||
          line.includes("╔") ||
          line.includes("╚") ||
          line.includes("╝")
        )
    )
    .join("\n")
    .replace(/^\n+/, "");
}

export function hasLogo(str: string): boolean {
  return str.includes("███") || str.includes("╔") || str.includes("╚");
}

export function runCli(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): { stdout: string; stderr: string; exitCode: number } {
  const safeArgs = args.map((a) => JSON.stringify(a)).join(" ");
  try {
    const output = execSync(`node ${JSON.stringify(DIST_PATH)} ${safeArgs}`, {
      encoding: "utf-8",
      cwd: options?.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      timeout: options?.timeout ?? 15_000,
    });
    return { stdout: stripAnsi(output), stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: stripAnsi(e.stdout ?? ""),
      stderr: stripAnsi(e.stderr ?? ""),
      exitCode: e.status ?? 1,
    };
  }
}

export function runCliOutput(args: string[]): string {
  const { stdout, stderr } = runCli(args);
  return stdout || stderr;
}
