/** biome-ignore-all lint/style/noMagicNumbers: character codes */
/**
 * How a prop becomes an attribute, the way React DOM's server renderer writes
 * it (react-dom 19, `pushAttribute` in ReactFizzConfigDOM): the same names
 * (`fillRule` → `fill-rule`, `className` → `class`), the same values (style
 * objects, URLs, booleans) and the same props left out (event handlers,
 * functions, `ref`). `renderToString`, `renderToDOM` and `toHyperscript` all
 * use it, so markup, DOM nodes and React agree byte for byte.
 *
 * Ported from React (MIT License, Copyright (c) Meta Platforms, Inc. and
 * affiliates).
 */

/** camelCase props written under another name (React's `aliases`). */
const ALIASES = new Map<string, string>([
  ["acceptCharset", "accept-charset"],
  ["htmlFor", "for"],
  ["httpEquiv", "http-equiv"],
  ["crossOrigin", "crossorigin"],
  ["accentHeight", "accent-height"],
  ["alignmentBaseline", "alignment-baseline"],
  ["arabicForm", "arabic-form"],
  ["baselineShift", "baseline-shift"],
  ["capHeight", "cap-height"],
  ["clipPath", "clip-path"],
  ["clipRule", "clip-rule"],
  ["colorInterpolation", "color-interpolation"],
  ["colorInterpolationFilters", "color-interpolation-filters"],
  ["colorProfile", "color-profile"],
  ["colorRendering", "color-rendering"],
  ["dominantBaseline", "dominant-baseline"],
  ["enableBackground", "enable-background"],
  ["fillOpacity", "fill-opacity"],
  ["fillRule", "fill-rule"],
  ["floodColor", "flood-color"],
  ["floodOpacity", "flood-opacity"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontSizeAdjust", "font-size-adjust"],
  ["fontStretch", "font-stretch"],
  ["fontStyle", "font-style"],
  ["fontVariant", "font-variant"],
  ["fontWeight", "font-weight"],
  ["glyphName", "glyph-name"],
  ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
  ["glyphOrientationVertical", "glyph-orientation-vertical"],
  ["horizAdvX", "horiz-adv-x"],
  ["horizOriginX", "horiz-origin-x"],
  ["imageRendering", "image-rendering"],
  ["letterSpacing", "letter-spacing"],
  ["lightingColor", "lighting-color"],
  ["markerEnd", "marker-end"],
  ["markerMid", "marker-mid"],
  ["markerStart", "marker-start"],
  ["maskType", "mask-type"],
  ["overlinePosition", "overline-position"],
  ["overlineThickness", "overline-thickness"],
  ["paintOrder", "paint-order"],
  ["panose-1", "panose-1"],
  ["pointerEvents", "pointer-events"],
  ["renderingIntent", "rendering-intent"],
  ["shapeRendering", "shape-rendering"],
  ["stopColor", "stop-color"],
  ["stopOpacity", "stop-opacity"],
  ["strikethroughPosition", "strikethrough-position"],
  ["strikethroughThickness", "strikethrough-thickness"],
  ["strokeDasharray", "stroke-dasharray"],
  ["strokeDashoffset", "stroke-dashoffset"],
  ["strokeLinecap", "stroke-linecap"],
  ["strokeLinejoin", "stroke-linejoin"],
  ["strokeMiterlimit", "stroke-miterlimit"],
  ["strokeOpacity", "stroke-opacity"],
  ["strokeWidth", "stroke-width"],
  ["textAnchor", "text-anchor"],
  ["textDecoration", "text-decoration"],
  ["textRendering", "text-rendering"],
  ["transformOrigin", "transform-origin"],
  ["underlinePosition", "underline-position"],
  ["underlineThickness", "underline-thickness"],
  ["unicodeBidi", "unicode-bidi"],
  ["unicodeRange", "unicode-range"],
  ["unitsPerEm", "units-per-em"],
  ["vAlphabetic", "v-alphabetic"],
  ["vHanging", "v-hanging"],
  ["vIdeographic", "v-ideographic"],
  ["vMathematical", "v-mathematical"],
  ["vectorEffect", "vector-effect"],
  ["vertAdvY", "vert-adv-y"],
  ["vertOriginX", "vert-origin-x"],
  ["vertOriginY", "vert-origin-y"],
  ["wordSpacing", "word-spacing"],
  ["writingMode", "writing-mode"],
  ["xmlnsXlink", "xmlns:xlink"],
  ["xHeight", "x-height"],
]);

/** String attributes React renames (and writes only for non-booleans). */
const STRING_ATTRIBUTES = new Map<string, string>([
  ["className", "class"],
  ["tabIndex", "tabindex"],
  ["dir", "dir"],
  ["role", "role"],
  ["viewBox", "viewBox"],
  ["width", "width"],
  ["height", "height"],
  ["xlinkActuate", "xlink:actuate"],
  ["xlinkArcrole", "xlink:arcrole"],
  ["xlinkRole", "xlink:role"],
  ["xlinkShow", "xlink:show"],
  ["xlinkTitle", "xlink:title"],
  ["xlinkType", "xlink:type"],
  ["xmlBase", "xml:base"],
  ["xmlLang", "xml:lang"],
  ["xmlSpace", "xml:space"],
]);

/** Props that are never attributes. */
const SKIPPED = new Set([
  "children",
  "dangerouslySetInnerHTML",
  "key",
  "defaultValue",
  "defaultChecked",
  "innerHTML",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
  "ref",
]);

/** Written as `name=""` when truthy, left out otherwise. */
const BOOLEAN = new Set([
  "inert",
  "allowFullScreen",
  "async",
  "autoPlay",
  "controls",
  "credentialless",
  "default",
  "defer",
  "disabled",
  "disablePictureInPicture",
  "disableRemotePlayback",
  "formNoValidate",
  "hidden",
  "loop",
  "noModule",
  "noValidate",
  "open",
  "playsInline",
  "readOnly",
  "required",
  "reversed",
  "scoped",
  "seamless",
  "itemScope",
]);

/** Booleans React writes lower-cased (`autoFocus` → `autofocus=""`). */
const LOWERCASE_BOOLEAN = new Set(["autoFocus", "multiple", "muted"]);

/** Written as their string form, booleans included ("true"/"false"). */
const BOOLEANISH_STRING = new Set([
  "contentEditable",
  "spellCheck",
  "draggable",
  "value",
  "autoReverse",
  "externalResourcesRequired",
  "focusable",
  "preserveAlpha",
]);

/** CSS properties whose numbers take no `px` (React's `unitlessNumbers`). */
const UNITLESS = new Set(
  "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
    " "
  )
);

// React's VALID_ATTRIBUTE_NAME_REGEX (XML name characters), written as a
// string so the ranges stay readable escapes.
const NAME_START =
  ":A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
const VALID_ATTRIBUTE_NAME = new RegExp(
  `^[${NAME_START}][${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`
);

/** Element names React accepts. */
export const VALID_TAG = /^[a-zA-Z][a-zA-Z:_.\-\d]*$/;

const JAVASCRIPT_URL =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: React's pattern
  /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

const BLOCKED_URL =
  "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";

const sanitizeURL = (url: string) =>
  JAVASCRIPT_URL.test(url) ? BLOCKED_URL : url;

/** HTML elements that never have children (`<img/>`). */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const ESCAPED = /["'&<>]/;

/** Escapes `"&'<>` exactly as React does (`'` → `&#x27;`). */
export function escapeText(value: string): string {
  if (!ESCAPED.test(value)) {
    return value;
  }
  let out = "";
  let last = 0;
  for (let index = 0; index < value.length; index++) {
    let entity: string;
    switch (value.charCodeAt(index)) {
      case 34:
        entity = "&quot;";
        break;
      case 38:
        entity = "&amp;";
        break;
      case 39:
        entity = "&#x27;";
        break;
      case 60:
        entity = "&lt;";
        break;
      case 62:
        entity = "&gt;";
        break;
      default:
        continue;
    }
    out += value.slice(last, index) + entity;
    last = index + 1;
  }
  return out + value.slice(last);
}

const isDropped = (value: unknown) =>
  typeof value === "function" || typeof value === "symbol";

const hyphenated = new Map<string, string>();
const hyphenate = (name: string) => {
  let css = hyphenated.get(name);
  if (css === undefined) {
    css = name
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^ms-/, "-ms-");
    hyphenated.set(name, css);
  }
  return css;
};

/**
 * A style object as CSS text (`{ marginTop: 4 }` → `margin-top:4px`), as
 * React writes it. A string is taken as CSS text already (React itself
 * refuses one).
 */
export function styleText(style: unknown): string {
  if (typeof style === "string") {
    return style;
  }
  if (typeof style !== "object" || style === null) {
    return "";
  }
  let css = "";
  for (const name of Object.keys(style)) {
    const value = (style as Record<string, unknown>)[name];
    if (
      value === null ||
      value === undefined ||
      typeof value === "boolean" ||
      value === ""
    ) {
      continue;
    }
    let declaration: string;
    if (name.startsWith("--")) {
      declaration = `${name}:${`${value}`.trim()}`;
    } else {
      const text =
        typeof value === "number"
          ? value === 0 || UNITLESS.has(name)
            ? `${value}`
            : `${value}px`
          : `${value}`.trim();
      declaration = `${hyphenate(name)}:${text}`;
    }
    css = css ? `${css};${declaration}` : declaration;
  }
  return css;
}

/**
 * The attribute a prop is written as, with its unescaped value, or null when
 * React leaves it out.
 */
export function toAttribute(
  prop: string,
  value: unknown
): { name: string; value: string } | null {
  if (value === null || value === undefined || SKIPPED.has(prop)) {
    return null;
  }
  const renamed = STRING_ATTRIBUTES.get(prop);
  if (renamed !== undefined) {
    return isDropped(value) || typeof value === "boolean"
      ? null
      : { name: renamed, value: `${value}` };
  }
  switch (prop) {
    case "style": {
      const css = styleText(value);
      return css ? { name: "style", value: css } : null;
    }
    case "src":
    case "href":
    case "action":
    case "formAction":
    case "xlinkHref":
      if ((prop === "src" || prop === "href") && value === "") {
        return null;
      }
      if (isDropped(value) || typeof value === "boolean") {
        return null;
      }
      return {
        name: prop === "xlinkHref" ? "xlink:href" : prop,
        value: sanitizeURL(`${value}`),
      };
    case "capture":
    case "download":
      if (value === true) {
        return { name: prop, value: "" };
      }
      return value === false || isDropped(value)
        ? null
        : { name: prop, value: `${value}` };
    case "cols":
    case "rows":
    case "size":
    case "span":
      return isDropped(value) ||
        Number.isNaN(Number(value)) ||
        !((value as number) >= 1)
        ? null
        : { name: prop, value: `${value}` };
    case "rowSpan":
    case "start":
      return isDropped(value) || Number.isNaN(Number(value))
        ? null
        : { name: prop, value: `${value}` };
    default:
      break;
  }
  if (LOWERCASE_BOOLEAN.has(prop)) {
    return value && !isDropped(value)
      ? { name: prop.toLowerCase(), value: "" }
      : null;
  }
  if (BOOLEANISH_STRING.has(prop)) {
    return isDropped(value) ? null : { name: prop, value: `${value}` };
  }
  if (BOOLEAN.has(prop)) {
    return value && !isDropped(value) ? { name: prop, value: "" } : null;
  }
  // Event handlers (onClick, onload…) are never written, whatever the value
  if (
    prop.length > 2 &&
    (prop[0] === "o" || prop[0] === "O") &&
    (prop[1] === "n" || prop[1] === "N")
  ) {
    return null;
  }
  const name = ALIASES.get(prop) ?? prop;
  if (!VALID_ATTRIBUTE_NAME.test(name) || isDropped(value)) {
    return null;
  }
  if (typeof value === "boolean") {
    const prefix = name.toLowerCase().slice(0, 5);
    if (prefix !== "data-" && prefix !== "aria-") {
      return null;
    }
  }
  return { name, value: `${value}` };
}
