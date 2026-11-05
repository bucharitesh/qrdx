/** biome-ignore-all lint/style/noMagicNumbers: error correction budget */
// How much of a code a center logo may hide, counted the way decoders fail:
// every codeword with a module under the logo (or its cleared space) is one
// error in its Reed–Solomon block, and each block repairs only so many
// (codeword-map.ts). Area alone misjudges small codes: at H version 2 a
// 9×9 logo puts 16 damaged codewords into a block that repairs 14.
//
// The budget is the one the Logo QR badge uses (art.tsx): 60% of each
// block's repair capacity, which leaves room for print and camera errors.
import type { ErrorLevel, ImageSettings, QRCodeShape } from "../types";
import qrcodegen from "./codegen";
import { damagedCodewords, getCodewordMap } from "./codeword-map";
import { ERROR_LEVEL_MAP } from "./constants";
import { getLayoutMargin } from "./qr-shape";
import { getImageSettings } from "./utils";

/** Share of each block's repair capacity a logo may use (as the badge). */
export const LOGO_EC_SAFETY = 0.6;

const LEVELS: readonly ErrorLevel[] = ["L", "M", "Q", "H"];

export interface LogoBlockDamage {
  /** Codewords the logo spoils in its worst block */
  worst: number;
  /** Codewords that block can repair (ISO/IEC 18004 Table 9) */
  correctable: number;
  /** Most the logo may spoil per block: correctable × LOGO_EC_SAFETY */
  budget: number;
  /** The level the symbol is really drawn at (qrcodegen may boost it) */
  level: ErrorLevel;
  version: number;
}

export interface LogoCode {
  value: string;
  /** Pixels across the artwork the logo's pixels are laid out in */
  size: number;
  margin: number;
  level: ErrorLevel;
  shape?: QRCodeShape;
}

interface BudgetContext {
  code: LogoCode;
  cells: boolean[][];
  layoutMargin: number;
  map: ReturnType<typeof getCodewordMap>;
  level: ErrorLevel;
  version: number;
}

/** The symbol and its codeword map, encoded once per code and level. */
function budgetContext(code: LogoCode): BudgetContext {
  const qr = qrcodegen.QrCode.encodeText(
    code.value,
    ERROR_LEVEL_MAP[code.level]
  );
  // qrcodegen raises the level when the data fits anyway: count with that
  const level = LEVELS[qr.errorCorrectionLevel.ordinal] ?? code.level;
  return {
    code,
    cells: qr.getModules(),
    layoutMargin: getLayoutMargin(qr.size, code.margin, code.shape),
    map: getCodewordMap(qr.version, level),
    level,
    version: qr.version,
  };
}

function damageIn(
  context: BudgetContext,
  imageSettings: ImageSettings
): LogoBlockDamage | null {
  const { cells, map } = context;
  const n = cells.length;
  const settings = getImageSettings(
    cells,
    context.code.size,
    context.layoutMargin,
    imageSettings
  );
  if (!settings) {
    return null;
  }
  const box = settings.excavation ?? {
    x: Math.floor(settings.x),
    y: Math.floor(settings.y),
    w: Math.ceil(settings.x + settings.w) - Math.floor(settings.x),
    h: Math.ceil(settings.y + settings.h) - Math.floor(settings.y),
  };
  const modules: number[] = [];
  for (let y = Math.max(0, box.y); y < Math.min(n, box.y + box.h); y++) {
    for (let x = Math.max(0, box.x); x < Math.min(n, box.x + box.w); x++) {
      modules.push(y * n + x);
    }
  }
  const counts = damagedCodewords(map, modules);
  return {
    worst: Math.max(0, ...counts),
    correctable: map.correctable,
    budget: Math.floor(map.correctable * LOGO_EC_SAFETY),
    level: context.level,
    version: context.version,
  };
}

/**
 * Codewords `imageSettings` spoils per Reed–Solomon block of `code`: every
 * codeword with a module inside the cleared area (or under the logo when
 * nothing is cleared). Null when the logo falls outside the code.
 */
export function getLogoBlockDamage(
  code: LogoCode,
  imageSettings: ImageSettings
): LogoBlockDamage | null {
  return damageIn(budgetContext(code), imageSettings);
}

const within = (damage: LogoBlockDamage | null) =>
  !damage || damage.worst <= damage.budget;

/** True when the logo stays inside every block's budget at `code.level`. */
export function logoFitsBudget(
  code: LogoCode,
  imageSettings: ImageSettings
): boolean {
  return within(getLogoBlockDamage(code, imageSettings));
}

/**
 * Largest logo width (pixels, up to `requested`) for which `layout(width)`
 * fits the budget at every one of `levels` (with autoLevel the code may be
 * drawn at its own level or at H). 0 when no width fits.
 */
export function fitLogoWidth(
  code: Omit<LogoCode, "level">,
  levels: readonly ErrorLevel[],
  requested: number,
  layout: (width: number) => ImageSettings
): number {
  const contexts = levels.map((level) => budgetContext({ ...code, level }));
  const fits = (width: number) => {
    const settings = layout(width);
    return contexts.every((context) => within(damageIn(context, settings)));
  };
  if (fits(requested)) {
    return requested;
  }
  // Half-percent steps of the code's width: fine enough to see on a slider
  const step = code.size * 0.005;
  for (let width = requested - step; width > 0; width -= step) {
    if (fits(width)) {
      return width;
    }
  }
  return 0;
}
