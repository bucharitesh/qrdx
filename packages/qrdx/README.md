# qrdx

Customizable QR codes for React: SVG and canvas rendering, dot and eye patterns, gradients, logos, call-to-action frames, Logo QR and Image QR art, PNG/JPG/SVG/PDF/EPS export, print-ready files, a scan score and QR scanning.

It powers the [QRdx](https://qrdx.dev) QR code generator. Docs: [qrdx.dev/docs](https://qrdx.dev/docs) · CLI: [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli) · No-code: [image API](https://qrdx.dev/docs/developers/image-api) and [MCP server](https://qrdx.dev/docs/developers/mcp)

## Installation

```bash
npm install qrdx
# or: pnpm add qrdx / yarn add qrdx
```

`react` and `react-dom` (18 or newer) are peer dependencies. PDF export also needs the optional `jspdf` peer:

```bash
npm install jspdf
```

## Quick start

```tsx
import { QRCodeSVG } from "qrdx";

export function Example() {
  return <QRCodeSVG value="https://example.com" size={256} />;
}
```

`QRCodeSVG` and `QRCode` use no client-only hooks, so they render in React Server Components as well as on the client. `QRCodeCanvas` is a client component (it ships with `"use client"`). The download, clipboard and scanning helpers need a browser DOM.

## Components

### `QRCodeSVG`

The core renderer. Every styling option is supported here.

```tsx
import { QRCodeSVG } from "qrdx";

<QRCodeSVG
  value="https://example.com"
  size={512}
  level="H"
  fgColor="#1a56db"
  bgColor="#f9fafb"
  eyeColor="#0d47a1"
  dotColor="#1976d2"
  bodyPattern="rounded"
  cornerEyePattern="rounded"
  cornerEyeDotPattern="circle"
  margin={2}
  imageSettings={{
    src: "https://example.com/logo.png",
    width: 128,
    height: 128,
    excavate: true,
  }}
/>;
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | **required** | Text or URL to encode |
| `size` | `number` | `128` | Width and height in pixels |
| `level` | `"L" \| "M" \| "Q" \| "H"` | `"Q"` | Error correction level |
| `fgColor` | `ColorConfig` | `"#000000"` | Data module color (solid or gradient) |
| `bgColor` | `ColorConfig` | `"#FFFFFF"` | Background color (solid or gradient) |
| `eyeColor` | `ColorConfig` | `fgColor` | Color of the three corner eyes (outer squares) |
| `dotColor` | `ColorConfig` | `fgColor` | Color of the dots inside the corner eyes |
| `bodyPattern` | `BodyPattern` | `"circle"` | Shape of the data modules |
| `cornerEyePattern` | `CornerEyePattern` | `"gear"` | Shape of the corner eyes |
| `cornerEyeDotPattern` | `CornerEyeDotPattern` | `"circle"` | Shape of the corner eye dots |
| `margin` | `number` | `0` | Quiet zone in modules. The QR spec recommends 4 when the code sits on a busy or dark background |
| `imageSettings` | `ImageSettings` | — | Center image; see below |
| `templateId` | `string` | — | Built-in decorative template; see [Templates](#templates) |
| `customTemplate` | `TemplateDefinition` | — | Your own template (takes precedence over `templateId`) |
| `customProps` | `Record<string, any>` | — | Extra props passed to the template wrapper |
| `isOGContext` | `boolean` | `false` | Render the logo as an absolutely positioned `<img>` for OG image renderers |
| `frame` | `QRFrame` | — | "Scan me" style frame; see [Frames](#frames-call-to-action) |
| `art` | `QRArt` | — | Blend a logo or photo into the modules; see [Art QR](#art-qr-logo-qr-and-image-qr) |

Any other SVG attribute (`className`, `style`, `aria-label`, …) is forwarded to the root `<svg>`.

`imageSettings`: `src` (image URL or data URL), `width` and `height` (pixels, relative to `size`), `excavate` (clear the modules behind the image), optional `x` / `y`. Use level `H` (or at least `Q`) with a logo and keep it under roughly 25% of the code's width.

### `QRCode`

A convenience wrapper around `QRCodeSVG` with a simpler logo API (`logo` / `hideLogo`).

```tsx
import { QRCode } from "qrdx";

<QRCode value="https://example.com" size={256} />; // no logo
<QRCode value="https://example.com" size={256} logo="https://example.com/logo.png" level="H" />;
```

It accepts the `QRCodeSVG` styling props above (`value`, `size`, `level`, colors, patterns, `margin`, `templateId`, `customTemplate`, `customProps`, `style`) plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `logo` | `string` | — | Center logo URL or data URL. No logo is drawn unless you pass one |
| `hideLogo` | `boolean` | `false` | Hide the logo even when `logo` is set (handy for toggles) |
| `scale` | `number` | `1` | Multiplier applied to `size` |

The logo is drawn at 25% of the code's width with the modules behind it excavated, so pair it with level `H` (or at least the default `Q`).

### `QRCodeCanvas`

Renders to a `<canvas>` (device-pixel-ratio aware). It draws plain square modules with solid colors only — gradients fall back to their first stop, and the pattern, eye/dot color and template props are ignored. Use `QRCodeSVG` for styled codes.

```tsx
"use client";
import { QRCodeCanvas } from "qrdx";

<QRCodeCanvas
  value="https://example.com"
  size={256}
  level="Q"
  fgColor="#000000"
  bgColor="#ffffff"
  imageSettings={{ src: "/logo.png", width: 64, height: 64, excavate: true }}
/>;
```

## Patterns

See every option drawn live at [qrdx.dev/docs/styles](https://qrdx.dev/docs/styles).

**Body** (`bodyPattern`, default `circle`): <!-- catalogue:BODY_PATTERN -->`circle`, `circle-large`, `square`, `diamond`, `circle-mixed`, `pacman`, `rounded`, `small-square`, `vertical-line`, `horizontal-line`, `liquid`, `liquid-horizontal`, `liquid-vertical`, `classy`, `classy-rounded`, `leaf`, `plus`, `hexagon`, `star`, `heart`, `random-dots`, `mosaic`, `octagon`<!-- /catalogue -->

**Corner eye** (`cornerEyePattern`, default `gear`): <!-- catalogue:CORNER_EYE_PATTERNS -->`square`, `rounded`, `gear`, `circle`, `diya`, `extra-rounded`, `message`, `pointy`, `leaf`, `drop`, `octagon`, `bevel`, `squircle`, `cushion`, `shield`, `petal`, `leaf-reverse`<!-- /catalogue -->

**Corner eye dot** (`cornerEyeDotPattern`, default `circle`): <!-- catalogue:CORNER_EYE_DOT_PATTERNS -->`square`, `rounded`, `circle`, `message`, `message-reverse`, `diya`, `diya-reverse`, `rounded-triangle`, `leaf`, `drop`, `plus`, `cross-rounded`, `hexagon`, `octagon`, `flower`, `heart`, `squircle`, `dots`, `extra-rounded`, `leaf-reverse`, `drop-reverse`<!-- /catalogue -->

The same lists are exported as `BODY_PATTERN`, `CORNER_EYE_PATTERNS` and `CORNER_EYE_DOT_PATTERNS`. `liquid` and `classy` join neighbouring modules into one outline; `leaf`, `drop` and `petal` eyes turn to face their corner of the code. Alignment patterns are always drawn as solid squares. Every value is tested to decode with jsQR through a phone-camera model next to every other value (and was checked with ZXing and in sharp renders); `square` and `rounded` eyes scan most reliably and `circle` eyes may be missed by some apps. A few body × eye pairs are weak together (`WEAK_BODY_EYES`), and `getStylePairRisk(props)` returns the warning `getScanScore` shows.

**Retired:** `curly` eyes and `diamond`, `star` and `banner` eye dots don't scan reliably, so they are no longer in these lists. They are deprecated, not removed: the types and zod schemas still accept them and the renderer still draws them, so saved designs keep working (`RETIRED_CORNER_EYE_PATTERNS`, `RETIRED_CORNER_EYE_DOT_PATTERNS`; `pickableCornerEyePatternSchema` and `pickableCornerEyeDotPatternSchema` accept only offered values).

| Option | Notes |
| --- | --- |
| `eyeColors` | Per-eye `{ outer, inner }` colors (or gradients) for `topLeft`, `topRight`, `bottomLeft`; each overrides `eyeColor` / `dotColor` |
| `moduleScale` | 0.5–1 (default 1): smaller modules for a spaced look; each pattern stops at the smallest size that still scans (`MODULE_SCALE_FLOOR`) |
| `autoLevel` | Raise `level` to H when a logo covers more than 7% of the code (off by default) |
| `imageSettings.padding` | Extra clear space around an excavated logo, in pixels |
| `bgColor="transparent"` | No background paint (transparent PNG/SVG, no fill in PDF/EPS) |

## Colors and gradients

Every color prop takes a `ColorConfig`: a CSS color string, `{ type: "solid", color }`, or a gradient.

```tsx
<QRCodeSVG
  value="https://example.com"
  fgColor={{
    type: "linear",
    angle: 135, // 0 = left→right, 90 = top→bottom
    stops: [
      { color: "#6366f1", offset: 0 },
      { color: "#ec4899", offset: 100 },
    ],
  }}
  bgColor={{
    type: "radial",
    stops: [
      { color: "#ffffff", offset: 0 },
      { color: "#f1f5f9", offset: 100 },
    ],
  }}
/>
```

Gradients need at least 2 stops; `offset` is a percentage (0–100).

## Templates

Built-in `templateId` values: `default`, `Arrow`, `StandardBox`, `SquareBorder`, `StrikedBox`, `Halloween` (case-sensitive). `getTemplateIds()`, `getAllTemplates()` and `getTemplate(id)` list them at runtime.

A custom template wraps the QR content (a 300×300 SVG) in your own SVG:

```tsx
import { QRCodeSVG, type TemplateDefinition } from "qrdx";

const Framed: TemplateDefinition<{ label?: string }> = {
  id: "Framed",
  name: "Framed",
  wrapper: (children, props) => (
    <svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(20, 20) scale(0.87)">{children}</g>
      <text x="150" y="325" textAnchor="middle" fill={props?.fgColor}>
        {props?.label}
      </text>
    </svg>
  ),
};

<QRCodeSVG value="https://example.com" customTemplate={Framed} customProps={{ label: "Scan me" }} />;
```

## Frames (call to action)

`frame` draws a "Scan me" style frame around any code (`QRCode`, `QRCodeSVG`, `QRCodeCanvas`, `getQRAsSVG`, `getQRData` and the download helpers). The frame is added around the code, so the output grows; the modules and quiet zone are not touched.

```tsx
<QRCode
  value="https://example.com/menu"
  frame={{ style: "banner-bottom", text: "Scan for the menu", color: "#1e3a8a" }}
/>
```

| Option | Default | Notes |
| --- | --- | --- |
| `style` | — | One of `FRAME_STYLES`: <!-- catalogue:FRAME_STYLES -->`none`, `banner-bottom`, `banner-top`, `border`, `rounded-border`, `speech-bubble`, `banner-top-bottom`, `speech-bubble-top`, `chat-bubble`, `circle`, `polaroid`, `phone`, `ticket`, `badge`, `envelope`, `tag`, `menu-card`, `sticker`, `gradient-border`, `focus`<!-- /catalogue --> |
| `text` | `"Scan me"` | Up to 24 characters; `""` hides the label |
| `color` | `#000000` | Frame color (`gradient-border`: start color) |
| `textColor` | white on the frame, `color` on light areas | Label color |
| `secondaryText` | — | Second label (`banner-top-bottom`, `circle`, `menu-card`), up to 24 characters |
| `secondaryColor` | `#db2777` | End color of `gradient-border` |
| `fontScale` | `1` | Label size, 0.5–1.5 (labels still shrink to fit) |

Frames are plain shapes and text with opaque colors, so SVG, PNG, PDF and EPS match: the gradient border is drawn as fine solid color steps, and `circle` sets its letters as rotated text in every format.

The label uses a system font stack (nothing is fetched). `getFrameDimensions(size, frame)` returns the output size for a `size`-pixel code, and `frameSchema` (zod) validates frame options.

## Art QR (Logo QR and Image QR)

`art` blends a logo or photo into the modules while keeping a real, scannable code: finder, timing and alignment patterns are always drawn solid. It is vector output with no AI, so it renders on the server and exports to SVG, PDF and EPS.

```tsx
import { QRCodeSVG, loadQRArtImage } from "qrdx";

// Browser: sample an uploaded file, a data URL or an <img>
const image = await loadQRArtImage(file, { mode: "logo" });

<QRCodeSVG value="https://example.com" size={512} level="H" art={{ mode: "logo", image, intensity: 0.7 }} />;
```

`mode` is `logo` (modules inside the logo take its colors) or `halftone` (every module shows the photo around a center that keeps the true value). `intensity` goes from `0` (plain) to `1` (default `0.6`).

`variant` picks a look within the mode (`QR_ART_VARIANTS`; the first is the default):

- `logo`: `blend` traces the logo into crisp vector shapes that fill the code under a fine dot screen; `badge` puts it on a rounded plate in the middle of a code tinted with its colors.
- `halftone`: `color` shows the photo in full color; `mono` is an error-diffused black-and-white halftone.

In logo mode the finder eyes take the logo's colors unless you pass `matchEyes: false`; per-eye `eyeColors` still win. In Node, pass decoded RGBA pixels to `createQRArtImage` instead of `loadQRArtImage`. `art.image` is plain JSON, so you can store it with a design. Use level `H` and check the result with `getScanScore`. See the [Art QR docs](https://qrdx.dev/docs/features/art-qr).

## Export and download (browser)

```tsx
import {
  copyQRCodeToClipboard,
  downloadQRCode,
  getQRCodeDataUrl,
  getSVGString,
  PRESET_SIZES,
} from "qrdx";

const props = { value: "https://example.com", bodyPattern: "rounded" as const };

await downloadQRCode(props, { format: "png", size: PRESET_SIZES.large }); // png | jpg | svg | pdf | eps
await downloadQRCode(props, { format: "pdf", size: { width: 1200, height: 1200 }, filename: "qr.pdf" });
const dataUrl = await getQRCodeDataUrl(props, "svg", { width: 512, height: 512 });
await copyQRCodeToClipboard(props, { width: 512, height: 512 }); // PNG to the clipboard
const svgMarkup = await getSVGString(props);
```

Sizes must be square and between 50 and 5000 pixels (`validateSize`); with a frame the file is larger by the frame. For `eps`, `size.width` is in PostScript points (72 per inch). When `props.size` is set, a logo laid out for that size is scaled with the export (`withQRSize`). PDF export loads `jspdf` on demand and throws a clear error if it is not installed; EPS needs no extra package. Lower-level helpers: `getQRAsSVGDataUri(props)` and `getQRAsCanvas(props, mimeType, returnCanvas?)`.

### Print-ready files

`downloadPrintPDF` writes a vector PDF at an exact physical size: modules, eyes and frames are vector paths (a logo stays a raster image), with optional bleed and crop marks. `getQRAsPrintPDF` / `getQRAsPrintPDFBuffer` return the PDF instead of downloading it (they also run in Node).

```ts
import { downloadPrintPDF, downloadPrintSVG, getPrintLayout } from "qrdx";

const props = { value: "https://example.com", frame: { style: "banner-bottom" } } as const;

// 40 mm wide code, 3 mm bleed, crop marks, CMYK colors
await downloadPrintPDF(props, { size: 40, unit: "mm", bleed: 3, cropMarks: true, colorMode: "cmyk" });
await downloadPrintSVG(props, { size: 1.5, unit: "in" }); // SVG with width="…in"

getPrintLayout(props, { size: 40 }).maxScanDistance; // 400 (mm): a code scans from ~10× its width
```

Vector EPS for print shops and design tools (Illustrator, InDesign, CorelDRAW) works the same way, in the browser or in Node:

```ts
import { downloadPrintEPS, getQRAsEPS, svgToEPS } from "qrdx";

const eps = await getQRAsEPS(props, { sizeMm: 40, bleedMm: 3, colorMode: "cmyk" }); // EPSF-3.0 string
await downloadPrintEPS(props, { sizeMm: 40, filename: "qr.eps" });
const fromSvg = await svgToEPS(svgMarkup, { width: 144 }); // any SVG this library renders, 144 pt wide
```

EPS has no transparency or crop marks, and PNG and JPEG logos are embedded as images. Linear and radial gradients stay smooth: the PDF paints them as native shadings and the EPS with `shfill` (the file then declares PostScript LanguageLevel 3), clipped to each module, eye and eye centre, in the same color mode as the solid colors.

- `size` is the width of the code itself; a frame adds to the page.
- `colorMode: "cmyk"` uses a naive conversion (`rgbToCmyk`: K = 1 − max(R, G, B), no ICC profile). Ask your printer for a color-managed conversion when exact brand colors matter.
- Gradients stay gradients in the PDF (native shadings). In CMYK mode the blend runs between the converted stop colors. Frame text uses Helvetica Bold, so characters outside Latin-1 may not render in the PDF.
- Rule of thumb for size: width ≈ scan distance ÷ 10 (2 cm wide at 20 cm).

## Will it scan? (browser)

`getScanScore(props)` estimates how reliably a design scans. It renders the code at 96, 160 and 320 px, simulates camera blur and contrast loss, decodes each with jsQR, and combines that with contrast, polarity, logo coverage vs. error correction, quiet zone and eye-shape risk (`circle` eyes only read in lenient decoders; retired `curly` eyes in saved designs fail strict ones).

```ts
import { getScanScore, getImageScanScore } from "qrdx";

const { score, grade, checks } = await getScanScore({ value: "https://example.com", bodyPattern: "circle" });
// score 0–100, grade "great" | "ok" | "risky" | "fails",
// checks [{ id, passed, message, fix? }]

// Score an existing image (File/Blob or <img>): decoded content plus what can be measured from pixels
const report = await getImageScanScore(file); // { data, version, score, grade, checks }
```

It is a heuristic built on one open-source decoder: phone camera apps vary, so treat it as a guide and test-scan important prints.

## Scanning (browser)

`handleImageLoad` decodes a QR code from an `<img>` using [jsQR](https://github.com/cozmo/jsQR), trying several crops and scales. jsQR is loaded on first use.

```ts
import { handleImageLoad } from "qrdx";

const text = await handleImageLoad(imgElement, 400); // decoded string, or "NO_QR"
const full = await handleImageLoad(imgElement, 400, true); // full jsQR result (data, location, …)
```

`downloadImageWithBoundingBox(img, [topLeft, topRight, bottomLeft, bottomRight], filename)` saves a debug copy of the image with the detected corners outlined.

## Utilities

```ts
import { getContrastLevel, getContrastRatio, getQRData } from "qrdx";

getContrastRatio("#000000", "#ffffff"); // 21 (accepts #rgb, #rrggbb, #rrggbbaa)
getContrastLevel(4.5); // { level: "AA", warning: false, message: "Good contrast" }

// Normalised props, including the logo imageSettings used by <QRCode>
const data = getQRData({ value: "https://example.com", logo: "https://example.com/logo.png" });
```

`getContrastLevel` returns `AAA` (≥ 7), `AA` (≥ 4.5), `AA Large` (≥ 3, with a warning) or `Fail`.

### Server-safe types and schemas

`qrdx/types` exports the TypeScript types, the [zod](https://zod.dev) schemas (`qrPropsSchema`, `colorConfigSchema`, …), the pattern lists and the color helpers without any React code:

```ts
import { colorConfigSchema, normalizeColorConfig, type ColorConfig } from "qrdx/types";

const parsed = colorConfigSchema.parse(JSON.parse(userInput));
```

## Error correction

| Level | Recovers |
|-------|----------|
| `L` | ~7% |
| `M` | ~15% |
| `Q` | ~25% (default) |
| `H` | ~30% |

Higher levels survive more damage (and larger logos) but produce denser codes.

## License

[AGPL-3.0-or-later](https://github.com/bucharitesh/qrdx/blob/main/license.md) © Ritesh Bucha

Includes code from [qrcode.react](https://github.com/zpao/qrcode.react) (ISC, © Paul O'Shannessy) and the [QR Code generator library](https://www.nayuki.io/page/qr-code-generator-library) (MIT, © Project Nayuki).
