import { createReadStream } from "node:fs";
import { extname } from "node:path";
import * as readline from "node:readline";
import * as p from "@clack/prompts";
import type {
  BodyPattern,
  ColorConfig,
  CornerEyeDotPattern,
  CornerEyePattern,
  ErrorLevel,
  FrameStyle,
  QRFrame,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  colorConfigSchema,
  DEFAULT_FRAME_TEXT,
  DEFAULT_MARGIN,
  errorLevelSchema,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  getFrameDimensions,
  getTemplateIds,
} from "qrdx";
import {
  OUTPUT_FORMATS,
  type OutputFormat,
  saveOutput,
} from "../render/output";

const RESET = "\x1b[0m";
const TEXT = "\x1b[38;5;145m";
const GREEN = "\x1b[38;5;114m";
const DIM = "\x1b[38;5;102m";

interface GenerateFlags {
  value?: string;
  level?: ErrorLevel;
  body?: BodyPattern;
  eye?: CornerEyePattern;
  dot?: CornerEyeDotPattern;
  fg?: ColorConfig;
  bg?: ColorConfig;
  eyeColor?: ColorConfig;
  dotColor?: ColorConfig;
  logo?: string;
  noLogo?: boolean;
  margin?: number;
  output?: string;
  format?: OutputFormat;
  size?: number;
  template?: string;
  frame?: FrameStyle;
  frameText?: string;
  frameColor?: string;
  frameTextColor?: string;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** Largest PNG side: beyond this sharp hits its pixel limit (and RAM). */
const MAX_PNG_SIZE = 10_000;

/**
 * Parses a color flag value: accepts a hex string or a JSON ColorConfig object.
 * e.g. "#ff0000" or '{"type":"linear","stops":[...],"angle":45}'
 */
function parseColorFlag(value: string): ColorConfig {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`Invalid gradient JSON: ${trimmed}`);
  }
  const result = colorConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid gradient: ${trimmed}\nExpected {"type":"linear"|"radial","stops":[{"color":"#hex","offset":0-100}, ...]} with at least 2 stops.`
    );
  }
  return result.data;
}

function assertOneOf(
  flag: string,
  value: string | undefined,
  allowed: readonly string[]
): void {
  if (value !== undefined && !allowed.includes(value)) {
    throw new Error(
      `Invalid ${flag} "${value}". Expected one of: ${allowed.join(", ")}`
    );
  }
}

function parseIntegerFlag(
  flag: string,
  value: string | undefined,
  min: number
) {
  const parsed = Number(value);
  if (!(value && Number.isInteger(parsed) && parsed >= min)) {
    throw new Error(
      `Invalid ${flag} "${value ?? ""}". Expected a whole number ≥ ${min}.`
    );
  }
  return parsed;
}

function assertHexColor(flag: string, value: string | undefined): void {
  if (value !== undefined && !HEX_COLOR.test(value)) {
    throw new Error(
      `Invalid ${flag} "${value}". Expected a hex color like #000000.`
    );
  }
}

function requireValue(flag: string, value: string | undefined): string {
  // "--level --body circle": the next option is not this option's value.
  if (value === undefined || /^--?[a-z]/i.test(value)) {
    throw new Error(`${flag} needs a value. Run qrdx --help to see options.`);
  }
  return value;
}

/** Frame options from flags; frame text/colors alone imply a bottom banner. */
function frameFromFlags(flags: GenerateFlags): QRFrame | undefined {
  const style =
    flags.frame ??
    (flags.frameText !== undefined ||
    flags.frameColor !== undefined ||
    flags.frameTextColor !== undefined
      ? "banner-bottom"
      : undefined);
  if (!style || style === "none") {
    return undefined;
  }
  return {
    style,
    ...(flags.frameText !== undefined && { text: flags.frameText }),
    ...(flags.frameColor && { color: flags.frameColor }),
    ...(flags.frameTextColor && { textColor: flags.frameTextColor }),
  };
}

/** Rejects bad flag values up front instead of failing deep inside rendering. */
function validateFlags(flags: GenerateFlags): void {
  assertOneOf("--level", flags.level, errorLevelSchema.options);
  assertOneOf("--body", flags.body, BODY_PATTERN);
  assertOneOf("--eye", flags.eye, CORNER_EYE_PATTERNS);
  assertOneOf("--dot", flags.dot, CORNER_EYE_DOT_PATTERNS);
  assertOneOf(
    "--template",
    flags.template,
    getTemplateIds().filter((id) => id !== "default")
  );
  assertOneOf("--frame", flags.frame, FRAME_STYLES);
  if (
    flags.frameText !== undefined &&
    flags.frameText.length > FRAME_TEXT_MAX_LENGTH
  ) {
    throw new Error(
      `Invalid --frame-text "${flags.frameText}". Use ${FRAME_TEXT_MAX_LENGTH} characters or fewer.`
    );
  }
  assertHexColor("--frame-color", flags.frameColor);
  assertHexColor("--frame-text-color", flags.frameTextColor);
  assertOneOf("--format", flags.format, OUTPUT_FORMATS);
  if (flags.output !== undefined) {
    const ext = extname(flags.output).toLowerCase();
    if (!["", ".svg", ".png", ".eps"].includes(ext)) {
      throw new Error(
        `Unsupported output format "${ext}". Use a .svg, .png or .eps file name.`
      );
    }
    if (ext && flags.format && ext !== `.${flags.format}`) {
      throw new Error(
        `--format ${flags.format} does not match the output file "${flags.output}". Use a .${flags.format} file name or drop --format.`
      );
    }
  }
  const isPng =
    extname(flags.output ?? "").toLowerCase() === ".png" ||
    flags.format === "png";
  if (isPng && flags.size !== undefined && flags.size > MAX_PNG_SIZE) {
    throw new Error(
      `Invalid --size "${flags.size}". PNG output is at most ${MAX_PNG_SIZE} px; use .svg or .eps for larger prints.`
    );
  }
}

const isCI = process.env.CI === "true";
/** Clack needs stdin+stdout TTY; `npx` often leaves stdin non-TTY in a real terminal. */
const canUseClack =
  process.stdin.isTTY === true && process.stdout.isTTY === true && !isCI;

function readLineFromTTY(question: string): Promise<string | undefined> {
  if (process.platform === "win32") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    let stream: ReturnType<typeof createReadStream>;
    try {
      stream = createReadStream("/dev/tty", { flags: "r" });
    } catch {
      resolve(undefined);
      return;
    }
    const rl = readline.createInterface({
      input: stream,
      output: process.stdout,
    });
    const finish = (answer: string | undefined) => {
      rl.close();
      stream.destroy();
      resolve(answer);
    };
    stream.once("error", () => finish(undefined));
    rl.question(question, (answer) => finish(answer));
  });
}

function parseFlags(args: string[]): GenerateFlags {
  const flags: GenerateFlags = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i] as string;

    if (!arg.startsWith("-")) {
      if (flags.value !== undefined) {
        // An unquoted value with spaces would silently encode only its first word.
        throw new Error(
          `Unexpected argument "${arg}". Quote text with spaces: qrdx generate "${flags.value} ${arg}"`
        );
      }
      flags.value = arg;
      i++;
      continue;
    }

    const next = args[i + 1];

    switch (arg) {
      case "-o":
      case "--output":
        if (!next || /^--?[a-z]/i.test(next)) {
          throw new Error(`${arg} needs a file path, e.g. ${arg} qr.svg`);
        }
        flags.output = next;
        i += 2;
        break;
      case "--format":
        flags.format = requireValue(arg, next).toLowerCase() as OutputFormat;
        i += 2;
        break;
      case "-l":
      case "--level":
        flags.level = requireValue(arg, next).toUpperCase() as ErrorLevel;
        i += 2;
        break;
      case "--body":
        flags.body = requireValue(arg, next) as BodyPattern;
        i += 2;
        break;
      case "--eye":
        flags.eye = requireValue(arg, next) as CornerEyePattern;
        i += 2;
        break;
      case "--dot":
        flags.dot = requireValue(arg, next) as CornerEyeDotPattern;
        i += 2;
        break;
      case "--fg":
        flags.fg = parseColorFlag(requireValue(arg, next));
        i += 2;
        break;
      case "--bg":
        flags.bg = parseColorFlag(requireValue(arg, next));
        i += 2;
        break;
      case "--eye-color":
        flags.eyeColor = parseColorFlag(requireValue(arg, next));
        i += 2;
        break;
      case "--dot-color":
        flags.dotColor = parseColorFlag(requireValue(arg, next));
        i += 2;
        break;
      case "--logo":
        flags.logo = requireValue(arg, next);
        i += 2;
        break;
      case "--margin":
        flags.margin = parseIntegerFlag(arg, next, 0);
        i += 2;
        break;
      case "--size":
        flags.size = parseIntegerFlag(arg, next, 1);
        i += 2;
        break;
      case "--no-logo":
        flags.noLogo = true;
        i++;
        break;
      case "--template":
        flags.template = requireValue(arg, next);
        i += 2;
        break;
      case "--frame":
        flags.frame = requireValue(arg, next) as FrameStyle;
        i += 2;
        break;
      case "--frame-text":
        flags.frameText = requireValue(arg, next);
        i += 2;
        break;
      case "--frame-color":
        flags.frameColor = requireValue(arg, next);
        i += 2;
        break;
      case "--frame-text-color":
        flags.frameTextColor = requireValue(arg, next);
        i += 2;
        break;
      default:
        throw new Error(
          `Unknown option "${arg}". Run qrdx --help to see all options.`
        );
    }
  }

  validateFlags(flags);
  return flags;
}

function isCancel(value: unknown): boolean {
  return p.isCancel(value);
}

function handleCancel(): never {
  p.cancel("Cancelled.");
  console.error(
    `${DIM}Tip:${RESET} ${TEXT}qrdx generate "https://…" -o qr.svg${RESET} — local dev: ${TEXT}pnpm qrdx -- generate …${RESET}`
  );
  process.exit(0);
}

function inferFormat(
  outputPath: string,
  format: OutputFormat | undefined
): OutputFormat {
  const ext = extname(outputPath).toLowerCase();
  if (ext === ".png") {
    return "png";
  }
  if (ext === ".eps") {
    return "eps";
  }
  return ext === ".svg" ? "svg" : (format ?? "svg");
}

export async function runGenerate(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const nonInteractive = !canUseClack;

  // Any advanced flag explicitly passed → skip the "customize?" gate
  const hasAdvancedFlags = Boolean(
    flags.body ||
      flags.eye ||
      flags.dot ||
      flags.fg ||
      flags.bg ||
      flags.eyeColor ||
      flags.dotColor ||
      flags.logo ||
      flags.level ||
      flags.margin !== undefined ||
      flags.template ||
      frameFromFlags(flags)
  );

  p.intro(`${TEXT}qrdx${RESET} ${DIM}— QR Code Generator${RESET}`);

  if (canUseClack) {
    process.stdin.resume();
  }

  // ── 1. Data ──────────────────────────────────────────────────────────
  let value = flags.value;
  if (!value) {
    if (canUseClack) {
      const promptStart = performance.now();
      const res = await p.text({
        message: "URL or text to encode",
        placeholder: "https://qrdx.dev",
        validate(v) {
          if (!v.trim()) {
            return "Please enter a value to encode.";
          }
        },
      });
      if (isCancel(res)) {
        const instant =
          performance.now() - promptStart < 120 &&
          process.platform !== "win32" &&
          process.stdout.isTTY &&
          !isCI;
        if (instant) {
          const line = await readLineFromTTY(
            `${TEXT}URL or text to encode${RESET} ${DIM}(e.g. https://qrdx.dev)${RESET}: `
          );
          if (line?.trim()) {
            value = line.trim();
          } else {
            handleCancel();
          }
        } else {
          handleCancel();
        }
      } else {
        value = res as string;
      }
    } else if (process.stdout.isTTY && !isCI) {
      const line = await readLineFromTTY(
        `${TEXT}URL or text to encode${RESET} ${DIM}(e.g. https://qrdx.dev)${RESET}: `
      );
      if (line?.trim()) {
        value = line.trim();
      }
    }
    if (!value) {
      console.error(
        'No data to encode. Example: npx @qrdx/cli generate "https://example.com" -o qr.svg'
      );
      process.exit(1);
    }
  }

  // ── 2. Output path ────────────────────────────────────────────────────
  let outputPath = flags.output;
  const size = flags.size ?? 512;
  const defaultOutput = `qr.${flags.format ?? "svg"}`;

  if (!outputPath) {
    if (canUseClack) {
      const pathRes = await p.text({
        message: "Output file (.svg, .png or .eps)",
        placeholder: defaultOutput,
        defaultValue: defaultOutput,
        validate(v) {
          if (!v.trim()) {
            return "Please enter an output path.";
          }
        },
      });
      if (isCancel(pathRes)) {
        handleCancel();
      }
      outputPath = (pathRes as string) || defaultOutput;
    } else if (process.stdout.isTTY && !isCI) {
      const pathAns = await readLineFromTTY(
        `Output file ${DIM}(.svg, .png or .eps, Enter = ${defaultOutput})${RESET}: `
      );
      outputPath = pathAns?.trim() || defaultOutput;
    } else {
      outputPath = defaultOutput;
    }
  }

  // ── 3. Advanced customizations? ───────────────────────────────────────
  let wantAdvanced = hasAdvancedFlags;
  if (!(hasAdvancedFlags || nonInteractive)) {
    const res = await p.confirm({
      message: "Advanced customizations?",
      initialValue: false,
    });
    if (isCancel(res)) {
      handleCancel();
    }
    wantAdvanced = res as boolean;
  }

  // defaults used when skipping advanced prompts
  let level = flags.level ?? ("Q" as ErrorLevel);
  let body = flags.body ?? ("square" as BodyPattern);
  let eye = flags.eye ?? ("square" as CornerEyePattern);
  let dot = flags.dot ?? ("square" as CornerEyeDotPattern);
  let fg: ColorConfig = flags.fg ?? "#000000";
  let bg: ColorConfig = flags.bg ?? "#ffffff";
  let eyeColor: ColorConfig | undefined = flags.eyeColor;
  let dotColor: ColorConfig | undefined = flags.dotColor;
  let logo = flags.logo;
  let margin = flags.margin ?? DEFAULT_MARGIN;
  let template = flags.template;
  let frame = frameFromFlags(flags);

  if (wantAdvanced && !nonInteractive) {
    // ── Error correction ──────────────────────────────────────────────
    if (!flags.level) {
      const res = await p.select<ErrorLevel>({
        message: "Error correction level",
        options: [
          {
            value: "Q",
            label: "Q – Quartile (recommended)",
            hint: "~25% data recovery",
          },
          { value: "L", label: "L – Low", hint: "~7% data recovery" },
          { value: "M", label: "M – Medium", hint: "~15% data recovery" },
          { value: "H", label: "H – High", hint: "~30% data recovery" },
        ],
        initialValue: "Q",
      });
      if (isCancel(res)) {
        handleCancel();
      }
      level = res as ErrorLevel;
    }

    // ── Body dot pattern ──────────────────────────────────────────────
    if (!flags.body) {
      const res = await p.select<BodyPattern>({
        message: "Body dot pattern",
        options: BODY_PATTERN.map((b) => ({ value: b, label: b })),
        initialValue: "square" as BodyPattern,
      });
      if (isCancel(res)) {
        handleCancel();
      }
      body = res as BodyPattern;
    }

    // ── Corner eye pattern ────────────────────────────────────────────
    if (!flags.eye) {
      const res = await p.select<CornerEyePattern>({
        message: "Corner eye pattern",
        options: CORNER_EYE_PATTERNS.map((e) => ({ value: e, label: e })),
        initialValue: "square" as CornerEyePattern,
      });
      if (isCancel(res)) {
        handleCancel();
      }
      eye = res as CornerEyePattern;
    }

    // ── Corner dot pattern ────────────────────────────────────────────
    if (!flags.dot) {
      const res = await p.select<CornerEyeDotPattern>({
        message: "Corner dot pattern",
        options: CORNER_EYE_DOT_PATTERNS.map((d) => ({ value: d, label: d })),
        initialValue: "square" as CornerEyeDotPattern,
      });
      if (isCancel(res)) {
        handleCancel();
      }
      dot = res as CornerEyeDotPattern;
    }

    // ── Foreground color ──────────────────────────────────────────────
    if (!flags.fg) {
      const res = await p.text({
        message: `Foreground color ${DIM}(hex or JSON gradient)${RESET}`,
        placeholder: "#000000",
        defaultValue: "#000000",
        validate(v) {
          if (!v) {
            return undefined;
          }
          if (v.trim().startsWith("{")) {
            try {
              JSON.parse(v.trim());
            } catch {
              return "Enter a valid hex color or JSON gradient object";
            }
            return undefined;
          }
          if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) {
            return "Enter a valid hex color (e.g. #000000) or JSON gradient";
          }
        },
      });
      if (isCancel(res)) {
        handleCancel();
      }
      fg = parseColorFlag((res as string) || "#000000");
    }

    // ── Background color ──────────────────────────────────────────────
    if (!flags.bg) {
      const res = await p.text({
        message: `Background color ${DIM}(hex or JSON gradient)${RESET}`,
        placeholder: "#ffffff",
        defaultValue: "#ffffff",
        validate(v) {
          if (!v) {
            return undefined;
          }
          if (v.trim().startsWith("{")) {
            try {
              JSON.parse(v.trim());
            } catch {
              return "Enter a valid hex color or JSON gradient object";
            }
            return undefined;
          }
          if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) {
            return "Enter a valid hex color (e.g. #ffffff) or JSON gradient";
          }
        },
      });
      if (isCancel(res)) {
        handleCancel();
      }
      bg = parseColorFlag((res as string) || "#ffffff");
    }

    // ── Eye color (optional) ──────────────────────────────────────────
    if (eyeColor === undefined) {
      const res = await p.text({
        message: `Corner eye color ${DIM}(leave blank to match foreground)${RESET}`,
        placeholder: "leave blank",
        validate(v) {
          if (!v) {
            return undefined;
          }
          if (v.trim().startsWith("{")) {
            try {
              JSON.parse(v.trim());
            } catch {
              return "Enter a valid hex color or JSON gradient object";
            }
            return undefined;
          }
          if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) {
            return "Enter a valid hex color or leave blank";
          }
        },
      });
      if (isCancel(res)) {
        handleCancel();
      }
      const eyeVal = res as string;
      eyeColor = eyeVal ? parseColorFlag(eyeVal) : undefined;
    }

    // ── Dot color (optional) ──────────────────────────────────────────
    if (dotColor === undefined) {
      const res = await p.text({
        message: `Corner dot color ${DIM}(leave blank to match foreground)${RESET}`,
        placeholder: "leave blank",
        validate(v) {
          if (!v) {
            return undefined;
          }
          if (v.trim().startsWith("{")) {
            try {
              JSON.parse(v.trim());
            } catch {
              return "Enter a valid hex color or JSON gradient object";
            }
            return undefined;
          }
          if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) {
            return "Enter a valid hex color or leave blank";
          }
        },
      });
      if (isCancel(res)) {
        handleCancel();
      }
      const dotVal = res as string;
      dotColor = dotVal ? parseColorFlag(dotVal) : undefined;
    }

    // ── Template ──────────────────────────────────────────────────────
    if (!flags.template) {
      const templateIds = getTemplateIds();
      const res = await p.select<string>({
        message: `Template ${DIM}(decorative wrapper around the QR code)${RESET}`,
        options: [
          { value: "", label: "none" },
          ...templateIds
            .filter((id) => id !== "default")
            .map((id) => ({ value: id, label: id })),
        ],
        initialValue: "",
      });
      if (isCancel(res)) {
        handleCancel();
      }
      template = (res as string) || undefined;
    }

    // ── Frame ─────────────────────────────────────────────────────────
    if (flags.frame === undefined && !frame) {
      const res = await p.select<FrameStyle>({
        message: `Frame ${DIM}(call-to-action label around the code)${RESET}`,
        options: FRAME_STYLES.map((style) => ({ value: style, label: style })),
        initialValue: "none" as FrameStyle,
      });
      if (isCancel(res)) {
        handleCancel();
      }
      if (res !== "none") {
        const text = await p.text({
          message: `Frame text ${DIM}(up to ${FRAME_TEXT_MAX_LENGTH} characters)${RESET}`,
          placeholder: DEFAULT_FRAME_TEXT,
          defaultValue: DEFAULT_FRAME_TEXT,
          validate(v) {
            if (v && v.length > FRAME_TEXT_MAX_LENGTH) {
              return `Use ${FRAME_TEXT_MAX_LENGTH} characters or fewer`;
            }
          },
        });
        if (isCancel(text)) {
          handleCancel();
        }
        frame = {
          style: res as FrameStyle,
          text: (text as string) || DEFAULT_FRAME_TEXT,
        };
      }
    }

    // ── Logo ──────────────────────────────────────────────────────────
    if (logo === undefined && !flags.noLogo) {
      const addLogo = await p.confirm({
        message: "Add a logo to the center?",
        initialValue: false,
      });
      if (isCancel(addLogo)) {
        handleCancel();
      }
      if (addLogo) {
        const res = await p.text({
          message: "Logo URL",
          placeholder: "https://qrdx.dev/logo.png",
          validate(v) {
            if (!v.trim()) {
              return "Please enter a URL for the logo.";
            }
            try {
              new URL(v);
            } catch {
              return "Please enter a valid URL.";
            }
          },
        });
        if (isCancel(res)) {
          handleCancel();
        }
        logo = res as string;
      }
    }

    // ── Margin ────────────────────────────────────────────────────────
    if (flags.margin === undefined) {
      const res = await p.text({
        message: "Quiet zone margin (modules)",
        placeholder: String(DEFAULT_MARGIN),
        defaultValue: String(DEFAULT_MARGIN),
        validate(v) {
          if (v && Number.isNaN(Number.parseInt(v, 10))) {
            return "Enter a number";
          }
          if (v && Number.parseInt(v, 10) < 0) {
            return "Must be 0 or greater";
          }
        },
      });
      if (isCancel(res)) {
        handleCancel();
      }
      margin = Number.parseInt((res as string) || String(DEFAULT_MARGIN), 10);
    }
  }

  // ── Generate ──────────────────────────────────────────────────────────
  const spinner = p.spinner();
  spinner.start("Generating QR code...");

  try {
    const qrProps = {
      value: value as string,
      level,
      bodyPattern: body,
      cornerEyePattern: eye,
      cornerEyeDotPattern: dot,
      fgColor: fg,
      bgColor: bg,
      ...(eyeColor ? { eyeColor } : {}),
      ...(dotColor ? { dotColor } : {}),
      margin,
      size,
      ...(template ? { templateId: template } : {}),
      ...(frame ? { frame } : {}),
      ...(logo
        ? {
            imageSettings: {
              src: logo,
              height: Math.round(size * 0.2),
              width: Math.round(size * 0.2),
              excavate: true,
            },
          }
        : {}),
    };

    if (outputPath) {
      const format = inferFormat(outputPath, flags.format);
      await saveOutput({ ...qrProps, outputPath, format });
      const dimensions = getFrameDimensions(size, frame);
      spinner.stop(
        `${GREEN}✔${RESET}  Saved to ${TEXT}${outputPath}${RESET} ${DIM}(${Math.round(dimensions.width)}×${Math.round(dimensions.height)})${RESET}`
      );
    } else {
      spinner.stop("QR code ready");
    }
  } catch (err) {
    spinner.stop("Failed to generate QR code");
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    process.exit(1);
  }

  p.outro(`${DIM}Done!${RESET}`);
}
