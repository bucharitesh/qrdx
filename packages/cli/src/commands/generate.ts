import { extname } from "node:path";
import * as p from "@clack/prompts";
import type {
  BodyPattern,
  ColorConfig,
  CornerEyeDotPattern,
  CornerEyePattern,
  ErrorLevel,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  DEFAULT_MARGIN,
  getTemplateIds,
} from "qrdx";
import { saveOutput } from "../render/output";

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
  size?: number;
  template?: string;
}

/**
 * Parses a color flag value: accepts a hex string or a JSON ColorConfig object.
 * e.g. "#ff0000" or '{"type":"linear","stops":[...],"angle":45}'
 */
function parseColorFlag(value: string): ColorConfig {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as ColorConfig;
    } catch {
      // fall through to raw string
    }
  }
  return trimmed;
}

// When stdin is not a TTY (piped/CI), skip all prompts and use flags/defaults
const IS_TTY = Boolean(process.stdin.isTTY);

function parseFlags(args: string[]): GenerateFlags {
  const flags: GenerateFlags = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i] as string;

    if (!arg.startsWith("-")) {
      if (!flags.value) {
        flags.value = arg;
      }
      i++;
      continue;
    }

    const next = args[i + 1];

    switch (arg) {
      case "-o":
      case "--output":
        flags.output = next;
        i += 2;
        break;
      case "-l":
      case "--level":
        flags.level = next as ErrorLevel;
        i += 2;
        break;
      case "--body":
        flags.body = next as BodyPattern;
        i += 2;
        break;
      case "--eye":
        flags.eye = next as CornerEyePattern;
        i += 2;
        break;
      case "--dot":
        flags.dot = next as CornerEyeDotPattern;
        i += 2;
        break;
      case "--fg":
        flags.fg = next ? parseColorFlag(next) : undefined;
        i += 2;
        break;
      case "--bg":
        flags.bg = next ? parseColorFlag(next) : undefined;
        i += 2;
        break;
      case "--eye-color":
        flags.eyeColor = next ? parseColorFlag(next) : undefined;
        i += 2;
        break;
      case "--dot-color":
        flags.dotColor = next ? parseColorFlag(next) : undefined;
        i += 2;
        break;
      case "--logo":
        flags.logo = next;
        i += 2;
        break;
      case "--margin":
        flags.margin = next ? Number.parseInt(next, 10) : DEFAULT_MARGIN;
        i += 2;
        break;
      case "--size":
        flags.size = next ? Number.parseInt(next, 10) : 512;
        i += 2;
        break;
      case "--no-logo":
        flags.noLogo = true;
        i++;
        break;
      case "--template":
        flags.template = next;
        i += 2;
        break;
      default:
        i++;
    }
  }

  return flags;
}

function isCancel(value: unknown): boolean {
  return p.isCancel(value);
}

function handleCancel(): never {
  p.cancel("Cancelled.");
  process.exit(0);
}

function inferFormat(outputPath: string): "svg" | "png" {
  const ext = extname(outputPath).toLowerCase();
  if (ext === ".png") {
    return "png";
  }
  return "svg";
}

export async function runGenerate(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const nonInteractive = !IS_TTY;

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
      flags.template
  );

  p.intro(`${TEXT}qrdx${RESET} ${DIM}— QR Code Generator${RESET}`);

  // ── 1. Data ──────────────────────────────────────────────────────────
  let value = flags.value;
  if (!value) {
    if (nonInteractive) {
      p.log.error("No data provided. Pass a URL or text as an argument.");
      process.exit(1);
    }
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
      handleCancel();
    }
    value = res as string;
  }

  // ── 2. Output path ────────────────────────────────────────────────────
  let outputPath = flags.output;
  const size = flags.size ?? 512;

  if (!(outputPath || nonInteractive)) {
    const pathRes = await p.text({
      message: "Output file (.svg or .png)",
      placeholder: "qr.svg",
      defaultValue: "qr.svg",
      validate(v) {
        if (!v.trim()) {
          return "Please enter an output path.";
        }
      },
    });
    if (isCancel(pathRes)) {
      handleCancel();
    }
    outputPath = (pathRes as string) || "qr.svg";
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
      const format = inferFormat(outputPath);
      await saveOutput({ ...qrProps, outputPath, format });
      spinner.stop(
        `${GREEN}✔${RESET}  Saved to ${TEXT}${outputPath}${RESET} ${DIM}(${size}×${size})${RESET}`
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
