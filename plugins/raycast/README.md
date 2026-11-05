# QRdx for Raycast

A [Raycast](https://www.raycast.com) extension that makes styled QR codes, built with the [`qrdx`](../../packages/qrdx) library. It isn't in the Raycast Store yet, so you install it from source.

- **Generate QR:** enter a URL or text, pick body, eye and dot patterns from previews, colors, a decorative template and a logo. Copy the code as PNG or SVG, or save either to `~/Downloads`.
- **Saved QR Codes:** save a code's settings, then browse, edit and export them later. They're kept in Raycast's local storage.
- **Generate QR with AI:** describe the code you want and Raycast AI fills in the settings. This command and the AI tools in `ai.yaml` need access to Raycast AI.
- **Open in QRdx Playground** (⌘O) opens the full editor at qrdx.dev with the code's web address. Other content, colors and patterns stay in Raycast.

It depends on `qrdx` 0.0.46 from npm, so it offers that version's patterns.

## Install from source

You need Raycast, Node.js 22 (22.22.3 or later) and pnpm 10. From the root of this repository:

```bash
pnpm install
pnpm --filter qrdx-raycast dev     # ray develop: loads the extension into Raycast
```

The commands then show up in Raycast's root search. `pnpm --filter qrdx-raycast build` builds the extension without opening Raycast, and `pnpm --filter qrdx-raycast lint` runs Raycast's linter.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## License

[MIT](LICENSE)
