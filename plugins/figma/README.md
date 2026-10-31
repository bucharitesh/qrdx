# QRdx for Figma

A Figma plugin that inserts styled QR codes as vector layers, built with the [`qrdx`](../../packages/qrdx) library.

- Enter a URL or any text, pick one of 12 style presets (the same ones as the Chrome extension, taken from the QRdx playground), adjust the foreground and background colors, and choose a size (32 to 4096 px).
- **Insert QR code** adds a frame named `QR – <value>` at the center of the viewport, selects it and zooms to it. It is made of editable vector layers, so it stays sharp at any zoom.
- Every inserted code remembers its content and style (plugin data). Select one and the plugin offers **Replace selected QR**, which swaps in the new code while keeping the old one's on-canvas size, position, rotation, constraints and layer order. **Load its settings** copies the selected code's content and style into the form.
- Inserted codes get an **Edit QR code** button in Figma's right panel that reopens the plugin with that code's settings loaded.
- Follows Figma's light or dark theme. Warns when content is too long, when colors have low contrast, and when a code is light on dark.

## How it works

`src/ui.tsx` (the plugin window) renders the SVG with `qrdx` and sends it to `src/code.ts` (Figma's main thread), which calls `figma.createNodeFromSvg`, names the node, stores the settings with `setPluginData("qrdx", …)` and sets relaunch data. `src/messages.ts` holds the message types and validates everything the main thread receives. The plugin has no network access (`"allowedDomains": ["none"]`): nothing leaves Figma.

## Build

```bash
pnpm --filter @qrdx/figma-plugin build       # writes dist/code.js and dist/ui.html
pnpm --filter @qrdx/figma-plugin dev         # rebuild on change
pnpm --filter @qrdx/figma-plugin typecheck
```

`dist/ui.html` is a single file with the UI script and styles inlined, as Figma requires.

## Import for development

1. Build the plugin (above).
2. In the Figma desktop app, open a design file, then **Plugins → Development → Import plugin from manifest…** and select `plugins/figma/manifest.json`.
3. Run it from **Plugins → Development → QRdx**. After rebuilding, close and reopen the plugin to load the new code.

## Publishing (not done)

Figma assigns the plugin id when you first publish (**Plugins → Development → Manage plugins in development → Publish**); add it to `manifest.json` as `"id"` before publishing. Use `plugins/chrome/public/icons/icon-128.png` as the 128 × 128 icon.

## Figma Community listing copy

**Name:** QRdx — QR Code Generator

**Tagline:** Styled, scannable QR codes as editable vectors.

**Description:**

> Add QR codes to your designs without leaving Figma.
>
> Type a URL or any text, pick one of 12 styles (Classic, Minimal, Modern, Ocean Blue, Nature, Sunset, Lavender, Caffeine, Pastel Dream, Midnight, Neon, Cyberpunk), tweak the colors and size, and insert. QRdx places the code as editable vector layers, so it stays crisp at any size and exports cleanly to PNG, SVG or PDF.
>
> Need to change the link later? Select the code and click "Edit QR code" in the right panel, or use "Replace selected QR". The new code keeps the old one's size, position and rotation, so your layout doesn't move.
>
> QRdx checks your work as you go: it warns when the content is too long for a QR code, when the colors don't have enough contrast to scan reliably, and when a code is light on dark.
>
> Everything runs locally. The plugin has no network access and collects no data.
>
> Made by QRdx (qrdx.dev), the open-source QR code generator.

**Tags:** qr code, qr, qr generator, barcode, vector, svg, link, marketing, print, branding
