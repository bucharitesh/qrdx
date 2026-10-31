# qrdx

Customizable QR codes for React: SVG and canvas rendering, dot and eye patterns, gradients, logos, decorative templates, PNG/JPG/SVG/PDF export and QR scanning.

Docs: [qrdx.dev/docs](https://qrdx.dev/docs) · CLI: [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli)

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

**Body** (`bodyPattern`, 9): `circle` (default), `circle-large`, `square`, `diamond`, `circle-mixed`, `pacman`, `rounded`, `small-square`, `vertical-line`

**Corner eye** (`cornerEyePattern`, 9): `square`, `rounded`, `gear` (default), `circle`, `diya`, `extra-rounded`, `message`, `pointy`, `curly`

**Corner eye dot** (`cornerEyeDotPattern`, 11): `square`, `rounded`, `circle` (default), `diamond`, `message`, `message-reverse`, `diya`, `diya-reverse`, `rounded-triangle`, `star`, `banner`

The same lists are exported as `BODY_PATTERN`, `CORNER_EYE_PATTERNS` and `CORNER_EYE_DOT_PATTERNS`. Decorative shapes trade some scan tolerance for style: `square` and `rounded` eyes scan most reliably, so test `circle` and `curly` eyes with the scanners your audience uses.

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
| `style` | — | `none` `banner-bottom` `banner-top` `border` `rounded-border` `speech-bubble` (`FRAME_STYLES`) |
| `text` | `"Scan me"` | Up to 24 characters; `""` hides the label |
| `color` | `#000000` | Frame color |
| `textColor` | white on banners, `color` on borders | Label color |

The label uses a system font stack (nothing is fetched). `getFrameDimensions(size, frame)` returns the output size for a `size`-pixel code, and `frameSchema` (zod) validates frame options.

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

await downloadQRCode(props, { format: "png", size: PRESET_SIZES.large }); // png | jpg | svg | pdf
await downloadQRCode(props, { format: "pdf", size: { width: 1200, height: 1200 }, filename: "qr.pdf" });
const dataUrl = await getQRCodeDataUrl(props, "svg", { width: 512, height: 512 });
await copyQRCodeToClipboard(props, { width: 512, height: 512 }); // PNG to the clipboard
const svgMarkup = await getSVGString(props);
```

Sizes must be square and between 50 and 5000 pixels (`validateSize`); with a frame the file is larger by the frame. When `props.size` is set, a logo laid out for that size is scaled with the export (`withQRSize`). PDF export loads `jspdf` on demand and throws a clear error if it is not installed. Lower-level helpers: `getQRAsSVGDataUri(props)` and `getQRAsCanvas(props, mimeType, returnCanvas?)`.

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

- `size` is the width of the code itself; a frame adds to the page.
- `colorMode: "cmyk"` uses a naive conversion (`rgbToCmyk`: K = 1 − max(R, G, B), no ICC profile). Ask your printer for a color-managed conversion when exact brand colors matter.
- Gradients are flattened to their first color stop in the PDF; use the print SVG to keep them. Frame text uses Helvetica Bold, so characters outside Latin-1 may not render in the PDF.
- Rule of thumb for size: width ≈ scan distance ÷ 10 (2 cm wide at 20 cm).

## Will it scan? (browser)

`getScanScore(props)` estimates how reliably a design scans. It renders the code at 96, 160 and 320 px, simulates camera blur and contrast loss, decodes each with jsQR, and combines that with contrast, polarity, logo coverage vs. error correction, quiet zone and eye-shape risk (`curly` eyes fail strict decoders; `circle` eyes only read in lenient ones).

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
