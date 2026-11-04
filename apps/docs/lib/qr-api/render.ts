import "server-only";

import { svgToEPS } from "qrdx";
import { communityItemStyle } from "@/lib/community/api";
import { presetLogoIcon } from "@/lib/community/public-style";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import {
  DesignTooLongError,
  renderDesignPng,
  renderDesignSvg,
} from "@/lib/qr-design/score";
import { QR_DEFAULTS, QrDataTooLongError } from "@/lib/qr-render";
import type { ActiveScope } from "@/lib/scope";
import type { ThemeStyles } from "@/types/theme";
import { resolveLogo } from "./logo";
import { type ApiStyle, themeFieldsOf } from "./style";

// Styled renders for GET /v1/qr and the MCP generate_qr_code tool: the
// editor's style (lib/qr-api/style.ts), optionally on top of a community
// item, drawn by the same engine props as the editor (lib/qr-design/props.ts)
// and rasterized by resvg like every other server render. Requests that use
// only the original parameters keep the original renderer (lib/qr-render.ts)
// so their bytes never change.

/** The original flat parameters, as ThemeStyles fields. */
export interface FlatStyle {
  fg?: string;
  bg?: string;
  eyeColor?: string;
  dotColor?: string;
  body?: ThemeStyles["bodyPattern"];
  eye?: ThemeStyles["cornerEyePattern"];
  dot?: ThemeStyles["cornerEyeDotPattern"];
  level?: ThemeStyles["level"];
  margin?: number;
  template?: string;
}

const hex = (color: string) =>
  color.startsWith("#") ? color.toLowerCase() : `#${color.toLowerCase()}`;

/** Flat parameters that were given, as style fields. */
export function flatToStyle(flat: FlatStyle): ThemeStyles {
  const style: ThemeStyles = {};
  if (flat.fg !== undefined) style.fgColor = hex(flat.fg);
  if (flat.bg !== undefined) style.bgColor = hex(flat.bg);
  if (flat.eyeColor !== undefined) style.eyeColor = hex(flat.eyeColor);
  if (flat.dotColor !== undefined) style.dotColor = hex(flat.dotColor);
  if (flat.body !== undefined) style.bodyPattern = flat.body;
  if (flat.eye !== undefined) style.cornerEyePattern = flat.eye;
  if (flat.dot !== undefined) style.cornerEyeDotPattern = flat.dot;
  if (flat.level !== undefined) style.level = flat.level;
  if (flat.margin !== undefined) style.margin = flat.margin;
  if (flat.template !== undefined) style.templateId = flat.template;
  return style;
}

/** The plain code everything is drawn on: the image API's defaults. */
export const BASE_STYLE: ThemeStyles = {
  fgColor: QR_DEFAULTS.fg,
  bgColor: QR_DEFAULTS.bg,
  bodyPattern: QR_DEFAULTS.body,
  cornerEyePattern: QR_DEFAULTS.eye,
  cornerEyeDotPattern: QR_DEFAULTS.dot,
  level: QR_DEFAULTS.level,
  margin: QR_DEFAULTS.margin,
};

export interface RenderRequest {
  data: string;
  size: number;
  /** A community item id (frame:… or theme:…) */
  item?: string;
  /** The `style` value, validated by parseApiStyle */
  style?: ApiStyle;
  /** Flat parameters the caller set (they win over item and style) */
  flat?: FlatStyle;
  /** The API key's workspace, for logoFileId; null without a key */
  scope: ActiveScope | null;
}

export interface ResolvedRender {
  data: string;
  size: number;
  style: ThemeStyles;
  /** The logo drawn, a data URL QRdx built or read */
  logo?: string;
  /** Where the logo came from */
  logoSource: "none" | "icon" | "file" | "item";
  /** The community item used, as its id */
  itemId?: string;
}

/**
 * Layers, lowest first: the plain code, the community item, `style`, then
 * the flat parameters. The logo comes from `style` (logoIcon or
 * logoFileId), else the item's quick icon; `showLogo: false` hides it.
 */
export async function resolveRender(
  request: RenderRequest,
): Promise<ResolvedRender> {
  const item = request.item ? await communityItemStyle(request.item) : null;
  const fromStyle = request.style ? themeFieldsOf(request.style) : {};
  const { customLogo: itemLogo, art: _art, ...itemStyle } = item?.style ?? {};
  const style: ThemeStyles = {
    ...BASE_STYLE,
    ...itemStyle,
    ...fromStyle,
    ...flatToStyle(request.flat ?? {}),
  };

  let logo: string | undefined;
  let logoSource: ResolvedRender["logoSource"] = "none";
  const requested = request.style
    ? await resolveLogo(request.style, request.scope, "render")
    : null;
  if (requested?.drawn) {
    logo = requested.drawn;
    logoSource = request.style?.logoFileId ? "file" : "icon";
  } else {
    // The item's quick icon, drawn again from its id: never a stored image.
    const icon = presetLogoIcon(itemLogo);
    if (icon && itemStyle.showLogo !== false) {
      logo = logoIconDataUrl(icon);
      logoSource = "item";
    }
  }
  if (fromStyle.showLogo === false) {
    logo = undefined;
    logoSource = "none";
  }
  style.showLogo = Boolean(logo);

  return {
    data: request.data,
    size: request.size,
    style,
    ...(logo ? { logo } : {}),
    logoSource,
    ...(item ? { itemId: item.id } : {}),
  };
}

/**
 * Nothing scores these renders first, so a logo that covers more than 7% of
 * the code raises error correction to H (the engine's autoLevel).
 */
const AUTO_LEVEL = { autoLevel: true };

function tooLong(style: ThemeStyles): QrDataTooLongError {
  return new QrDataTooLongError(style.level ?? QR_DEFAULTS.level);
}

/** SVG markup; frames add to `size`. */
export function renderStyledSvg(render: ResolvedRender): string {
  try {
    return renderDesignSvg(
      render.data,
      render.style,
      render.size,
      render.logo,
      AUTO_LEVEL,
    );
  } catch (error) {
    if (error instanceof DesignTooLongError) throw tooLong(render.style);
    throw error;
  }
}

/** PNG bytes, the code `size` px wide (frames add to it). */
export async function renderStyledPng(
  render: ResolvedRender,
): Promise<Uint8Array> {
  try {
    return await renderDesignPng(
      render.data,
      render.style,
      render.size,
      render.logo,
      AUTO_LEVEL,
    );
  } catch (error) {
    if (error instanceof DesignTooLongError) throw tooLong(render.style);
    throw error;
  }
}

/** Vector EPS, the code `size` points wide (frames add to it). */
export async function renderStyledEps(render: ResolvedRender): Promise<string> {
  return svgToEPS(renderStyledSvg(render));
}
