import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CsvParser,
  createFilenameAllocator,
  csvCell,
  guessFilenameColumn,
  guessValueColumn,
  readCsvRows,
  resolveColumn,
  sanitizeFilename,
} from "../lib/csv";
import { type OutputFormat, saveOutput } from "../render/output";
import { buildQrProps, styleFromArgs } from "./generate";

// `qrdx batch codes.csv`: a static QR code for every row of a CSV, rendered
// on this machine (no account, no quotas, no row limit), with the columns
// the free bulk tool at qrdx.dev/tools/bulk reads. The file is read as a
// stream and codes are written as they're made, so 10,000 rows or a million
// use the same memory.

const RESET = "\x1b[0m";
const TEXT = "\x1b[38;5;145m";
const GREEN = "\x1b[38;5;114m";
const DIM = "\x1b[38;5;102m";

export interface BatchMeta {
  help: () => void;
  version: () => void;
}

interface BatchOptions {
  file?: string;
  out: string;
  valueColumn?: string;
  nameColumn?: string;
  header: boolean;
  jobs?: number;
  /** Options for the code's style, passed on to generate's parser. */
  style: string[];
  help?: boolean;
  version?: boolean;
}

const BATCH_FLAGS = new Set([
  "-o",
  "--out",
  "--output",
  "--value-column",
  "--name-column",
  "--jobs",
]);

function parseBatchArgs(args: string[]): BatchOptions {
  const options: BatchOptions = { out: "qr-codes", header: true, style: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const next = args[i + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-v" || arg === "--version") {
      options.version = true;
    } else if (arg === "--no-header") {
      options.header = false;
    } else if (BATCH_FLAGS.has(arg)) {
      if (next === undefined || /^--?[a-z]/i.test(next)) {
        throw new Error(`${arg} needs a value. Run qrdx batch --help.`);
      }
      i++;
      if (arg === "--value-column") options.valueColumn = next;
      else if (arg === "--name-column") options.nameColumn = next;
      else if (arg === "--jobs") {
        const jobs = Number(next);
        if (!(Number.isInteger(jobs) && jobs >= 1 && jobs <= 64)) {
          throw new Error(
            `Invalid --jobs "${next}". Use a number from 1 to 64.`
          );
        }
        options.jobs = jobs;
      } else options.out = next;
    } else if (!arg.startsWith("-") && options.file === undefined) {
      options.file = arg;
    } else {
      // A style option (and its value): generate's parser checks them.
      options.style.push(arg);
      if (next !== undefined && !/^--?[a-z]/i.test(next) && !isSwitch(arg)) {
        options.style.push(next);
        i++;
      }
    }
  }
  return options;
}

/** Style options that take no value. */
const isSwitch = (arg: string) => arg === "--no-logo";

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /too long|data too big|overflow/i.test(message)
    ? "Too much data for one QR code"
    : message || "Could not generate";
}

/** The logo once, as a data URL, so rows don't fetch it again and again. */
async function logoDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  let bytes: Buffer;
  let type = "image/png";
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Could not download logo (${response.status}): ${src}`);
    }
    type = response.headers.get("content-type")?.split(";")[0] ?? type;
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    bytes = readFileSync(src);
    if (/\.svg$/i.test(src)) type = "image/svg+xml";
    else if (/\.jpe?g$/i.test(src)) type = "image/jpeg";
    else if (/\.webp$/i.test(src)) type = "image/webp";
  }
  return `data:${type};base64,${bytes.toString("base64")}`;
}

export async function runBatch(args: string[], meta: BatchMeta): Promise<void> {
  const options = parseBatchArgs(args);
  if (options.help) return meta.help();
  if (options.version) return meta.version();
  if (!options.file) {
    throw new Error(
      "Give a CSV file: qrdx batch codes.csv -o qr-codes (run qrdx batch --help)."
    );
  }
  const { flags, settings } = styleFromArgs(options.style);
  if (flags.value !== undefined) {
    throw new Error(
      `Unexpected argument "${flags.value}". qrdx batch takes one CSV file.`
    );
  }
  const format: OutputFormat = flags.format ?? "svg";
  if (settings.logo) settings.logo = await logoDataUrl(settings.logo);
  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  const jobs = options.jobs ?? (format === "svg" ? 4 : 8);

  const allocate = createFilenameAllocator();
  const failures: { row: number; value: string; error: string }[] = [];
  const running = new Set<Promise<void>>();
  let columns: string[] | null = options.header ? null : [];
  let valueColumn = 0;
  let nameColumn = -1;
  let line = 0;
  let saved = 0;
  let index = 0;
  const started = performance.now();
  const tty = process.stderr.isTTY === true;
  let lastReport = 0;
  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < (tty ? 100 : 5000)) return;
    lastReport = now;
    const text = `${index.toLocaleString("en-US")} rows · ${saved.toLocaleString("en-US")} saved${failures.length > 0 ? ` · ${failures.length.toLocaleString("en-US")} skipped` : ""}`;
    process.stderr.write(tty ? `\r${DIM}${text}${RESET}\x1b[K` : `${text}\n`);
  };

  /** Saves one code; `running` holds it until it's written. */
  const render = (value: string, file: string, row: number) => {
    const task: Promise<void> = saveOutput({
      ...buildQrProps(value, settings),
      outputPath: join(out, file),
      format,
    })
      .then(() => {
        saved++;
      })
      .catch((error: unknown) => {
        failures.push({ row, value, error: readableError(error) });
      })
      .finally(() => {
        running.delete(task);
        report();
      });
    running.add(task);
  };

  for await (const row of readCsvRows(options.file)) {
    line++;
    if (columns === null) {
      columns = row.map((name, i) => name.trim() || `Column ${i + 1}`);
      valueColumn = options.valueColumn
        ? resolveColumn(options.valueColumn, columns, "--value-column")
        : guessValueColumn(columns);
      nameColumn = options.nameColumn
        ? resolveColumn(options.nameColumn, columns, "--name-column")
        : guessFilenameColumn(columns, valueColumn);
      continue;
    }
    if (line === 1 && !options.header) {
      // Without a header, columns are numbers: 1, 2, …
      const width = row.length;
      const numbered = Array.from({ length: width }, (_, i) => String(i + 1));
      if (options.valueColumn) {
        valueColumn = resolveColumn(
          options.valueColumn,
          numbered,
          "--value-column"
        );
      }
      if (options.nameColumn) {
        nameColumn = resolveColumn(
          options.nameColumn,
          numbered,
          "--name-column"
        );
      }
    }
    index++;
    const value = row[valueColumn]?.trim() ?? "";
    if (!value) {
      failures.push({ row: line, value, error: "Empty value" });
      report();
      continue;
    }
    const base =
      sanitizeFilename(nameColumn >= 0 ? (row[nameColumn] ?? "") : "") ||
      `qr-${String(index).padStart(5, "0")}`;
    render(value, allocate(base, format), line);
    if (running.size >= jobs) await Promise.race(running);
  }
  await Promise.all(running);
  report(true);
  if (tty) process.stderr.write("\n");

  if (failures.length > 0) {
    failures.sort((a, b) => a.row - b.row);
    writeFileSync(
      join(out, "errors.csv"),
      `${["row,value,error", ...failures.map((f) => [f.row, f.value, f.error].map(csvCell).join(","))].join("\n")}\n`,
      "utf-8"
    );
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (saved === 0) {
    throw new Error(
      index === 0
        ? "The CSV has no rows with codes."
        : `No codes could be made. See ${join(out, "errors.csv")}.`
    );
  }
  console.log(
    `${GREEN}✔${RESET}  Saved ${saved.toLocaleString("en-US")} ${format.toUpperCase()} codes to ${TEXT}${out}${RESET} ${DIM}in ${seconds} s${RESET}`
  );
  if (failures.length > 0) {
    console.log(
      `   ${failures.length.toLocaleString("en-US")} rows skipped: ${TEXT}${join(out, "errors.csv")}${RESET}`
    );
  }
}

// For tests: parse a CSV string the way the command reads files.
export function parseCsvText(text: string): string[][] {
  const parser = new CsvParser();
  return [...parser.push(text), ...parser.end()];
}
