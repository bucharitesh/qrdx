/** biome-ignore-all lint/performance/noBarrelFile: the Vue entry re-exports the core */
// qrdx/vue: QR codes for Vue 3. `QRCode` and `QRCodeSVG` draw the core's
// tree (`createQRCodeTree`) as Vue's own elements, through `toHyperscript`,
// so they render on the server with `vue/server-renderer` and hydrate
// without a mismatch, and Vue patches the <svg> in place when props change.
// `useQRCode` is the same code as a composable: the markup, PNG/SVG data URLs
// and downloads. Everything in qrdx/core is re-exported, so one import covers
// a component. Written as a render function (no .vue file), so building it
// needs no Vue compiler. Built as dist/vue.mjs, which imports dist/core.mjs
// and vue.

import {
  type ComputedRef,
  computed,
  type DefineSetupFnComponent,
  defineComponent,
  h,
  isVNode,
  type MaybeRefOrGetter,
  toValue,
  type VNode,
  type VNodeArrayChildren,
  type VNodeChild,
} from "vue";
import {
  createQRCodeTree,
  DEFAULT_SIZE,
  type DownloadFormat,
  downloadQRCode,
  getQRCodeDataUrl,
  type QRCodeProps,
  type QRProps,
  type QRSVGOptions,
  resolveQRCodeProps,
  toHyperscript,
  toSVGString,
} from "./core";
import type { QRCodeDownloadOptions, QRCodeExportOptions } from "./vanilla-api";

export * from "./core";
export type { QRCodeDownloadOptions, QRCodeExportOptions } from "./vanilla-api";

/**
 * `<QRCodeSVG>`'s props: every `QRProps` option. `class`, `style`,
 * `aria-label` and other attributes go on the `<svg>`, listeners too.
 */
export type QRCodeSVGVueProps = Omit<QRProps, "style">;

/**
 * `<QRCode>`'s props: React's `QRCode` props (`QRProps` with `logo`,
 * `logoOptions`, `hideLogo` and `scale`). Attributes go on the `<svg>`.
 */
export type QRCodeVueProps = Omit<QRCodeProps, "style">;

// Runtime prop declarations. Booleans default to undefined, not false, so a
// missing flag draws exactly what the core draws without it, and
// `<QRCode auto-level />` still reads as true. `style` isn't declared: it
// arrives with the other attributes and goes on the <svg>.
const flag = { type: Boolean, default: undefined };

const svgProps = {
  value: { type: String, required: true },
  size: Number,
  level: null,
  bgColor: null,
  fgColor: null,
  eyeColor: null,
  dotColor: null,
  bodyPattern: null,
  cornerEyePattern: null,
  cornerEyeDotPattern: null,
  margin: Number,
  imageSettings: null,
  isOGContext: flag,
  templateId: null,
  customTemplate: null,
  customProps: null,
  frame: null,
  art: null,
  eyeColors: null,
  moduleScale: Number,
  autoLevel: flag,
  shape: null,
  frameLabelMarkers: flag,
  partMarkers: flag,
} as const;

const codeProps = {
  ...svgProps,
  logo: String,
  logoOptions: null,
  hideLogo: flag,
  scale: Number,
} as const;

// Vue's test for a listener prop (onClick, onUpdate:x…)
const isListener = (key: string) => /^on[^a-z]/.test(key);

/**
 * The code as Vue elements. Attributes join the options, so the core puts
 * them where React would (on the frame's outer <svg> when there is a frame)
 * and drops listeners from the markup; listeners go on the root element.
 */
function draw(
  options: QRSVGOptions,
  attrs: Record<string, unknown>
): VNodeChild {
  const nodes = toHyperscript<VNode>(
    createQRCodeTree({ ...options, ...attrs }),
    (type, attributes, children, key) =>
      h(type, key === null ? attributes : { ...attributes, key }, children)
  );
  let listeners: Record<string, unknown> | null = null;
  for (const key of Object.keys(attrs)) {
    if (isListener(key)) {
      listeners ??= {};
      listeners[key] = attrs[key];
    }
  }
  const [root] = nodes;
  if (listeners && isVNode(root)) {
    // Spread into the root's own props: cloneVNode would merge them with
    // mergeProps, which rewrites the core's CSS text for `style`
    nodes[0] = h(
      root.type as string,
      { ...root.props, ...listeners },
      root.children as VNodeArrayChildren
    );
  }
  return nodes.length === 1 ? nodes[0] : nodes;
}

/**
 * A QR code with every styling option, drawn as SVG: the Vue version of
 * React's `QRCodeSVG`, with the same props and the same markup.
 *
 * @example
 * <QRCodeSVG value="https://qrdx.dev" :size="256" body-pattern="rounded" />
 */
export const QRCodeSVG: DefineSetupFnComponent<QRCodeSVGVueProps> =
  defineComponent(
    (props: QRCodeSVGVueProps, { attrs }) =>
      () =>
        draw(props, attrs),
    { name: "QRCodeSVG", inheritAttrs: false, props: svgProps }
  );

/**
 * A QR code with the simpler logo API (`logo`, `logoOptions`, `hideLogo`,
 * `scale`): the Vue version of React's `QRCode`, with the same props and the
 * same markup. Attributes such as `class` or `aria-label` go on the `<svg>`.
 *
 * @example
 * <QRCode value="https://qrdx.dev" logo="/logo.png" :size="256" />
 */
export const QRCode: DefineSetupFnComponent<QRCodeVueProps> = defineComponent(
  (props: QRCodeVueProps, { attrs }) => {
    // The logo layout only reruns when a prop it reads changes
    const options = computed(() => resolveQRCodeProps(props));
    return () => draw(options.value, attrs);
  },
  { name: "QRCode", inheritAttrs: false, props: codeProps }
);

/** What `useQRCode` returns. */
export interface UseQRCodeReturn {
  /** The options the code is drawn with: `<QRCode>`'s props resolved */
  readonly options: ComputedRef<QRSVGOptions>;
  /** The code's SVG markup, as `toSVGString` writes it; follows the props */
  readonly svg: ComputedRef<string>;
  /** The code as a data URL: "png" (default), "jpg", "webp", "svg", "pdf" or "eps" */
  toDataURL(
    format?: DownloadFormat,
    options?: QRCodeExportOptions
  ): Promise<string>;
  /** Saves the code as a file (a PNG unless `format` says otherwise) */
  download(options?: QRCodeDownloadOptions): Promise<void>;
}

const exportSize = (options: QRSVGOptions, size?: number) => {
  const side = size ?? options.size ?? DEFAULT_SIZE;
  return { width: side, height: side };
};

/**
 * A QR code as a composable: takes `<QRCode>`'s props (a plain object, a
 * ref, a reactive object or a getter) and returns its SVG markup, which
 * follows the props, plus `toDataURL` and `download`. The markup works in
 * SSR; PNG, JPG and WebP need a browser.
 *
 * @example
 * const url = ref("https://qrdx.dev");
 * const { svg, download } = useQRCode(() => ({ value: url.value, size: 256 }));
 */
export function useQRCode(
  props: MaybeRefOrGetter<QRCodeProps>
): UseQRCodeReturn {
  const options = computed(() => resolveQRCodeProps(toValue(props)));
  const svg = computed(() => toSVGString(options.value));
  return {
    options,
    svg,
    toDataURL(format = "png", exportOptions = {}) {
      return getQRCodeDataUrl(
        options.value,
        format,
        exportSize(options.value, exportOptions.size),
        { quality: exportOptions.quality }
      );
    },
    download(downloadOptions = {}) {
      return downloadQRCode(options.value, {
        format: downloadOptions.format ?? "png",
        size: exportSize(options.value, downloadOptions.size),
        filename: downloadOptions.filename,
        quality: downloadOptions.quality,
      });
    },
  };
}
