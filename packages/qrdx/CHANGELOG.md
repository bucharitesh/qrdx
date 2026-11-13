# Changelog

Release notes for earlier versions are at [qrdx.dev/changelog](https://qrdx.dev/changelog).

## Unreleased

### Vue (`qrdx/vue`)

- **`qrdx/vue`** has Vue 3 versions of `QRCode` and `QRCodeSVG`, with the React components' props and the same SVG. They're render functions over the core (`createQRCodeTree`, then `toHyperscript` into Vue's `h`), so they render on the server with `vue/server-renderer` and hydrate without a mismatch, in Nuxt too. `class`, `style`, other attributes and listeners go on the `<svg>`, and Vue updates it in place when a prop changes.
- **`useQRCode(props)`** takes `QRCode`'s props as an object, a ref, a reactive object or a getter, and returns the SVG markup as a computed ref (it works in SSR), the resolved `options`, `toDataURL` and `download`.
- Everything in `qrdx/core` is re-exported. The entry imports the engine from `qrdx/core`, so it adds under 1 KB gzipped of its own.
- `vue` 3.3 or newer is an optional peer dependency, so installing `qrdx` never installs Vue. TypeScript checks the components' props with Vue 3.4.20 or newer.

### One frame system

- **Every built-in frame is a frame spec.** The 19 styles in `FRAME_STYLES` (all but `none`) are now JSON specs in `src/frames/builtin`, drawn by the same code as official and custom frames. The hand-written layouts in `frame.tsx` and `frame-styles.ts` are gone. A parity test renders every built-in against the old layouts in SVG, canvas, PDF and EPS, with and without labels, with brand colors and at `fontScale` 0.5 and 1.5; sizes, code boxes and labels match to 0.02 px.
- **Nothing changes for frame options.** `{ style: "banner-bottom", text, color, textColor, secondaryText, secondaryColor, fontScale }` is accepted for good and draws the same frame. `FRAME_STYLES`, `frameStyleSchema` and `QRFrame` stay as they are.
- **New exports:** `BUILT_IN_FRAMES` (each built-in frame's `style`, `name`, `tags`, `labelOn` and `spec`), `getBuiltInFrame(style)`, `frameSpecOf(frame)` (the spec any frame draws), `getFrameColors(frame)` and `getFrameSpecColors(spec, frame)` (the frame, text and accent colors it paints with). `BUILT_IN_FRAME_SPECS` now has every built-in style, not four. `GRADIENT_FRAME_DEFAULTS` (now read from the gradient border's spec), `mixFrameColors` and `FRAME_GAP_RATIO` are still exported. `getFrameGapRatio` returns each frame's spec padding.
- **New spec fields**, all optional (specs without them draw as before):
  - `labels[].collapse: { y, height }` cuts a band out of the artwork when the label shows no text. Rows below it move up and shapes wholly inside it are left out. The borders use it to drop their label row.
  - `qr.plate: "opaque" | "background"`. With `"background"`, a see-through background stays see-through and the plate is left out. It's allowed only when nothing but `background` fills, or a ring whose hole holds the plate, lies under the plate.
  - `colors.text` can be a mix of `frame`, `accent`, `background` and hex colors, such as `{ mix: ["frame", "accent"], amount: 0.5 }`.
  - A text label's row may reach into the plate's padding, as long as it stays off the code and its capitals stay out of the padding at `fontScale` 1.5.
  - qrdx 0.0.51 and older reject specs that use these.
- **Fix: see-through backgrounds under ticket, polaroid, phone, chat-bubble, tag, sticker and envelope.** These frames lie under the code, and with a transparent background the code used to sit on the frame color. They now paint a white plate under the code, like every custom frame. Banners, borders, bubbles, circle, badge, focus, menu-card and gradient-border stay see-through.
- The gradient border's left inner edge is no longer 0.6 px thicker than its right one (its old color strips overlapped into the light area). The circle frame's two dots are two shapes in the SVG instead of one path.
- The engine bundles are about 5.6 KB larger minified (`dist/index.mjs` 273,981 to 279,617 bytes, `dist/core.mjs` 273,192 to 278,828) and at most 0.3 KB larger gzipped: the 19 specs are a little more data than the code they replace.

## 0.0.51

### React-free core and plain JavaScript

- **`qrdx/core`** is the whole engine without React: everything the main entry exports except the React components (`QRCode`, `QRCodeSVG`, `QRCodeCanvas`, and `getQRAsSVG`, which returns a React element). `toSVGString(props)` returns exactly the markup `<QRCodeSVG>` renders, in Node or a browser. `createQRCodeTree(props)` builds the code as plain `{ type, props, key }` nodes, which `renderToString`, `renderToDOM` (built with `createElementNS`) and `toHyperscript` (another framework's elements, with DOM attribute names) turn into markup, DOM nodes or virtual DOM. `toSVGElement(props)` returns an `<svg>` element, `resolveQRCodeProps(props)` resolves `QRCode`'s logo API, and `getQRAsSVGNode(props)` is `getQRAsSVG` without React.
- **`qrdx/vanilla`** adds `createQRCode(element, options)` to the core: it draws a code into an element or CSS selector and returns `update`, `toSVGString`, `toDataURL`, `download` and `destroy`. `dist/vanilla.browser.mjs` is the same API as one ES module for `<script type="module">` without a bundler (the official frame library's data ships next to it in `dist/frames-official.mjs`).
- `react` and `react-dom` are now optional peer dependencies. The React components still need them; `qrdx/core`, `qrdx/vanilla` and `qrdx/node` don't import either.
- The React components draw through the same renderer, building React elements directly, so their markup is unchanged byte for byte (a parity test compares over 500 prop combinations, every official frame among them). `getQRAsSVGDataUri`, and the downloads, print PDF and EPS, the scan score and `qrdx/node`'s PNG built on it, no longer load `react-dom/server`.
- `qrdx/node` now imports the engine from `qrdx/core`, so it's a few kilobytes on its own and needs neither `react` nor `react-dom`.
- `h(type, props, ...children)` writes a custom template without JSX. A template `wrapper` gets React elements in the React components and the core's nodes elsewhere (`TemplateNode`).
- Types: `QRSVGOptions` (props plus root `<svg>` attributes) and `QRStyle` (the same type as React's `CSSProperties`, from `csstype`) are new. `QRPropsSVG` and `QRPropsCanvas` are unchanged and still exported from `qrdx` and `qrdx/types`.

### Frame library: industries and everyday uses

- **303 more official frames** for the places people print codes: more calls to action (FAQ, translations, large print, waitlists, checklists, transcripts), restaurants and cafes, shops and packaging, clinics and schools, and business (portfolios, reports, visitor sign-in, quotes, insurance claims, staff rotas and more). Each has its own purpose, label and look, and decodes at phone distances, scores Great and reads with zbar, like every official frame.
- **Five new collections:** `beauty-wellness`, `real-estate`, `automotive` ("Cars & parking"), `sports-fitness` and `nonprofit` ("Nonprofits & community"). `OfficialFrameCollection` and `OFFICIAL_FRAME_COLLECTIONS` include them, so code with a case or a `Record` for every collection needs the new ids.
- The property frames and `sign-rider` move from `places` to `real-estate`, and the gym frames from `health-learning` to `sports-fitness`. Their ids, names and specs are unchanged.
- New shapes: yard signs with a rider, signs on posts, sidewalk A-frame boards, shelf talkers, clipboards, team shirts, vinyl banners with eyelets, bone-shaped pet tags, collection jars, EV chargers, folded-corner and stacked cards, a cloud bubble and a big side arrow, plus about a hundred new drawings (food, shop goods, sports gear, cars, salon tools, community symbols).

## 0.0.50

### PNG in Node

- **`getQRAsPNG(props, { size, loadExternalLogos })`** from the new **`qrdx/node`** entry returns PNG bytes in plain Node, with no DOM. It needs one of two optional peers, loaded only when it runs: `@resvg/resvg-js`, which draws embedded logos the way browsers do, or `sharp`, whose renderer skips embedded images, so the logo is composited onto the pixels afterwards. With neither installed, the error says what to install. Thanks to @AndreIsraelAO (#405).
- The browser entry never mentions either package, so apps that bundle `qrdx` for the browser don't try to load a native module.
- Logos: a data URL always works. An http(s) URL is fetched, and a local path read, only with `loadExternalLogos: true`, capped at 1 MB, with no redirects and a timeout, so a server that passes a caller's `imageSettings.src` through can't be made to fetch internal URLs or read its own files.
- `@qrdx/cli` 0.0.8 renders PNG through `getQRAsPNG` and encodes WebP from those PNG bytes, so the two formats match pixel for pixel.

### Part markers

- **`partMarkers`** on `QRCode` and `QRCodeSVG` marks each drawn part of the code for an editor's live preview: every finder eye's outer ring and centre (`data-qrdx-part="eye-outer"` / `"eye-centre"`, with `data-qrdx-eye` saying `"top-left"`, `"top-right"` or `"bottom-left"`), the dots (`"body"`), the logo (`"logo"`) and the background (`"background"`). `QR_PART_ATTRIBUTE`, `QR_EYE_ATTRIBUTE` and `QR_PARTS` name them. Like `frameLabelMarkers`, it is off by default, the markup without it is unchanged, and every export drops it.

## 0.0.49

### Frame library

- **Hundreds of official frames.** `OFFICIAL_FRAMES` grows from 24 to a library of call-to-action styles, holidays and seasons from around the world (Christmas, New Year, Lunar New Year, Diwali, Holi, Ramadan, the two Eids, Hanukkah, Passover, Easter, Halloween, Thanksgiving, Valentine's Day, independence days, Black Friday and more) and frames for restaurants, shops, packaging, events, weddings, hotels, travel, real estate, health, fitness, education, reviews, payments, social follows, app downloads and business cards. Every frame decodes at phone distances, scores Great and reads with zbar, as before. The 24 existing frames and their ids are unchanged.
- Each frame has a `collection` (`OFFICIAL_FRAME_COLLECTIONS`) and seasonal ones an `occasion`. `OFFICIAL_FRAME_COUNT` and `OFFICIAL_FRAME_COUNTS` count them.
- `OFFICIAL_FRAME_INDEX` lists every frame without its spec, and `frameSpecHash(spec)` fingerprints a spec (key order doesn't matter), so pickers can search the library and recognise an official frame before loading specs.

### Docs

- The README on npm no longer says that npm is a version behind. That note was written for 0.0.46.

## 0.0.48

### WebP export

- **`format: "webp"`** in `downloadQRCode` and `getQRCodeDataUrl`, and `getQRAsWebP(props, options)` for a `Blob`. It is lossless by default, so module edges stay exact, and a transparent background stays transparent. `quality` (0 to 1) asks for a smaller lossy file instead.
- **Every browser gets real WebP.** The canvas encodes it where it can. Safari can't, and hands back a PNG for `image/webp`, so the file's bytes are checked and QRdx's own lossless encoder takes over; a browser that would only write lossy WebP when lossless was asked for is handled the same way. `getQRAsCanvas(props, "image/webp")` goes through the same path.
- `DOWNLOAD_FORMATS` lists every download format with its MIME type and file extension.
- `canvasToWebP(canvas, options)` does this for any canvas. `encodeWebPLossless(rgba, width, height)` encodes RGBA pixels with no DOM (it also runs in Node); `isWebPFile` and `getWebPCompression` read a file's header.

## 0.0.47

### Custom frames

- **Frame specs.** `frame: { style: "custom", spec }` draws a frame from a JSON spec: rects, circles, ellipses, polygons, paths, dashed lines and built-in icons, straight and curved labels, and colors bound to the theme (`color`, `textColor`, `secondaryColor`) or fixed. A spec compiles to the same shapes as the built-in frames, so SVG, canvas, PDF and EPS draw the same artwork. Validate one with `frameSpecSchema` or `getFrameSpecIssues`; the hard limits are in `FRAME_SPEC_LIMITS`. Drawing an invalid spec throws a `FrameSpecError`.
- **The quiet zone stays clear.** Custom frames always paint an opaque plate (the code's background, or white when it is transparent) under the code and its padding, and labels may not overlap them.
- **SVG import.** `importFrameSvg(svg)` converts SVG artwork into a spec on a server. Only filled shapes survive, rewritten from parsed numbers. Script, style, images, `use`, text, filters, links and external references are removed and reported as warnings. DOCTYPE and entity declarations, oversized or malformed files are refused.
- **Official frames.** `OFFICIAL_FRAMES` holds 24 specs (20 use cases and 4 seasonal frames, CC0 1.0), and `getOfficialFrame(id)` returns one. Each decodes with a link, a Wi-Fi network and a contact card at phone distances, scores Great, and reads with zbar.
- **Built-ins as specs.** `BUILT_IN_FRAME_SPECS` has `banner-bottom`, `rounded-border`, `circle` and `ticket` as specs. They match the built-in styles in SVG, PDF and EPS.
- `FrameLabel` has optional `align` and `fontWeight`; `getFrameGapRatio(frame)` returns the light gap a frame keeps around the code.
- **Frame label markers.** `FrameLabel.field` says which frame text a label draws: `"text"`, `"secondaryText"` or a custom spec's label id (every letter of curved text carries it). With `frameLabelMarkers`, `QRCode` and `QRCodeSVG` add it to each frame `<text>` as `data-qrdx-frame-label` (`FRAME_LABEL_ATTRIBUTE`), so an editor's preview can find and edit each label. It is off by default, and `getQRAsSVGDataUri` drops it, so SVG, PNG, JPG, PDF and EPS exports are byte-identical with or without it.

### Angular gradients and alpha

- **Angular gradients.** `{ type: "angular", stops, angle }` sweeps the colors clockwise around the centre of what it fills (the code, or each eye), like CSS `conic-gradient(from <angle>deg, …)`. SVG has no conic gradient, so it is drawn as a fan of thin wedges in a `<pattern>`, about two color levels apart; PDF and EPS paint the same wedges inside each shape.
- **Alpha everywhere.** Colors and gradient stops keep alpha (`#1d4ed8cc`, `rgba(…)`). SVG writes it as `fill-opacity` and `stop-opacity`. PDF keeps it as a fill opacity; a gradient whose stops differ in alpha, and a see-through angular gradient, are mixed with the background instead. EPS has no transparency, so see-through colors are mixed with the background (the background itself with white).
- `getScanContrast(props)` is the scan score's contrast check on its own, and judges see-through colors as they look. `SCAN_CONTRAST_MIN`, `SCAN_CONTRAST_LOW` and `SCAN_CONTRAST_FAIL` are its thresholds.
- `getNormalizedColor` previews a linear gradient at the angle the code draws it (it was a quarter turn off) and an angular one as a CSS conic gradient.

### Image fills

- **`{ type: "image", src, fit, scale, position, opacity, underlay }`** paints a picture through the background, the dots or the eyes. It is laid over the whole code, so dots and eyes that share a picture show one picture, embedded once. `fit` is `cover`, `contain` or `tile`; `underlay` is a solid color under the picture that its opacity lets through. `src` is held like a logo: a PNG or JPEG data URL embeds everywhere, and servers never fetch a remote address.
- SVG draws it as a `<pattern>` with an `<image>`. PDF embeds the picture once and paints it inside each shape, at its opacity. **EPS refuses image fills** (`EPS_IMAGE_FILL_REASON`, `hasImageFill`): PostScript has no transparency and would repeat the picture for every dot.
- The contrast check judges a picture by its tones (`getImageTones`, `getImageTonesFromPixels`: its lightest and darkest tenth) and asks more of it (`SCAN_IMAGE_CONTRAST_MIN`: 7:1 in the code, 12:1 behind it), since its detail reads as noise. `getScanContrast` reports the `required` ratio. `getScanScore` inlines image fills and samples their tones.

### Code shapes

- **Circle and heart codes.** `shape: "circle"` or `"heart"` puts the symbol in the middle of a disc or a heart and fills the rest with decorative modules in the body's dot shape, on the same grid. The symbol keeps a light ring of `margin` modules (at least `QR_CIRCLE_QUIET_MIN`, 3) that no decoration or edge enters, so decoders only see the real code. Outside the outline the image is transparent. `getLayoutMargin` gives the margin a code is drawn with; logos, print sizes (`getQRModuleCount`) and the scan score follow it. SVG, `QRCodeCanvas`, PNG, PDF and EPS draw the outline, image fills and angular gradients included.
- **Custom shapes.** `shape` also takes a `QRSilhouette`: a grid of at most 64 × 64 cells (`qrSilhouetteSchema`) traced from a picture's transparency or darkness by `loadQRSilhouette` (browser) or `createQRSilhouette` (pixels). The picture itself is never kept. The symbol sits in the middle of the shape's roomiest square. `getQRSilhouetteFit` says whether a silhouette is roomy enough (the symbol and its ring must take at least `QR_SILHOUETTE_MIN_SHARE` of the width) and why not; one that isn't draws as a square code. `getQRShapePath` gives a shape's outline for previews.
- Heart and silhouette codes decode with solid dot shapes and `square`, `rounded` and `gear` eyes at phone distances and in sharp renders (jsQR), and with zbar.

### Fixes

- The SVG reader behind PDF and EPS export no longer throws on character references outside Unicode (such as `&#x110000;`).
- The same reader now runs in linear time. Its regular expressions backtracked on hostile markup: 8 KB of unclosed `<!--` took over 30 seconds. It reads every input exactly as before.

### Unchanged

- `FRAME_STYLES`, `FrameStyle`, `QRFrame` and `frameSchema` still describe the built-in frames only, and every built-in frame draws exactly as before. `QRProps.frame` (and `qrPropsSchema`) now accept either kind: `AnyQRFrame` / `anyFrameSchema`.
