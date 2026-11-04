# Changelog

Release notes for earlier versions are at [qrdx.dev/changelog](https://qrdx.dev/changelog).

## 0.0.47 (not yet on npm)

npm's latest is 0.0.46, so these changes ship with the rest of 0.0.47.

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

### Fixes

- The SVG reader behind PDF and EPS export no longer throws on character references outside Unicode (such as `&#x110000;`).

### Unchanged

- `FRAME_STYLES`, `FrameStyle`, `QRFrame` and `frameSchema` still describe the built-in frames only, and every built-in frame draws exactly as before. `QRProps.frame` (and `qrPropsSchema`) now accept either kind: `AnyQRFrame` / `anyFrameSchema`.
