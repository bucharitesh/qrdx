// Copies the scanner's strings from the website's catalogs
// (apps/app/messages) into src/generated/messages, English filling any gap,
// and the decoder's WebAssembly into public/, so the app reads images
// offline. Runs before every build.
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const web = path.resolve(root, "../app");
const out = path.join(root, "src/generated/messages");

/** The site's languages (packages/i18n/config.ts). */
export const LOCALES = [
  "en",
  "es",
  "pt-BR",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh-Hans",
  "id",
  "hi",
];

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function merge(base, over) {
  const result = { ...base };
  for (const [key, value] of Object.entries(over ?? {})) {
    result[key] =
      isObject(value) && isObject(base?.[key])
        ? merge(base[key], value)
        : value;
  }
  return result;
}

function pick(catalog) {
  return {
    scanner: catalog.scanner,
    scan: { app: catalog.scan?.app },
    scannerApp: catalog.scannerApp,
  };
}

const read = (locale) =>
  JSON.parse(
    readFileSync(path.join(web, "messages", `${locale}.json`), "utf8")
  );

mkdirSync(out, { recursive: true });
const english = pick(read("en"));
for (const locale of LOCALES) {
  const messages =
    locale === "en" ? english : merge(english, pick(read(locale)));
  writeFileSync(
    path.join(out, `${locale}.json`),
    `${JSON.stringify(messages)}\n`
  );
}

// barcode-detector's ZXing reader, the version the website loads from its CDN.
const detector = realpathSync(path.join(web, "node_modules/barcode-detector"));
const zxing = createRequire(path.join(detector, "package.json"));
const wasm = zxing.resolve("zxing-wasm/reader/zxing_reader.wasm");
mkdirSync(path.join(root, "public"), { recursive: true });
copyFileSync(wasm, path.join(root, "public/zxing_reader.wasm"));
console.log(
  `messages: ${LOCALES.length} languages; decoder: ${path.basename(wasm)}`
);
