# qrdx

Customizable QR codes for React and plain JavaScript: SVG and canvas rendering, dot and eye patterns, gradients, logos, call-to-action frames, Logo QR and Image QR art, PNG/JPG/WebP/SVG/PDF/EPS export, print-ready files, a scan score and QR scanning.

It powers the [QRdx](https://qrdx.dev) QR code generator. Docs: [qrdx.dev/docs](https://qrdx.dev/docs) · CLI: [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli) · No-code: [image API](https://qrdx.dev/docs/developers/image-api) and [MCP server](https://qrdx.dev/docs/developers/mcp)

## Installation

```bash
npm install qrdx
# or: pnpm add qrdx / yarn add qrdx
```

`react` and `react-dom` (18 or newer) are optional peer dependencies: the React components need them, and [`qrdx/vanilla` and `qrdx/core`](#without-react-qrdxvanilla-and-qrdxcore) don't. PDF export also needs the optional `jspdf` peer, and PNG export in Node (`getQRAsPNG`, imported from `qrdx/node`) needs one of the optional rasterizer peers (`@resvg/resvg-js` draws the SVG — logos included — the way browsers do; `sharp` also works):

```bash
npm install jspdf
npm install @resvg/resvg-js # or: npm install sharp
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

`imageSettings`: `src` (image URL or data URL), `width` and `height` (pixels, relative to `size`), `excavate` (clear the modules behind the image), optional `x` / `y`, `shape` (`"square"`, `"rounded"` or `"circle"` crop) and `plate` (a solid color behind the logo, in its shape; the logo is inset on it). The crop is a clip path that the PDF and EPS exporters apply too. `removeLogoBackground(src)` (browser) and `removeLogoBackdrop(pixels)` clear a logo's solid background from the edges inward. Use level `H` (or at least `Q`) with a logo and keep it under roughly 25% of the code's width.

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
| `logoOptions` | `LogoOptions` | — | Logo `size` (share of the code's width, 0.1–0.3, default 0.25), `padding` (clear space, 0–2 modules), `x` / `y` (center across the code, 0–1, default 0.5), `shape` and `plate` |
| `scale` | `number` | `1` | Multiplier applied to `size` |

The logo is drawn at 25% of the code's width with the modules behind it excavated, so pair it with level `H` (or at least the default `Q`). `getQRData` takes the same `logoOptions` and turns them into `imageSettings`; with `autoLevel` it lays the logo out at the level the code is drawn at. Both cap the logo (size plus clear space) so its worst Reed–Solomon block loses at most 60% of what it can repair (`getLogoSizeLimit`, `getLogoBlockDamage`, on `getCodewordMap`); small codes hold smaller logos. Raw `imageSettings` passed to `QRCodeSVG`, `QRCodeCanvas` or `getQRAsSVG` get the same cap: a logo that fits is drawn as given, a bigger one is shrunk around its own center, keeping its aspect ratio and clear space. `getScanScore` checks the logo as passed, before the cap, with the same per-block count.

### `QRCodeCanvas`

Renders to a `<canvas>` (device-pixel-ratio aware). It draws plain square modules with solid colors only — gradients fall back to their first stop, and the pattern, eye/dot color, `eyeColors`, `moduleScale` and template props are ignored. Use `QRCodeSVG` for styled codes.

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

## Without React (`qrdx/vanilla` and `qrdx/core`)

The engine under the React components is also published without React. `qrdx/core` draws the same SVG as `QRCodeSVG`, byte for byte, and has every export, download, print and scan-score function the main entry has. `qrdx/vanilla` adds `createQRCode`, which draws a code into an element and keeps it up to date. Neither imports `react` or `react-dom`.

### In a page

```js
import { createQRCode } from "qrdx/vanilla";

const qr = createQRCode("#qr", {
  value: "https://example.com",
  size: 256,
  bodyPattern: "rounded",
  frame: { style: "banner-bottom", text: "Scan me" },
  "aria-label": "QR code for example.com",
});

qr.update({ fgColor: "#1d4ed8" }); // merges, redraws only when the markup changes
qr.toSVGString(); // the SVG markup
await qr.toDataURL("png", { size: 1024 }); // "png", "jpg", "webp", "svg", "pdf" or "eps"
await qr.download({ format: "svg", filename: "menu.svg" });
qr.destroy(); // removes the <svg>
```

`createQRCode(element, options)` takes an element or a CSS selector, and every option `QRCodeSVG` takes. Attributes such as `className`, `style` or `aria-label` go on the `<svg>`. It builds the `<svg>` with `createElementNS`, so no HTML is parsed. `qr.svg` is the element and `qr.options` the current options; `update` merges new options in (pass `undefined` to drop one).

### Without a bundler

`dist/vanilla.browser.mjs` is the same API as one ES module, for a `<script type="module">` served from a CDN:

```html
<div id="qr"></div>
<script type="module">
  import { createQRCode } from "https://cdn.jsdelivr.net/npm/qrdx/dist/vanilla.browser.mjs";

  createQRCode("#qr", { value: "https://example.com", size: 256 });
</script>
```

Add `@` and a version after `qrdx` in the URL to pin one. The file leaves out the official frame library's data (`OFFICIAL_FRAMES`, `getOfficialFrame`, `OFFICIAL_FRAME_INDEX`); import those from `dist/frames-official.mjs` and `dist/frames-index.mjs` next to it. PDF export and the scan score load `jspdf` and `jsqr` when they run, so a page that uses them maps both with an import map:

```html
<script type="importmap">
  {
    "imports": {
      "jspdf": "https://cdn.jsdelivr.net/npm/jspdf@4/+esm",
      "jsqr": "https://cdn.jsdelivr.net/npm/jsqr@1/+esm"
    }
  }
</script>
```

### Markup, DOM nodes and other frameworks

```ts
import {
  createQRCodeTree,
  renderToDOM,
  renderToString,
  resolveQRCodeProps,
  toHyperscript,
  toSVGString,
} from "qrdx/core";

toSVGString({ value: "https://example.com" }); // what <QRCodeSVG> renders, in Node or a browser
const tree = createQRCodeTree({ value: "https://example.com" }); // plain { type, props, key } nodes
renderToString(tree); // the same markup
renderToDOM(tree); // a DocumentFragment
// Another framework's elements (Vue's or Preact's h), with DOM attribute names
toHyperscript(tree, (type, attributes, children, key) => h(type, { ...attributes, key }, children));
toSVGString(resolveQRCodeProps({ value: "https://example.com", logo: "/logo.png" })); // what <QRCode> renders
```

`getQRAsSVGNode(props)` is `getQRAsSVG` without React (it resolves to a tree). [docs/adapters.md](./docs/adapters.md) describes how a framework wrapper should use the core.

## Angular (`qrdx/angular`)

A standalone component, `<qrdx-qr-code>`, for Angular 20 and newer. It takes `QRCode`'s props as signal inputs (`value` is required) and draws the same SVG, on the server too: with `@angular/ssr` the server's HTML holds the code and hydrates without errors. `@angular/core` is an optional peer dependency.

```ts
import { Component } from "@angular/core";
import { QRCode } from "qrdx/angular";

@Component({
  selector: "app-menu-code",
  imports: [QRCode],
  template: `
    <qrdx-qr-code
      #qr
      value="https://example.com"
      [size]="240"
      bodyPattern="rounded"
      [frame]="{ style: 'banner-bottom', text: 'Scan me' }"
      [svgStyle]="{ maxWidth: '100%', height: 'auto' }"
    />
    <button type="button" (click)="qr.download({ format: 'svg' })">Download</button>
  `,
})
export class MenuCode {}
```

- The code redraws when an input changes, and only when its markup does. `style` is `svgStyle` (styles for the `<svg>`); attributes on `<qrdx-qr-code>` stay on it.
- `download(options)` and `toDataURL(format, options)` export the code as in `qrdx/vanilla`; `markup()`, `options()` and `svg` are the markup, the resolved props and the `<svg>` element.
- Everything in `qrdx/core` is exported from `qrdx/angular` too.
- It ships compiled in Angular's partial mode, like other Angular libraries, and the Angular CLI links it when it builds the app.

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
| `shape` | `"square"` (default), `"circle"` or `"heart"`: the symbol sits in a disc or a heart filled with decorative modules, behind a light ring of `margin` modules (at least `QR_CIRCLE_QUIET_MIN`, 3). It also takes a `QRSilhouette` traced from a picture (`loadQRSilhouette` in the browser, `createQRSilhouette` from pixels); `getQRSilhouetteFit` refuses one too thin to hold the code, which then draws square. `getLayoutMargin` gives the margin it is drawn with; print sizes and logos follow it. `getQRAsSVG` draws it square |
| `frameLabelMarkers` | For editors: marks each frame label `<text>` with `data-qrdx-frame-label` (`"text"`, `"secondaryText"` or a spec label's id), so a preview can edit labels in place. Off by default; exports never include it |
| `imageSettings.padding` | Extra clear space around an excavated logo, in pixels |
| `bgColor="transparent"` | No background paint (transparent PNG/SVG, no fill in PDF/EPS) |

## Colors, gradients and image fills

Every color prop takes a `ColorConfig`: a CSS color string, `{ type: "solid", color }`, a linear, radial or angular gradient, or an image fill.

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

**Angular gradients.** `{ type: "angular", stops, angle }` sweeps the colors clockwise around the centre of what it fills (the code, or each eye), like CSS `conic-gradient(from <angle>deg, …)`. `angle` is where the sweep starts, in degrees clockwise from the top. SVG has no conic gradient, so it is drawn as a fan of thin wedges in a `<pattern>`; PDF and EPS paint the same wedges inside each shape.

**Alpha.** Colors and gradient stops keep alpha (`#1d4ed8cc`, `rgba(…)`). SVG writes it as `fill-opacity` and `stop-opacity`. PDF keeps it as a fill opacity, except that a gradient whose stops differ in alpha, or a see-through angular gradient, is mixed with the background. EPS has no transparency, so see-through colors are mixed with the background there. `getScanContrast(props)` judges see-through colors as they look.

**Image fills.** `{ type: "image", src, fit, scale, position, opacity, underlay }` paints a picture through the background, the dots or the eyes. It is laid over the whole code, so dots and eyes that share a picture show one picture. `fit` is `cover` (default), `contain` or `tile`; `scale` is 0.1–4; `position` is `center` or an edge or corner (`top-left`, `top`, …); `underlay` is a solid color under the picture that its `opacity` lets through. `src` is held like a logo: a PNG or JPEG data URL embeds everywhere, and servers never fetch a remote address.

```tsx
<QRCodeSVG
  value="https://example.com"
  level="H"
  fgColor={{ type: "image", src: photoDataUrl, opacity: 0.85, underlay: "#1f2937" }}
  bgColor="#ffffff"
/>
```

SVG draws an image fill as a `<pattern>`, and PDF embeds the picture once. EPS refuses image fills: `getQRAsEPS` throws `EPS_IMAGE_FILL_REASON`, and `hasImageFill(props)` tells you beforehand. The contrast check judges a picture by its lightest and darkest tones and asks more of it (`SCAN_IMAGE_CONTRAST_MIN`), since its detail reads as noise.

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

A wrapper gets React elements and returns them when a React component draws the code. With `qrdx/core` or `qrdx/vanilla` it gets the core's plain nodes instead, and a wrapper written with JSX still works as long as it uses no hooks. `h(type, props, ...children)` writes a wrapper without JSX that works in both; import it from the entry that draws the code (`qrdx` for the React components).

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

The label uses a system font stack (nothing is fetched). `getFrameDimensions(size, frame)` returns the output size for a `size`-pixel code, and `frameSchema` (zod) validates frame options. To draw a frame of your own, see [Custom frames](#custom-frames).

## Custom frames

A custom frame is data: a JSON **frame spec** with shapes, labels, theme colors and the place the code goes. Pass it as `frame: { style: "custom", spec }`. The engine turns it into the same plain shapes the built-in frames use, so SVG, canvas (PNG/JPG), PDF and EPS draw the same artwork. A spec holds no markup, URLs, scripts or images, so specs from other people are safe to store and render.

```tsx
import { QRCodeSVG, type FrameSpec } from "qrdx";

const spec: FrameSpec = {
  kind: "qrdx.frame",
  version: 1,
  artboard: { width: 1240, height: 1460 },
  qr: { x: 120, y: 120, size: 1000, padding: 80, radius: 24 }, // the code, its margin included
  colors: { frame: "#111111", text: "#ffffff" },               // defaults the theme can override
  shapes: [
    { type: "rect", x: 0, y: 0, width: 1240, height: 1460, radius: 64, fill: "frame" },
    { type: "icon", icon: "wifi", x: 80, y: 1260, size: 120, fill: "text" },
  ],
  labels: [
    {
      type: "text", id: "cta", slot: "primary", text: "Scan to join Wi-Fi",
      box: { x: 240, y: 1240, width: 920, height: 160 }, align: "start", color: "text",
    },
  ],
};

<QRCodeSVG value="WIFI:T:WPA;S:Guest;P:secret;;" frame={{ style: "custom", spec, color: "#1e3a8a" }} />;
```

**Units and layout.** Coordinates are in artboard units; the spec is scaled so `qr.size` becomes the code's size. The engine always paints an opaque plate of the code's background (white when the background is transparent) under the code and `qr.padding` around it, so nothing in the spec can show in the quiet zone. Labels may not overlap the code or its padding.

**Shapes** are painted behind the code, in order: `rect` (with `radius` and an optional `hole`), `circle` (with an optional `hole` radius, for rings), `ellipse`, `polygon`, `path` (SVG path data: `M L H V C S Q T A Z` and plain numbers only), `line` (a filled bar with `width`, `cap: "butt" | "round"` and an optional `dash: [dash, gap]`) and `icon` (a built-in glyph by id: <!-- catalogue:FRAME_ICONS -->`wifi`, `star`, `heart`, `phone`, `headphones`, `calendar`, `user`, `chat`, `bag`, `bell`, `cup`, `card`, `check`, `info`, `home`, `pin`, `share`, `download`, `clock`, `snowflake`, `pumpkin`, `tree`, `sparkle`, `gift`<!-- /catalogue -->).

**Colors.** A fill is a theme token or a fixed `#rgb`/`#rrggbb` color. `frame` is the frame's `color` (else `colors.frame`), `text` is `textColor` (else `colors.text`, else the frame color), `accent` is `secondaryColor` (else `colors.accent`, else the frame color) and `background` is the code's background. `{ mix: [a, b], amount }` is an opaque tint, and `{ gradient: { from, to, direction, steps } }` draws a gradient as solid color steps, which EPS can print too. `bleed` names the color print bleed continues with when the artwork fills its edges.

**Labels.** A `text` label is fitted in its `box` (`align` start, middle or end; `weight` bold or regular; `fontSize` defaults to 52% of the box height and never exceeds 95% of it). A `curved` label sets its letters along a circle (`curve: { cx, cy, radius, side: "top" | "bottom", spread }`). `slot: "primary"` shows the frame's `text`, `"secondary"` its `secondaryText` (each falls back to the label's own `text`, and `""` hides it), and `"fixed"` always shows `text`. `fontScale` scales every label. Text is cleaned with `sanitizeFrameText` (no control, invisible or direction-override characters, at most 24 characters). PDF and EPS print labels in Helvetica, so use Latin-1 text there (`isLatin1Text`).

**Validation.** `frameSpecSchema` (zod) checks every field and the hard limits in `FRAME_SPEC_LIMITS`: artboard sides of 50 to 2000 units, at most 3 decimals per number, 64 shapes, 8 labels, 256 points per polygon, 16,000 characters per path, 2,000 segments in all, 32 KB of JSON, a code at least half the artboard's shorter side and padding of at least 4% of the code. `getFrameSpecIssues(spec)` lists problems as text. Drawing an invalid spec throws a `FrameSpecError` instead of leaving the frame out.

**Official frames.** `OFFICIAL_FRAMES` is QRdx's frame library: call-to-action styles (tabs, ribbons, speech bubbles, tickets, stamps, badges, phones, arrows and more), holidays and seasons from around the world, and frames for restaurants and cafes, shops and packaging, events and weddings, hotels, travel and homes, health, fitness and learning, and business and social. Each has an `id`, `name`, `description`, `collection`, an `occasion` when it is seasonal (such as `"diwali"` or `"summer"`), suggested `contentTypes` and `tags`, and is released under CC0 1.0. `getOfficialFrame(id)` returns one. `OFFICIAL_FRAME_COLLECTIONS` lists the groups in picker order, and `OFFICIAL_FRAME_COUNT` and `OFFICIAL_FRAME_COUNTS` count them. `OFFICIAL_FRAME_INDEX` lists every frame without its spec (id, name, collection, occasion, tags, the artboard's width-to-height `ratio` and `frameSpecHash(spec)`, which tells an unchanged copy of a frame apart from an edited one), so a picker can search and lay out the whole library before loading any spec. Ids never change. `BUILT_IN_FRAME_SPECS` has `banner-bottom`, `rounded-border`, `circle` and `ticket` written as specs, as starting points.

```ts
import { getOfficialFrame } from "qrdx";

const wifi = getOfficialFrame("wifi-card"); // undefined for an unknown id
const frame = wifi && ({ style: "custom", spec: wifi.spec, secondaryText: "Harbour Guest" } as const);
```

### Importing an SVG (server)

`importFrameSvg(svg, options?)` converts SVG artwork into a spec, for a server to run on uploads. It never stores or returns the SVG: only filled shapes survive, rewritten as path data from the numbers it parsed, with colors as hex.

```ts
import { importFrameSvg } from "qrdx";

const result = importFrameSvg(uploadedSvg);
if (result.ok) {
  save(result.spec);            // validated with frameSpecSchema
  show(result.warnings);        // what was dropped or changed, e.g. "Removed 2 images"
  show(result.palette);         // colors found, and which became the frame and accent tokens
} else {
  reject(result.error);
}
```

- **Kept:** `svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `polygon` and `polyline` fills (transforms applied), and strokes on `rect`, `circle`, `ellipse` and `line`, turned into filled outlines. Internal gradients become their first color. The two most used colors become the `frame` and `accent` tokens, so the frame follows the theme.
- **Removed, with a warning:** `script`, `style`, `foreignObject`, `image`, `use`, text, filters, masks, clip paths, patterns, animation and unknown elements; every attribute other than geometry and paint, so `on*` handlers and `href`/`xlink:href` go too; `url(...)` paints that point outside the file; strokes on paths and polylines (outline them first).
- **Refused:** files over 200 KB, any DOCTYPE or entity declaration, processing instructions other than the XML declaration, malformed markup (it is scanned in linear time before parsing), more than 500 elements, nesting deeper than 16 and more than 4,000 path segments (`FRAME_IMPORT_LIMITS`).
- **The code's place:** a `rect` with the id `qr` (or `qr-code`, `qrdx-qr`) marks it and isn't drawn; or pass `options.qr` in the SVG's units. Without either, the code is centered at 60% of the shorter side and a warning says so. Shapes are clipped to the artboard (the viewBox, scaled so its longer side is 1000 units).

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

- `logo`: `blend` traces the logo into crisp vector shapes that fill the code under a fine dot screen; `badge` puts it on a rounded plate in the middle of a code tinted with its colors. Every module under the plate can spoil a codeword, so `intensity` grows the plate only as far as each error correction block can repair with room to spare. Small codes get a smaller logo, and the smallest (version 1, version 2 at L or M, version 3 at L) draw no plate and keep only the logo's colors.
- `halftone`: `color` shows the photo in full color; `mono` is an error-diffused black-and-white halftone.

In logo mode the finder eyes take the logo's colors unless you pass `matchEyes: false`; per-eye `eyeColors` still win. In Node, pass decoded RGBA pixels to `createQRArtImage` instead of `loadQRArtImage`: `decodePNGPixels(bytes)` reads an 8-bit PNG into them without a canvas or sharp. `art.image` is plain JSON, so you can store it with a design. Use level `H` and check the result with `getScanScore`, or, for rendered pixels in Node, with `scanQRPixels(pixels, value)`, which decodes them as they are and through the phone-camera model. See the [Art QR docs](https://qrdx.dev/docs/features/art-qr).

Art only renders dark dots on a light background: the background must be at least `QR_ART_MIN_LUMA_GAP` (0.35) lighter in luma than `fgColor` (gradients by their first stop). Otherwise the plain code is drawn so nothing gets worse. `getQRArtColorIssue(fgColor, bgColor)` returns `"inverted"`, `"low-contrast"` or `null`, so an editor can say why art isn't showing.

## Export and download (browser)

```tsx
import {
  copyQRCodeToClipboard,
  downloadQRCode,
  getQRAsWebP,
  getQRCodeDataUrl,
  getSVGString,
  PRESET_SIZES,
} from "qrdx";

const props = { value: "https://example.com", bodyPattern: "rounded" as const };

await downloadQRCode(props, { format: "png", size: PRESET_SIZES.large }); // png | jpg | webp | svg | pdf | eps
await downloadQRCode(props, { format: "webp", size: PRESET_SIZES.large }); // lossless WebP
const webp = await getQRAsWebP({ ...props, size: 1024 }); // a Blob; { quality: 0.9 } makes it lossy
const png = await getQRAsPNG({ ...props, size: 1024 }); // PNG bytes, plain Node — import from "qrdx/node"
await downloadQRCode(props, { format: "pdf", size: { width: 1200, height: 1200 }, filename: "qr.pdf" });
const dataUrl = await getQRCodeDataUrl(props, "svg", { width: 512, height: 512 });
await copyQRCodeToClipboard(props, { width: 512, height: 512 }); // PNG to the clipboard
const svgMarkup = await getSVGString(props);
```

Sizes must be square and between 50 and 5000 pixels (`validateSize`); with a frame the file is larger by the frame. For `eps`, `size.width` is in PostScript points (72 per inch). When `props.size` is set, a logo laid out for that size is scaled with the export (`withQRSize`). PDF export loads `jspdf` on demand and throws a clear error if it is not installed; EPS needs no extra package.

**PNG on a server.** `getQRAsPNG(props, { size })` returns PNG bytes and runs in plain Node without a DOM (handy where the browser helpers can't go). It lives behind its own subpath, so the browser bundle never sees the rasterizer:

```js
import { getQRAsPNG } from "qrdx/node";
```

It rasterizes the SVG the library renders with an optional peer dependency loaded only when the function is called: `@resvg/resvg-js` (recommended — it draws embedded logos the way browsers do, supporting PNG, JPEG, GIF, WebP and SVG images) or `sharp` (whose SVG renderer skips embedded images, so the logo is composited onto the pixels). Installing `qrdx` alone never pulls in a native module.

Logos are conservative by default, since a library function that runs on servers shouldn't fetch or read on a caller's behalf: a `src` that is a **data URL** is always used, while **http(s) URLs and local paths are only loaded with `loadExternalLogos: true`** (fetches are capped at 1 MB and refuse redirects). A logo that isn't loaded or can't be is left out, like in the browser. Frame label text needs a font on the machine. The CLI passes `loadExternalLogos: true` for its PNG and WebP output, since the person running it picked the source.

WebP is lossless by default, so module edges stay exact, and a transparent background stays transparent. `quality` (0 to 1, in `downloadQRCode` options or `getQRAsWebP`) asks for a smaller lossy file instead. The browser's canvas encodes it where it can; where it can't (Safari hands back a PNG for `image/webp`), QRdx encodes the pixels itself with a small built-in lossless encoder, so a `.webp` file is always WebP. `canvasToWebP(canvas)` does the same for any canvas, and `encodeWebPLossless(rgba, width, height)` encodes raw RGBA pixels without a DOM. Lower-level helpers: `getQRAsSVGDataUri(props)` and `getQRAsCanvas(props, mimeType, returnCanvas?)`.

Vector output writes coordinates with at most 3 decimals (0.001 px in SVG, 0.001 pt in PDF and EPS; scale factors keep 6), so edges move by at most 0.0005 px and SVG markup is roughly 30% smaller than with full-precision numbers.

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

`getScanScore(props)` estimates how reliably a design scans. It renders the code at 96, 160 and 320 px, simulates camera blur and contrast loss, decodes each with jsQR, and combines that with contrast (per-eye colors included), polarity, logo coverage vs. error correction, a logo moved over a corner eye or the bottom-right alignment pattern, quiet zone and eye-shape risk (`circle` eyes only read in lenient decoders; retired `curly` eyes in saved designs fail strict ones). Known-weak style pairs come from `getStylePairRisk`; a `circle` centre inside square-cornered eyes is flagged as `sharp-dot-eye` (missed by jsQR in sharp renders) without lowering the score.

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

[MIT](./LICENSE) © Ritesh Bucha and QRdx contributors. Versions before 0.0.47 were published under AGPL-3.0-or-later.

Includes code from [qrcode.react](https://github.com/zpao/qrcode.react) (ISC, © Paul O'Shannessy) and the [QR Code generator library](https://www.nayuki.io/page/qr-code-generator-library) (MIT, © Project Nayuki).
