/** biome-ignore-all lint/performance/noBarrelFile: the Angular entry re-exports the core */
// qrdx/angular: a standalone Angular component, <qrdx-qr-code>, on the
// shared core. ngc compiles this file in partial mode (tsconfig.angular.json)
// and the app's Angular CLI links it, like any Angular library; tsup then
// points its "./core" import at dist/core. Everything in qrdx/core is
// re-exported, so one import covers an Angular app.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  type InputSignal,
  inject,
  input,
  type Signal,
  untracked,
} from "@angular/core";
import {
  createQRCodeTree,
  DEFAULT_SIZE,
  type DownloadFormat,
  downloadQRCode,
  getQRCodeDataUrl,
  type QRCodeProps,
  type QRSVGOptions,
  renderToDOM,
  renderToString,
  resolveQRCodeProps,
} from "./core";

export * from "./core";

/** Options for `toDataURL` and `download`. */
export interface QRCodeExportOptions {
  /** Pixel size of the code (the frame adds to it); defaults to the code's `size` */
  size?: number;
  /** WebP only: 0 to 1 for a smaller lossy file */
  quality?: number;
}

export interface QRCodeDownloadOptions extends QRCodeExportOptions {
  /** "png" (default), "jpg", "webp", "svg", "pdf" (needs jspdf) or "eps" */
  format?: DownloadFormat;
  /** File name; defaults to one with the format and pixel size */
  filename?: string;
}

/**
 * `QRCodeProps` keys React's `<QRCode>` doesn't draw with (`logo` and
 * `logoOptions` place a logo), so they have no input.
 */
type Unused = "imageSettings" | "isOGContext";

/**
 * One input per `QRCodeProps` key, typed from it. `style` is `svgStyle`:
 * an input named `style` would take over the element's own `style`
 * attribute. `implements` makes the build fail when a prop has no input.
 */
type QRCodeInputs = {
  readonly [K in Exclude<keyof QRCodeProps, "style" | Unused>]-?: Prop<K>;
} & { readonly svgStyle: Prop<"style"> };

/** An input typed from a `QRCodeProps` key */
type Prop<K extends keyof QRCodeProps> = InputSignal<QRCodeProps[K]>;

/**
 * A QR code, drawn as SVG inside `<qrdx-qr-code>`. Takes the props of
 * React's `<QRCode>` as inputs (`style` is `svgStyle`) and draws the same
 * markup, on the server too. Redraws when an input changes.
 *
 * @example
 * <qrdx-qr-code value="https://qrdx.dev" [size]="256" bodyPattern="rounded" />
 */
@Component({
  selector: "qrdx-qr-code",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QRCode implements QRCodeInputs {
  readonly value: Prop<"value"> = input.required();
  readonly size: Prop<"size"> = input();
  readonly level: Prop<"level"> = input();
  readonly bgColor: Prop<"bgColor"> = input();
  readonly fgColor: Prop<"fgColor"> = input();
  readonly eyeColor: Prop<"eyeColor"> = input();
  readonly dotColor: Prop<"dotColor"> = input();
  readonly eyeColors: Prop<"eyeColors"> = input();
  readonly bodyPattern: Prop<"bodyPattern"> = input();
  readonly cornerEyePattern: Prop<"cornerEyePattern"> = input();
  readonly cornerEyeDotPattern: Prop<"cornerEyeDotPattern"> = input();
  readonly margin: Prop<"margin"> = input();
  readonly moduleScale: Prop<"moduleScale"> = input();
  readonly shape: Prop<"shape"> = input();
  readonly frame: Prop<"frame"> = input();
  readonly art: Prop<"art"> = input();
  readonly logo: Prop<"logo"> = input();
  readonly logoOptions: Prop<"logoOptions"> = input();
  readonly hideLogo: Prop<"hideLogo"> = input();
  readonly autoLevel: Prop<"autoLevel"> = input();
  readonly scale: Prop<"scale"> = input();
  readonly templateId: Prop<"templateId"> = input();
  readonly customTemplate: Prop<"customTemplate"> = input();
  readonly customProps: Prop<"customProps"> = input();
  readonly frameLabelMarkers: Prop<"frameLabelMarkers"> = input();
  readonly partMarkers: Prop<"partMarkers"> = input();
  /** `QRProps.style`: inline styles for the `<svg>` */
  readonly svgStyle: Prop<"style"> = input();

  /**
   * What the code is drawn with: the inputs resolved as React's `<QRCode>`
   * resolves its props (the logo laid out, `scale` applied). The same
   * object `toSVGString` and the export functions take.
   */
  readonly options: Signal<QRSVGOptions> = computed(() =>
    resolveQRCodeProps({
      value: this.value(),
      size: this.size(),
      level: this.level(),
      bgColor: this.bgColor(),
      fgColor: this.fgColor(),
      eyeColor: this.eyeColor(),
      dotColor: this.dotColor(),
      eyeColors: this.eyeColors(),
      bodyPattern: this.bodyPattern(),
      cornerEyePattern: this.cornerEyePattern(),
      cornerEyeDotPattern: this.cornerEyeDotPattern(),
      margin: this.margin(),
      moduleScale: this.moduleScale(),
      shape: this.shape(),
      frame: this.frame(),
      art: this.art(),
      logo: this.logo(),
      logoOptions: this.logoOptions(),
      hideLogo: this.hideLogo(),
      autoLevel: this.autoLevel(),
      scale: this.scale(),
      templateId: this.templateId(),
      customTemplate: this.customTemplate(),
      customProps: this.customProps(),
      frameLabelMarkers: this.frameLabelMarkers(),
      partMarkers: this.partMarkers(),
      style: this.svgStyle(),
    })
  );

  private readonly tree = computed(() => createQRCodeTree(this.options()));

  /** The code's SVG markup, as `toSVGString` writes it */
  readonly markup: Signal<string> = computed(() => renderToString(this.tree()));

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private element: SVGSVGElement | null = null;

  constructor() {
    // Runs during change detection, on the server too, so server-rendered
    // HTML carries the code. Only a change in the markup redraws.
    effect(() => {
      this.markup();
      untracked(() => this.draw());
    });
    inject(DestroyRef).onDestroy(() => {
      this.element = null;
    });
  }

  /** The `<svg>` element (null until the first draw) */
  get svg(): SVGSVGElement | null {
    return this.element;
  }

  /** The code as a data URL: "png" (default), "jpg", "webp", "svg", "pdf" or "eps" */
  toDataURL(
    format: DownloadFormat = "png",
    options: QRCodeExportOptions = {}
  ): Promise<string> {
    const current = this.options();
    return getQRCodeDataUrl(current, format, exportSize(current, options), {
      quality: options.quality,
    });
  }

  /** Saves the code as a file (a PNG unless `format` says otherwise) */
  download(options: QRCodeDownloadOptions = {}): Promise<void> {
    const current = this.options();
    return downloadQRCode(current, {
      format: options.format ?? "png",
      size: exportSize(current, options),
      filename: options.filename,
      quality: options.quality,
    });
  }

  private draw(): void {
    const host = this.host;
    const next = renderToDOM(this.tree(), host.ownerDocument)
      .firstChild as SVGSVGElement;
    if (this.element?.parentNode === host) {
      host.replaceChild(next, this.element);
    } else {
      // The first draw. After server rendering the element already holds
      // the server's copy of this markup (the template is empty, so nothing
      // else is in it): replace it rather than add a second code.
      while (host.firstChild) {
        host.removeChild(host.firstChild);
      }
      host.appendChild(next);
    }
    this.element = next;
  }
}

const exportSize = (options: QRSVGOptions, { size }: QRCodeExportOptions) => {
  const side = size ?? options.size ?? DEFAULT_SIZE;
  return { width: side, height: side };
};
