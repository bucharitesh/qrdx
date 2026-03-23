import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGenerate } from "./commands/generate";

// ─── ANSI ────────────────────────────────────────────────────────────────────
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[38;5;102m";
const TEXT = "\x1b[38;5;145m";

const GRAYS = [
  "\x1b[38;5;250m",
  "\x1b[38;5;248m",
  "\x1b[38;5;245m",
  "\x1b[38;5;243m",
  "\x1b[38;5;240m",
  "\x1b[38;5;238m",
];

// ─── ASCII Logo ───────────────────────────────────────────────────────────────
const LOGO_LINES = [
  " ██████╗ ██████╗ ██████╗ ██╗  ██╗",
  "██╔═══██╗██╔══██╗██╔══██╗╚██╗██╔╝",
  "██║   ██║██████╔╝██║  ██║ ╚███╔╝ ",
  "██║▄▄ ██║██╔══██╗██║  ██║ ██╔██╗ ",
  "╚██████╔╝██║  ██║██████╔╝██╔╝ ██╗",
  " ╚═══█═╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝",
];

// ─── Version ──────────────────────────────────────────────────────────────────
function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.0.1";
  }
}

const VERSION = getVersion();

// ─── Banner ───────────────────────────────────────────────────────────────────
function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i] ?? GRAYS[5]}${line}${RESET}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(`${DIM}QR code generator for developers${RESET}`);
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}qrdx generate${RESET}                   ${DIM}Generate a QR code interactively${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}qrdx generate${RESET} ${DIM}<url>${RESET}            ${DIM}Generate from URL${RESET}`
  );
  console.log();
  console.log(
    `  ${DIM}$${RESET} ${TEXT}qrdx --help${RESET}                     ${DIM}Show all commands and options${RESET}`
  );
  console.log(
    `  ${DIM}$${RESET} ${TEXT}qrdx --version${RESET}                  ${DIM}Show version${RESET}`
  );
  console.log();
  console.log(`  ${DIM}try:${RESET} npx qrdx-cli generate "https://qrdx.dev"`);
  console.log();
}

function showHelp(): void {
  showLogo();
  console.log(`
${BOLD}Usage:${RESET} qrdx <command> [options]

${BOLD}Commands:${RESET}
  generate, gen, g    Generate a QR code (fully interactive or via flags)

${BOLD}Generate Options:${RESET}
  <data>              URL or text to encode (positional)
  -o, --output        Output file path (.svg or .png)
  -l, --level         Error correction: L, M, Q, H  ${DIM}(default: Q)${RESET}
  --body              Body dot pattern:
                        ${DIM}square, circle, circle-large, diamond,${RESET}
                        ${DIM}circle-mixed, pacman, rounded, small-square, vertical-line${RESET}
  --eye               Corner eye pattern:
                        ${DIM}square, rounded, gear, circle, diya,${RESET}
                        ${DIM}extra-rounded, message, pointy, curly${RESET}
  --dot               Corner dot pattern:
                        ${DIM}square, rounded, circle, diamond, message,${RESET}
                        ${DIM}message-reverse, diya, diya-reverse,${RESET}
                        ${DIM}rounded-triangle, star, banner${RESET}
  --fg                Foreground color  ${DIM}(default: #000000)${RESET}
  --bg                Background color  ${DIM}(default: #ffffff)${RESET}
  --eye-color         Corner eye color  ${DIM}(default: matches --fg)${RESET}
  --dot-color         Corner dot color  ${DIM}(default: matches --fg)${RESET}
  --logo              Logo URL for center image
  --margin            Quiet zone margin in modules  ${DIM}(default: 0)${RESET}
  --size              Output pixel size for SVG/PNG  ${DIM}(default: 512)${RESET}

${BOLD}Global Options:${RESET}
  --help, -h          Show this help message
  --version, -v       Show version number

${BOLD}Examples:${RESET}
  ${DIM}$${RESET} qrdx generate
  ${DIM}$${RESET} qrdx generate "https://qrdx.dev"
  ${DIM}$${RESET} qrdx generate "https://qrdx.dev" -o qr.svg
  ${DIM}$${RESET} qrdx generate "https://qrdx.dev" -o qr.png --body circle --eye gear --dot star
  ${DIM}$${RESET} qrdx generate "https://qrdx.dev" --fg "#ff0000" --bg "#ffffff" --size 1024
  ${DIM}$${RESET} qrdx generate "https://qrdx.dev" --logo "https://qrdx.dev/logo.png" -o branded.svg

  Visit ${TEXT}https://qrdx.dev${RESET} for more.
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showBanner();
    return;
  }

  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case "generate":
    case "gen":
    case "g":
      showLogo();
      console.log();
      await runGenerate(restArgs);
      break;

    case "--help":
    case "-h":
    case "help":
      showHelp();
      break;

    case "--version":
    case "-v":
      console.log(VERSION);
      break;

    default:
      // If it looks like a URL or plain text, treat as implicit generate
      if (command.startsWith("-")) {
        console.log(`Unknown command: ${command}`);
        console.log(`Run ${BOLD}qrdx --help${RESET} for usage.`);
      } else {
        showLogo();
        console.log();
        await runGenerate(args);
      }
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\x1b[38;5;203m✗ ${msg}${RESET}`);
  process.exit(1);
});
