// qrdx/element: the <qrdx-code> custom element, a QR code in any page or
// framework. The class draws through qrdx/core into its shadow root;
// `defineQRdxCode()` registers it (importing this module never does), and
// `toQRdxCodeHTML()` writes server markup with a declarative shadow root, so
// the code shows before any script runs.

import {
  createQRCodeTree,
  DEFAULT_SIZE,
  type DownloadFormat,
  downloadQRCode,
  getQRCodeDataUrl,
  type QRProps,
  type QRSVGOptions,
  renderToDOM,
  renderToString,
} from "./core";
import type { QRCodeDownloadOptions, QRCodeExportOptions } from "./vanilla-api";

/** What a `<qrdx-code>` draws with: `QRSVGOptions`, with `value` optional. */
export type QRdxCodeOptions = Partial<QRSVGOptions>;

/** The element's properties (attributes write the simple ones too). */
export interface QRdxCodeProperties {
  value?: QRProps["value"];
  size?: QRProps["size"];
  level?: QRProps["level"];
  fgColor?: QRProps["fgColor"];
  bgColor?: QRProps["bgColor"];
  eyeColor?: QRProps["eyeColor"];
  dotColor?: QRProps["dotColor"];
  bodyPattern?: QRProps["bodyPattern"];
  cornerEyePattern?: QRProps["cornerEyePattern"];
  cornerEyeDotPattern?: QRProps["cornerEyeDotPattern"];
  margin?: QRProps["margin"];
  templateId?: QRProps["templateId"];
  moduleScale?: QRProps["moduleScale"];
  autoLevel?: QRProps["autoLevel"];
  shape?: QRProps["shape"];
  frame?: QRProps["frame"];
  imageSettings?: QRProps["imageSettings"];
  eyeColors?: QRProps["eyeColors"];
  art?: QRProps["art"];
  customTemplate?: QRProps["customTemplate"];
  customProps?: QRProps["customProps"];
  /** Every option at once; the named properties and attributes win over it */
  props?: QRdxCodeOptions;
  /** What screen readers announce (default "QR code") */
  label?: string;
}

/** The element's attributes, as JSX props (React 19 and Preact set them as attributes). */
export interface QRdxCodeAttributes {
  value?: string;
  size?: number | string;
  level?: string;
  "fg-color"?: string;
  "bg-color"?: string;
  "eye-color"?: string;
  "dot-color"?: string;
  "body-pattern"?: string;
  "corner-eye-pattern"?: string;
  "corner-eye-dot-pattern"?: string;
  margin?: number | string;
  "template-id"?: string;
  "module-scale"?: number | string;
  "auto-level"?: boolean | string;
  shape?: string;
  label?: string;
  /** Options as JSON, for markup without script */
  props?: string;
}

/**
 * Props for typing `<qrdx-code>` in JSX: the attributes plus the
 * properties (React 19 sets a prop as a property when the element has it).
 */
export type QRdxCodeJSXProps = Omit<QRdxCodeAttributes, "props"> &
  Omit<QRdxCodeProperties, "props"> & {
    props?: QRdxCodeOptions | string;
  };

/** Detail of the `qrdx-error` event. */
export interface QRdxCodeErrorDetail {
  error: unknown;
}

type OptionKey = Exclude<keyof QRdxCodeProperties, "props" | "label">;
type AttributeKind = "string" | "number" | "level" | "boolean";

/** Attributes and the option each one sets. */
const ATTRIBUTES: Record<string, [OptionKey, AttributeKind]> = {
  value: ["value", "string"],
  size: ["size", "number"],
  level: ["level", "level"],
  "fg-color": ["fgColor", "string"],
  "bg-color": ["bgColor", "string"],
  "eye-color": ["eyeColor", "string"],
  "dot-color": ["dotColor", "string"],
  "body-pattern": ["bodyPattern", "string"],
  "corner-eye-pattern": ["cornerEyePattern", "string"],
  "corner-eye-dot-pattern": ["cornerEyeDotPattern", "string"],
  margin: ["margin", "number"],
  "template-id": ["templateId", "string"],
  "module-scale": ["moduleScale", "number"],
  "auto-level": ["autoLevel", "boolean"],
  shape: ["shape", "string"],
};

/** Options that are properties of the element. */
const OPTION_KEYS: readonly OptionKey[] = [
  ...Object.values(ATTRIBUTES).map(([key]) => key),
  "frame",
  "imageSettings",
  "eyeColors",
  "art",
  "customTemplate",
  "customProps",
];

const LEVELS = new Set(["L", "M", "Q", "H"]);
const DEFAULT_LABEL = "QR code";
const ELEMENT_MARK: unique symbol = Symbol.for("qrdx.code-element");
const CUSTOM_ELEMENT_NAME = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;

/** The shadow root's stylesheet. */
export const QRDX_CODE_STYLES =
  ":host{display:inline-block}:host([hidden]){display:none}svg{display:block;max-width:100%;height:auto}";

function parseAttribute(kind: AttributeKind, raw: string): unknown {
  switch (kind) {
    case "number": {
      const number = raw.trim() === "" ? Number.NaN : Number(raw);
      return Number.isFinite(number) ? number : undefined;
    }
    case "level": {
      const level = raw.trim().toUpperCase();
      return LEVELS.has(level) ? level : undefined;
    }
    case "boolean":
      return raw !== "false";
    default:
      return raw;
  }
}

/** Options without the keys set to undefined or null. */
function compact(options: Record<string, unknown>): QRdxCodeOptions {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(options)) {
    if (options[key] !== undefined && options[key] !== null) {
      result[key] = options[key];
    }
  }
  return result as QRdxCodeOptions;
}

/** The label screen readers get: never the encoded value, which may be private. */
function labelFor(options: QRdxCodeOptions, label: string | undefined) {
  const fromOptions = options["aria-label"];
  return (
    label?.trim() ||
    (typeof fromOptions === "string" && fromOptions.trim()) ||
    DEFAULT_LABEL
  );
}

/** The options the shadow root's `<svg>` is drawn with. */
function drawnOptions(
  options: QRSVGOptions,
  label: string | undefined
): QRSVGOptions {
  return {
    ...options,
    part: "svg",
    role: "img",
    "aria-label": labelFor(options, label),
  };
}

const exportSize = (options: QRSVGOptions, size?: number) => {
  const side = size ?? options.size ?? DEFAULT_SIZE;
  return { width: side, height: side };
};

// Servers have no HTMLElement; the class still loads there, so importing
// qrdx/element during server rendering is safe.
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === "undefined"
    ? (class {} as unknown as typeof HTMLElement)
    : HTMLElement;

/**
 * `<qrdx-code>`: a QR code drawn into the element's shadow root. Simple
 * options are attributes (`value`, `size`, `level`, `fg-color`,
 * `body-pattern`…); object options (`frame`, gradients, `imageSettings`) are
 * properties, or all at once in `props`. Changes are batched and redrawn
 * once, in a microtask. Style the code with `qrdx-code::part(svg)`.
 */
export class QRdxCodeElement extends BaseElement {
  static readonly observedAttributes = [
    ...Object.keys(ATTRIBUTES),
    "label",
    "props",
  ];

  /** Marks qrdx's element class, across copies of the package. */
  static readonly [ELEMENT_MARK] = true;

  declare value: QRdxCodeProperties["value"];
  declare size: QRdxCodeProperties["size"];
  declare level: QRdxCodeProperties["level"];
  declare fgColor: QRdxCodeProperties["fgColor"];
  declare bgColor: QRdxCodeProperties["bgColor"];
  declare eyeColor: QRdxCodeProperties["eyeColor"];
  declare dotColor: QRdxCodeProperties["dotColor"];
  declare bodyPattern: QRdxCodeProperties["bodyPattern"];
  declare cornerEyePattern: QRdxCodeProperties["cornerEyePattern"];
  declare cornerEyeDotPattern: QRdxCodeProperties["cornerEyeDotPattern"];
  declare margin: QRdxCodeProperties["margin"];
  declare templateId: QRdxCodeProperties["templateId"];
  declare moduleScale: QRdxCodeProperties["moduleScale"];
  declare autoLevel: QRdxCodeProperties["autoLevel"];
  declare shape: QRdxCodeProperties["shape"];
  declare frame: QRdxCodeProperties["frame"];
  declare imageSettings: QRdxCodeProperties["imageSettings"];
  declare eyeColors: QRdxCodeProperties["eyeColors"];
  declare art: QRdxCodeProperties["art"];
  declare customTemplate: QRdxCodeProperties["customTemplate"];
  declare customProps: QRdxCodeProperties["customProps"];

  readonly #root: ShadowRoot;
  readonly #values: Partial<Record<OptionKey, unknown>> = {};
  #props: QRdxCodeOptions | undefined;
  #label: string | undefined;
  #svg: SVGSVGElement | null = null;
  #markup = "";
  #dirty = true;
  #queued = false;

  static {
    for (const key of OPTION_KEYS) {
      Object.defineProperty(QRdxCodeElement.prototype, key, {
        configurable: true,
        enumerable: true,
        get(this: QRdxCodeElement) {
          return this.#values[key];
        },
        set(this: QRdxCodeElement, value: unknown) {
          this.#set(key, value);
        },
      });
    }
  }

  constructor() {
    super();
    // A server-rendered (declarative) shadow root is reused, and its <svg>
    // replaced by the first render.
    this.#root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    let style: HTMLStyleElement | null = null;
    for (const child of Array.from(this.#root.children)) {
      if (child.localName === "style") {
        style = child as HTMLStyleElement;
      } else if (child.localName === "svg") {
        this.#svg = child as SVGSVGElement;
      }
    }
    if (!style) {
      style = this.ownerDocument.createElement("style");
      style.textContent = QRDX_CODE_STYLES;
      this.#root.prepend(style);
    }
    // A framework may set properties before the element is defined; those
    // shadow the accessors, so run them through the setters instead.
    for (const key of [...OPTION_KEYS, "props", "label"] as const) {
      if (Object.hasOwn(this, key)) {
        const value = this[key as keyof this];
        delete this[key as keyof this];
        (this as Record<string, unknown>)[key] = value;
      }
    }
  }

  connectedCallback(): void {
    if (this.#dirty) {
      this.#render();
    }
  }

  attributeChangedCallback(
    name: string,
    previous: string | null,
    next: string | null
  ): void {
    if (previous === next) {
      return;
    }
    if (name === "label") {
      this.#label = next ?? undefined;
      this.#changed();
      return;
    }
    if (name === "props") {
      this.#setPropsAttribute(next);
      return;
    }
    const entry = ATTRIBUTES[name];
    if (entry) {
      const [key, kind] = entry;
      this.#set(key, next === null ? undefined : parseAttribute(kind, next));
    }
  }

  /** Every option at once; the named properties and attributes win over it. */
  get props(): QRdxCodeOptions | undefined {
    return this.#props;
  }

  set props(props: QRdxCodeOptions | string | null | undefined) {
    if (typeof props === "string") {
      this.#setPropsAttribute(props);
      return;
    }
    this.#props = props ?? undefined;
    this.#changed();
  }

  /** What screen readers announce; the encoded value is never used. */
  get label(): string | undefined {
    return this.#label;
  }

  set label(label: string | null | undefined) {
    this.#label = label ?? undefined;
    this.#changed();
  }

  /** The options the code is drawn with: `props`, then attributes and properties. */
  get options(): QRdxCodeOptions {
    return compact({ ...this.#props, ...this.#values });
  }

  /** The drawn `<svg>` (null without a value). Reading it draws any pending change. */
  get svg(): SVGSVGElement | null {
    if (this.#dirty && this.isConnected) {
      this.#render();
    }
    return this.#svg;
  }

  /** The code's SVG markup, as `toSVGString` from qrdx/core writes it for `options`. */
  toSVGString(): string {
    return renderToString(createQRCodeTree(this.#requireOptions()));
  }

  /** The code as a data URL: "png" (default), "jpg", "webp", "svg", "pdf" or "eps". */
  async toDataURL(
    format: DownloadFormat = "png",
    options: QRCodeExportOptions = {}
  ): Promise<string> {
    const current = this.#requireOptions();
    return await getQRCodeDataUrl(
      current,
      format,
      exportSize(current, options.size),
      { quality: options.quality }
    );
  }

  /** Saves the code as a file (a PNG unless `format` says otherwise). */
  async download(options: QRCodeDownloadOptions = {}): Promise<void> {
    const current = this.#requireOptions();
    return await downloadQRCode(current, {
      format: options.format ?? "png",
      size: exportSize(current, options.size),
      filename: options.filename,
      quality: options.quality,
    });
  }

  #requireOptions(): QRSVGOptions {
    const options = this.options;
    if (!options.value) {
      throw new Error(`qrdx: <${this.localName}> has no value`);
    }
    return options as QRSVGOptions;
  }

  #set(key: OptionKey, value: unknown): void {
    if (value === undefined || value === null) {
      if (!(key in this.#values)) {
        return;
      }
      delete this.#values[key];
    } else {
      if (this.#values[key] === value) {
        return;
      }
      this.#values[key] = value;
    }
    this.#changed();
  }

  #setPropsAttribute(json: string | null): void {
    if (json === null || json.trim() === "") {
      this.props = undefined;
      return;
    }
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("props must be a JSON object");
      }
      this.props = parsed as QRdxCodeOptions;
    } catch (error) {
      this.#report(error);
    }
  }

  /** Marks the code for a redraw in a microtask, once however many changes come. */
  #changed(): void {
    this.#dirty = true;
    if (this.#queued) {
      return;
    }
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.#dirty && this.isConnected) {
        this.#render();
      }
    });
  }

  #render(): void {
    this.#dirty = false;
    const options = this.options;
    if (!options.value) {
      this.#clear();
      return;
    }
    let tree: ReturnType<typeof createQRCodeTree>;
    let markup: string;
    try {
      tree = createQRCodeTree(
        drawnOptions(options as QRSVGOptions, this.#label)
      );
      markup = renderToString(tree);
    } catch (error) {
      this.#clear();
      this.#report(error);
      return;
    }
    if (this.#svg && markup === this.#markup) {
      return;
    }
    const svg = renderToDOM(tree, this.ownerDocument)
      .firstChild as SVGSVGElement;
    if (this.#svg?.parentNode === this.#root) {
      this.#svg.replaceWith(svg);
    } else {
      this.#root.append(svg);
    }
    this.#svg = svg;
    this.#markup = markup;
  }

  #clear(): void {
    this.#svg?.remove();
    this.#svg = null;
    this.#markup = "";
  }

  /** A `qrdx-error` event; logged unless a listener calls preventDefault(). */
  #report(error: unknown): void {
    const event = new CustomEvent<QRdxCodeErrorDetail>("qrdx-error", {
      cancelable: true,
      detail: { error },
    });
    if (this.dispatchEvent(event)) {
      console.error(`qrdx: <${this.localName}> could not draw its code`, error);
    }
  }
}

let defaultTag: string | undefined;

/**
 * Registers `<qrdx-code>` (or `tagName`) and returns its class. Calling it
 * again is safe. Does nothing where there is no `customElements`, such as
 * on a server.
 */
export function defineQRdxCode(tagName = "qrdx-code"): typeof QRdxCodeElement {
  const registry = globalThis.customElements as
    | CustomElementRegistry
    | undefined;
  if (!registry) {
    return QRdxCodeElement;
  }
  const existing = registry.get(tagName);
  if (existing) {
    if (ELEMENT_MARK in existing) {
      return existing as typeof QRdxCodeElement;
    }
    throw new Error(
      `qrdx: <${tagName}> is already defined by another element; pass defineQRdxCode another tag name`
    );
  }
  // A class can be registered under one name only, so other names get a subclass.
  const element =
    defaultTag === undefined
      ? QRdxCodeElement
      : class extends QRdxCodeElement {};
  registry.define(tagName, element);
  defaultTag ??= tagName;
  return element;
}

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Options written as attributes, as `toQRdxCodeHTML` writes them. */
function toAttributes(options: QRdxCodeOptions): {
  attributes: [string, string][];
  rest: Record<string, unknown>;
} {
  const attributes: [string, string][] = [];
  const rest: Record<string, unknown> = { ...options };
  for (const [name, [key, kind]] of Object.entries(ATTRIBUTES)) {
    const value = options[key];
    const fits =
      (kind === "number" && typeof value === "number") ||
      (kind === "boolean" && typeof value === "boolean") ||
      (kind !== "number" && kind !== "boolean" && typeof value === "string");
    if (!fits) {
      continue;
    }
    delete rest[key];
    if (kind === "boolean") {
      if (value) {
        attributes.push([name, ""]);
      }
    } else {
      attributes.push([name, String(value)]);
    }
  }
  return { attributes, rest };
}

/** Options for `toQRdxCodeHTML`. */
export interface QRdxCodeHTMLOptions {
  /** The element's tag name (default "qrdx-code") */
  tagName?: string;
  /** What screen readers announce (default "QR code") */
  label?: string;
}

/**
 * Server markup for a `<qrdx-code>`: the element with its options as
 * attributes (object options as JSON in `props`) and the drawn code in a
 * declarative shadow root, so it shows before any script runs and the
 * element takes over when it's defined. Works without a DOM.
 * `customTemplate` can't be written as markup: set it as a property on the
 * client.
 */
export function toQRdxCodeHTML(
  options: QRSVGOptions,
  { tagName = "qrdx-code", label }: QRdxCodeHTMLOptions = {}
): string {
  if (!CUSTOM_ELEMENT_NAME.test(tagName)) {
    throw new Error(`qrdx: ${tagName} is not a custom element name`);
  }
  const current = compact(options as Record<string, unknown>);
  const { attributes, rest } = toAttributes(current);
  // A template's wrapper is a function, which JSON can't carry
  const { customTemplate: _template, ...serializable } = rest;
  if (label !== undefined) {
    attributes.push(["label", label]);
  }
  if (Object.keys(serializable).length > 0) {
    attributes.push(["props", JSON.stringify(serializable)]);
  }
  const opening = attributes
    .map(([name, value]) =>
      value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`
    )
    .join("");
  const svg = current.value
    ? renderToString(
        createQRCodeTree(drawnOptions(current as QRSVGOptions, label))
      )
    : "";
  return `<${tagName}${opening}><template shadowrootmode="open"><style>${QRDX_CODE_STYLES}</style>${svg}</template></${tagName}>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "qrdx-code": QRdxCodeElement;
  }
}
