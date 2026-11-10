import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseCsvText } from "../src/commands/batch";
import {
  CsvParser,
  createFilenameAllocator,
  guessFilenameColumn,
  guessValueColumn,
  resolveColumn,
  sanitizeFilename,
} from "../src/lib/csv";
import { runCli } from "./test-utils.js";

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "qrdx-batch-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("CSV parsing", () => {
  it("reads quotes, doubled quotes, line breaks in quotes, CRLF and a BOM", () => {
    expect(
      parseCsvText(
        '﻿url,name\r\n"https://a.example/?q=1,2",A\r\n"WIFI:S:Cafe ""Blue"";;","two\nlines"\r\n\r\nplain,last'
      )
    ).toEqual([
      ["url", "name"],
      ["https://a.example/?q=1,2", "A"],
      ['WIFI:S:Cafe "Blue";;', "two\nlines"],
      ["plain", "last"],
    ]);
  });

  it("gives the same rows however the file is split into chunks", () => {
    const text = 'a,b\n"x,""y""\nz",2\nlast,3\n';
    const whole = parseCsvText(text);
    for (let size = 1; size < text.length; size++) {
      const parser = new CsvParser();
      const rows: string[][] = [];
      for (let i = 0; i < text.length; i += size) {
        rows.push(...parser.push(text.slice(i, i + size)));
      }
      rows.push(...parser.end());
      expect(rows, `chunks of ${size}`).toEqual(whole);
    }
  });

  it("picks the columns the bulk tool picks", () => {
    const columns = ["SKU", "Link", "Notes"];
    const value = guessValueColumn(columns);
    expect(value).toBe(1);
    expect(guessFilenameColumn(columns, value)).toBe(0);
    expect(guessValueColumn(["a", "b"])).toBe(0);
    expect(guessFilenameColumn(["a", "b"], 0)).toBe(-1);
    expect(resolveColumn("notes", columns, "--name-column")).toBe(2);
    expect(resolveColumn("1", columns, "--name-column")).toBe(0);
    expect(() => resolveColumn("price", columns, "--value-column")).toThrow(
      /Columns: 1\. SKU, 2\. Link, 3\. Notes/
    );
  });

  it("makes portable, unique file names", () => {
    expect(sanitizeFilename('  a/b:c*d?"e  ')).toBe("a-b-c-d-e");
    const allocate = createFilenameAllocator();
    expect(
      ["Menu", "menu", "Menu", "menu-2"].map((n) => allocate(n, "svg"))
    ).toEqual(["Menu.svg", "menu-2.svg", "Menu-3.svg", "menu-2-2.svg"]);
  });
});

describe("qrdx batch", () => {
  it("writes a code for every row of a 10,000-row CSV, and errors.csv for the rest", () => {
    const dir = tempDir();
    const csv = join(dir, "codes.csv");
    const lines = ["sku,url"];
    for (let i = 1; i <= 10_000; i++) {
      lines.push(
        i === 77 ? "empty-row," : `sku-${i},https://shop.example.com/p/${i}`
      );
    }
    writeFileSync(csv, `${lines.join("\n")}\n`);
    const out = join(dir, "out");
    const started = Date.now();
    const result = runCli(["batch", csv, "-o", out, "--body", "circle"], {
      timeout: 600_000,
    });
    const seconds = (Date.now() - started) / 1000;
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Saved 9,999 SVG codes");
    const files = readdirSync(out);
    expect(files.filter((f) => f.endsWith(".svg"))).toHaveLength(9999);
    expect(files).toContain("sku-1.svg");
    expect(files).toContain("sku-10000.svg");
    expect(readFileSync(join(out, "errors.csv"), "utf-8")).toBe(
      "row,value,error\n78,,Empty value\n"
    );
    expect(readFileSync(join(out, "sku-1.svg"), "utf-8")).toMatch(/^<\?xml/);
    console.log(`qrdx batch: 10,000 rows (SVG) in ${seconds.toFixed(1)} s`);
  }, 600_000);

  it("takes columns by name or number, numbers files, and skips the header with --no-header", () => {
    const dir = tempDir();
    const csv = join(dir, "plain.csv");
    writeFileSync(csv, "https://a.example,first\nhttps://b.example,second\n");
    const out = join(dir, "out");
    const result = runCli([
      "batch",
      csv,
      "--no-header",
      "--value-column",
      "1",
      "-o",
      out,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["qr-00001.svg", "qr-00002.svg"]);

    const named = join(dir, "named");
    expect(
      runCli([
        "batch",
        csv,
        "--no-header",
        "--name-column",
        "2",
        "-o",
        named,
        "--format",
        "eps",
      ]).exitCode
    ).toBe(0);
    expect(readdirSync(named).sort()).toEqual(["first.eps", "second.eps"]);
  });

  it("explains a missing file argument and a bad column", () => {
    expect(runCli(["batch"]).stderr).toMatch(/Give a CSV file/);
    const dir = tempDir();
    const csv = join(dir, "x.csv");
    writeFileSync(csv, "url\nhttps://a.example\n");
    const bad = runCli(["batch", csv, "--value-column", "price", "-o", dir]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toMatch(/isn't a column of this file/);
    expect(existsSync(join(dir, "errors.csv"))).toBe(false);
  });

  it("is listed in --help", () => {
    const { stdout } = runCli(["--help"]);
    expect(stdout).toContain("batch, b");
    expect(stdout).toContain("--value-column");
  });
});
